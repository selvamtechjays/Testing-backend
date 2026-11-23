import { createApp } from './app.js';
import { loadConfig, type AppConfig } from './config/env.js';
import { connectToMongo, isMongoConnected } from './db/mongo.js';
import { createLogger, type Logger } from './lib/logger.js';
import { Session } from './models/Session.js';
import { Tag } from './models/Tag.js';
import { Task } from './models/Task.js';
import { User } from './models/User.js';

async function start(config: AppConfig, logger: Logger): Promise<void> {
  await connectToMongo(config.mongodbUri);
  // Unique, TTL and per-owner indexes must exist before the first request, or duplicate usernames could slip in.
  await Promise.all([User.init(), Session.init(), Task.init(), Tag.init()]);
  const app = createApp({
    isDbConnected: isMongoConnected,
    secureCookies: config.nodeEnv === 'production',
    // The per-address auth limits trust this many proxy hops (DEC-306); the count is verified against the host.
    trustProxyHops: config.trustProxyHops,
    frontendDistDir: config.frontendDistDir,
    logger,
  });
  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'API listening');
  });
}

function main(): void {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (err) {
    createLogger('info').fatal({ err }, 'Invalid configuration');
    process.exit(1);
  }
  const logger = createLogger(config.logLevel);
  start(config, logger).catch((err: unknown) => {
    logger.fatal({ err }, 'Failed to start API');
    process.exit(1);
  });
}

main();
