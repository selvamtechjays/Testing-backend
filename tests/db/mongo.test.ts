import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { connectToMongo, disconnectFromMongo, isMongoConnected } from '../../src/db/mongo.js';

// Harness smoke: shows the vi.spyOn pattern for the mongoose singleton. No real DB is touched.
describe('src/db/mongo (mongoose double)', () => {
  it('connectToMongo passes the uri to mongoose.connect', async () => {
    const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    await connectToMongo('mongodb://example/test');
    expect(connect).toHaveBeenCalledWith('mongodb://example/test');
  });

  it('disconnectFromMongo calls mongoose.disconnect', async () => {
    const disconnect = vi.spyOn(mongoose, 'disconnect').mockResolvedValue();
    await disconnectFromMongo();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('isMongoConnected reflects readyState', () => {
    const state = vi.spyOn(mongoose.connection, 'readyState', 'get');
    state.mockReturnValue(mongoose.ConnectionStates.connected);
    expect(isMongoConnected()).toBe(true);
    state.mockReturnValue(mongoose.ConnectionStates.disconnected);
    expect(isMongoConnected()).toBe(false);
  });
});
