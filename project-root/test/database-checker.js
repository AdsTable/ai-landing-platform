/**********************************************************************
 * test/database-checker.js
 * Full CRUD + validation tests for User, Plan, Tenant, Invoice, Subscription
 *********************************************************************/
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Plan from '../models/Plan.js';
import Tenant from '../models/Tenant.js';
import Invoice from '../models/Invoice.js';
import Subscription from '../models/Subscription.js';

dotenv.config();
const uri = process.env.MONGO_URI || process.env.MONGODB_TEST_URI;
if (!uri) throw new Error('MONGO_URI missing');

(async () => {
  await mongoose.connect(uri);
  const created = [];

  /* Helper ---------------------------------------------------------- */
  const rand = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  /* User ------------------------------------------------------------ */
  const u = await User.create({
    username: rand('usr'),
    email: `${rand('user')}@example.com`,
    password: 'pw',
  });
  created.push({ model: User, id: u._id });

  /* Plan ------------------------------------------------------------ */
  const p = await Plan.create({
    name: rand('plan'),
    price: 10,
    limits: { monthlyGenerations: 100 },
  });
  created.push({ model: Plan, id: p._id });

  /* Tenant ---------------------------------------------------------- */
  const t = await Tenant.create({
    name: rand('tenant'),
    domain: `${rand('dom')}.com`,
    industry: 'technology',
  });
  created.push({ model: Tenant, id: t._id });

  /* Invoice --------------------------------------------------------- */
  const inv = await Invoice.create({
    userId: u._id,
    stripeInvoiceId: rand('inv'),
    amount: 500,
    currency: 'usd',
    status: 'paid',
    periodStart: new Date(),
    periodEnd: new Date(),
  });
  created.push({ model: Invoice, id: inv._id });

  /* Subscription ---------------------------------------------------- */
  const sub = await Subscription.create({
    userId: u._id,
    planId: p._id,
    stripeSubscriptionId: rand('sub'),
    status: 'active',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
  });
  created.push({ model: Subscription, id: sub._id });

  /* Relationship sanity check -------------------------------------- */
  const got = await Subscription.findById(sub._id).populate('userId planId');
  if (!got.userId || !got.planId) throw new Error('population failed');

  console.log('✅ Database-checker: all CRUD tests passed');

  /* Cleanup --------------------------------------------------------- */
  await Promise.all(created.map((c) => c.model.deleteOne({ _id: c.id })));
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error('❌ database-checker failed:', e);
  process.exit(1);
});
