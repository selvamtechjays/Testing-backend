import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { connectToMongo, disconnectFromMongo } from '../../src/db/mongo.js';
import { Tag } from '../../src/models/Tag.js';

beforeAll(async () => {
  await connectToMongo(process.env.MONGODB_URI as string);
  // Both unique indexes must exist before the first test, or a race could start before they do (R-1).
  await Tag.init();
});

/** Isolation: every collection is emptied between tests. */
afterEach(async () => {
  const collections = await mongoose.connection.db?.collections();
  await Promise.all((collections ?? []).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await disconnectFromMongo();
});
