import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { connectToMongo, isMongoConnected } from './db/mongo.js';

async function main(): Promise<void> {
  const config = loadConfig();
  await connectToMongo(config.mongodbUri);
  const app = createApp({ isDbConnected: isMongoConnected });
  app.listen(config.port, () => {
    console.warn(`API listening on http://localhost:${config.port}`);
  });
}

main().catch((err: unknown) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
