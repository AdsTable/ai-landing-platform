import multer from "multer";
import path from "path";
import sharp from "sharp";
import { logger } from "../services/logger.js";

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'));
    }
};

// Multer configuration
export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Image optimization middleware
export const optimizeImage = async (req, res, next) => {
    if (!req.file) return next();

    try {
        const optimizedPath = req.file.path.replace(path.extname(req.file.path), '-optimized.webp');
        
        await sharp(req.file.path)
            .resize(1200, 1200, { 
                fit: 'inside',
                withoutEnlargement: true 
            })
            .webp({ quality: 85 })
            .toFile(optimizedPath);

        req.file.optimizedPath = optimizedPath;
        
        logger.info('Image optimized', { 
            original: req.file.path,
            optimized: optimizedPath 
        });

    } catch (error) {
        logger.error('Image optimization failed', { error: error.message });
    }

    next();
};
