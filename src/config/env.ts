const DEFAULT_PORT = 4000;
const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/testing-delivery-os';

export interface AppConfig {
  port: number;
  mongodbUri: string;
  nodeEnv: string;
}

/** Reads configuration from the given environment (defaults to process.env) so tests can inject values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  return {
    port,
    mongodbUri: env.MONGODB_URI ?? DEFAULT_MONGODB_URI,
    nodeEnv: env.NODE_ENV ?? 'development',
  };
}
