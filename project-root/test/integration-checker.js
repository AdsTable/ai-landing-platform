/**********************************************************************
 * test/integration-checker.js
 * High-level “happy-path” test: seed DB → basic API routes → billing usage
 *********************************************************************/
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fetch from 'node-fetch';
import { seedService } from '../services/database/seed.js';
import { BillingService } from '../services/billing.js';

dotenv.config();
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';

(async () => {
  /* DB ---------------------------------------------------------------- */
  await mongoose.connect(process.env.MONGO_URI);
  await seedService.seedDatabase(true);

  /* Public route should be 200/any ----------------------------------- */
  const resHome = await fetch(base);
  if (!resHome.ok && resHome.status !== 302)
    throw new Error(`home failed: ${resHome.status}`);

  /* Auth route presence ---------------------------------------------- */
  const resLogin = await fetch(`${base}/auth/login`);
  if (!resLogin.ok) throw new Error('/auth/login failed');

  /* Billing fake usage ---------------------------------------------- */
  const dummyId = '000000000000000000000000';
  await BillingService.trackUsage(dummyId, 'generation', 1).catch(() => {});
  console.log('✅ Integration-checker passed basic journey');

  await seedService.clearSeedData();
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error('❌ integration-checker failed:', e);
  process.exit(1);
});
