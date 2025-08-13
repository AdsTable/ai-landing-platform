import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { createGzip, createGunzip } from "zlib";
import { logger } from "../logger.js";

class BackupService {
    constructor() {
        this.backupPath = path.resolve('backups');
        this.dbName = this.extractDbName(process.env.MONGO_URI);
        this.mongoUri = process.env.MONGO_URI;
    }

    extractDbName(uri) {
        try {
            const match = uri.match(/\/([^/?]+)(\?|$)/);
            return match ? match[1] : 'ai-landing';
        } catch (error) {
            return 'ai-landing';
        }
    }

    /**
     * Initialize backup service
     */
    async initialize() {
        // Ensure backup directory exists
        if (!fs.existsSync(this.backupPath)) {
            fs.mkdirSync(this.backupPath, { recursive: true });
            logger.info('Backup directory created', { path: this.backupPath });
        }

        logger.info('Backup service initialized', { 
            backupPath: this.backupPath,
            dbName: this.dbName 
        });
    }

    /**
     * Create database backup
     */
    async createBackup(description = '') {
        return new Promise((resolve, reject) => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `backup_${this.dbName}_${timestamp}.gz`;
            const filepath = path.join(this.backupPath, filename);
            const tempDumpPath = path.join(this.backupPath, `temp_${timestamp}`);

            logger.info('Starting database backup', { 
                filename,
                description,
                dbName: this.dbName 
            });

            // Create mongodump process
            const mongodump = spawn('mongodump', [
                '--uri', this.mongoUri,
                '--out', tempDumpPath
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stderr = '';
            mongodump.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            mongodump.on('close', async (code) => {
                if (code !== 0) {
                    logger.error('Mongodump failed', { 
                        code, 
                        error: stderr 
                    });
                    return reject(new Error(`Mongodump failed: ${stderr}`));
                }

                try {
                    // Compress the dump directory
                    await this.compressDirectory(tempDumpPath, filepath);
                    
                    // Clean up temp directory
                    await this.removeDirectory(tempDumpPath);

                    // Get file size
                    const stats = fs.statSync(filepath);
                    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

                    const backup = {
                        filename,
                        filepath,
                        timestamp: new Date(),
                        description,
                        size: `${sizeInMB} MB`,
                        dbName: this.dbName
                    };

                    // Save backup metadata
                    await this.saveBackupMetadata(backup);

                    logger.info('Database backup completed', backup);
                    resolve(backup);

                } catch (error) {
                    logger.error('Backup compression failed', { error: error.message });
                    reject(error);
                }
            });

            mongodump.on('error', (error) => {
                logger.error('Mongodump process error', { error: error.message });
                reject(error);
            });
        });
    }

    /**
     * Restore database from backup
     */
    async restoreBackup(filename) {
        return new Promise(async (resolve, reject) => {
            const filepath = path.join(this.backupPath, filename);
            
            if (!fs.existsSync(filepath)) {
                return reject(new Error(`Backup file not found: ${filename}`));
            }

            const timestamp = Date.now();
            const tempRestorePath = path.join(this.backupPath, `restore_${timestamp}`);

            logger.info('Starting database restore', { 
                filename,
                dbName: this.dbName 
            });

            try {
                // Decompress backup
                await this.decompressFile(filepath, tempRestorePath);

                // Find the database directory in the extracted files
                const dbPath = path.join(tempRestorePath, this.dbName);
                
                if (!fs.existsSync(dbPath)) {
                    throw new Error(`Database directory not found in backup: ${this.dbName}`);
                }

                // Create mongorestore process
                const mongorestore = spawn('mongorestore', [
                    '--uri', this.mongoUri,
                    '--drop', // Drop existing collections before restore
                    dbPath
                ], {
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                let stderr = '';
                mongorestore.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                mongorestore.on('close', async (code) => {
                    // Clean up temp directory
                    await this.removeDirectory(tempRestorePath);

                    if (code !== 0) {
                        logger.error('Mongorestore failed', { 
                            code, 
                            error: stderr 
                        });
                        return reject(new Error(`Mongorestore failed: ${stderr}`));
                    }

                    logger.info('Database restore completed', { 
                        filename,
                        dbName: this.dbName 
                    });
                    
                    resolve({
                        filename,
                        restoredAt: new Date(),
                        dbName: this.dbName
                    });
                });

                mongorestore.on('error', (error) => {
                    logger.error('Mongorestore process error', { error: error.message });
                    reject(error);
                });

            } catch (error) {
                logger.error('Backup restore failed', { error: error.message });
                reject(error);
            }
        });
    }

    /**
     * List available backups
     */
    async listBackups() {
        try {
            const files = fs.readdirSync(this.backupPath)
                .filter(file => file.endsWith('.gz') && file.startsWith('backup_'))
                .map(file => {
                    const stats = fs.statSync(path.join(this.backupPath, file));
                    return {
                        filename: file,
                        size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
                        created: stats.birthtime,
                        modified: stats.mtime
                    };
                })
                .sort((a, b) => b.created - a.created);

            return files;

        } catch (error) {
            logger.error('Failed to list backups', { error: error.message });
            return [];
        }
    }

    /**
     * Delete backup file
     */
    async deleteBackup(filename) {
        try {
            const filepath = path.join(this.backupPath, filename);
            
            if (!fs.existsSync(filepath)) {
                throw new Error(`Backup file not found: ${filename}`);
            }

            fs.unlinkSync(filepath);
            
            logger.info('Backup deleted', { filename });
            return true;

        } catch (error) {
            logger.error('Failed to delete backup', { 
                filename, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Compress directory to gzip file
     */
    async compressDirectory(sourceDir, targetFile) {
        return new Promise((resolve, reject) => {
            const tar = spawn('tar', ['-czf', targetFile, '-C', path.dirname(sourceDir), path.basename(sourceDir)]);
            
            tar.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Compression failed with code ${code}`));
                }
            });

            tar.on('error', reject);
        });
    }

    /**
     * Decompress gzip file
     */
    async decompressFile(sourceFile, targetDir) {
        return new Promise((resolve, reject) => {
            const tar = spawn('tar', ['-xzf', sourceFile, '-C', targetDir]);
            
            // Ensure target directory exists
            fs.mkdirSync(targetDir, { recursive: true });
            
            tar.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Decompression failed with code ${code}`));
                }
            });

            tar.on('error', reject);
        });
    }

    /**
     * Remove directory recursively
     */
    async removeDirectory(dirPath) {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    }

    /**
     * Save backup metadata
     */
    async saveBackupMetadata(backup) {
        const metadataFile = path.join(this.backupPath, 'backups.json');
        let metadata = [];

        if (fs.existsSync(metadataFile)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
            } catch (error) {
                logger.warn('Failed to read backup metadata', { error: error.message });
            }
        }

        metadata.push(backup);
        
        // Keep only last 50 backup records
        metadata = metadata.slice(-50);

        fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    }

    /**
     * Schedule automatic backups
     */
    scheduleAutomaticBackups(cronSchedule = '0 2 * * *') {
        const cron = require('node-cron');
        
        cron.schedule(cronSchedule, async () => {
            try {
                logger.info('Starting scheduled backup');
                await this.createBackup('Automatic scheduled backup');
                
                // Clean old backups (keep last 7 days)
                await this.cleanOldBackups(7);
                
            } catch (error) {
                logger.error('Scheduled backup failed', { error: error.message });
            }
        });

        logger.info('Automatic backups scheduled', { schedule: cronSchedule });
    }

    /**
     * Clean old backups
     */
    async cleanOldBackups(daysToKeep = 7) {
        try {
            const backups = await this.listBackups();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            const oldBackups = backups.filter(backup => backup.created < cutoffDate);
            
            for (const backup of oldBackups) {
                await this.deleteBackup(backup.filename);
            }

            if (oldBackups.length > 0) {
                logger.info('Old backups cleaned', { 
                    deleted: oldBackups.length,
                    daysToKeep 
                });
            }

        } catch (error) {
            logger.error('Failed to clean old backups', { error: error.message });
        }
    }
}

export const backupService = new BackupService();
export default backupService;
