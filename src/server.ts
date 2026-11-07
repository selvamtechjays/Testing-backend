import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { connectToMongo, isMongoConnected } from './db/mongo.js';
import { Session } from './models/Session.js';
import { User } from './models/User.js';

async function main(): Promise<void> {
  const config = loadConfig();
  await connectToMongo(config.mongodbUri);
  // Unique and TTL indexes must exist before the first request, or duplicate usernames could slip in.
  await Promise.all([User.init(), Session.init()]);
  const app = createApp({
    isDbConnected: isMongoConnected,
    secureCookies: config.nodeEnv === 'production',
  });
  app.listen(config.port, () => {
    console.warn(`API listening on http://localhost:${config.port}`);
  });
}

main().catch((err: unknown) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
