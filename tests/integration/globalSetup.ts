import { MongoMemoryServer } from 'mongodb-memory-server';

let server: MongoMemoryServer | undefined;

/** Starts one ephemeral MongoDB for the whole integration run and exposes its URI via MONGODB_URI. */
export async function setup(): Promise<void> {
  server = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  process.env.MONGODB_URI = server.getUri('integration');
}

export async function teardown(): Promise<void> {
  await server?.stop();
}
