/**********************************************************************
 * test/run-all-tests.js
 * One-click orchestrator for the whole suite.
 *********************************************************************/
import { spawn } from 'child_process';
import path from 'path';

const list = [
  { n: 'Routes', f: 'routes-checker.js' },
  { n: 'Services', f: 'services-checker.js' },
  { n: 'Database', f: 'database-checker.js' },
  { n: 'Integration', f: 'integration-checker.js' },
];

(async () => {
  let failed = 0;

  for (const t of list) {
    console.log(`\n========== Running ${t.n} tests ==========\n`);
    const p = spawn('node', [path.join('test', t.f)], { stdio: 'inherit' });
    const code = await new Promise((r) => p.on('close', r));
    if (code !== 0) failed++;
  }

  console.log('\n========== Summary ==========');
  console.log(`Passed: ${list.length - failed}, Failed: ${failed}`);
  process.exit(failed ? 1 : 0);
})();
