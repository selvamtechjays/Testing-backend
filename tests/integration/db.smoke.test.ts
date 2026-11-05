import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { isMongoConnected } from '../../src/db/mongo.js';

// Harness smoke: proves the ephemeral DB, the real connection path, and between-test cleanup. Not a feature test.
describe('integration harness (smoke)', () => {
  const collection = () => mongoose.connection.collection('smoke');

  it('connects through src/db/mongo.ts', () => {
    expect(isMongoConnected()).toBe(true);
  });

  it('writes and reads a document', async () => {
    await collection().insertOne({ k: 'v' });
    expect(await collection().countDocuments()).toBe(1);
  });

  it('starts clean: the previous test data was removed', async () => {
    expect(await collection().countDocuments()).toBe(0);
  });
});
