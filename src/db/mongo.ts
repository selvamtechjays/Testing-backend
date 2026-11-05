import mongoose from 'mongoose';

/** Opens the single shared Mongoose connection. Called once at server start, never from request handlers. */
export async function connectToMongo(uri: string): Promise<typeof mongoose> {
  return mongoose.connect(uri);
}

export async function disconnectFromMongo(): Promise<void> {
  await mongoose.disconnect();
}

/** True when the shared connection is open (readyState 1). */
export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
