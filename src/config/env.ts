const DEFAULT_PORT = 4000;
const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/testing-delivery-os';
const DEFAULT_LOG_LEVEL = 'info';
// Render puts exactly one proxy in front of the service (DEC-070); verify the real count against the host (DEC-306).
const DEFAULT_PRODUCTION_PROXY_HOPS = 1;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  port: number;
  mongodbUri: string;
  nodeEnv: string;
  /** Directory holding the built frontend; when unset the API serves no UI. */
  frontendDistDir?: string;
  /** Number of reverse proxies in front of the app whose `X-Forwarded-For` entries are trusted; 0 trusts none. */
  trustProxyHops: number;
  /** Minimum severity written to the JSON log. */
  logLevel: LogLevel;
}

function readTrustProxyHops(env: NodeJS.ProcessEnv, nodeEnv: string): number {
  const raw = env.TRUST_PROXY_HOPS;
  if (raw === undefined || raw === '') {
    return nodeEnv === 'production' ? DEFAULT_PRODUCTION_PROXY_HOPS : 0;
  }
  const hops = Number(raw.trim());
  if (!/^\d+$/.test(raw.trim()) || !Number.isSafeInteger(hops)) {
    throw new Error(`Invalid TRUST_PROXY_HOPS: ${raw}`);
  }
  return hops;
}

function readLogLevel(env: NodeJS.ProcessEnv): LogLevel {
  const raw = env.LOG_LEVEL;
  if (raw === undefined || raw === '') return DEFAULT_LOG_LEVEL;
  const level = LOG_LEVELS.find((candidate) => candidate === raw);
  if (!level) throw new Error(`Invalid LOG_LEVEL: ${raw}`);
  return level;
}

/** Reads configuration from the given environment (defaults to process.env) so tests can inject values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  const nodeEnv = env.NODE_ENV ?? 'development';
  return {
    port,
    mongodbUri: env.MONGODB_URI ?? DEFAULT_MONGODB_URI,
    nodeEnv,
    frontendDistDir: env.FRONTEND_DIST_DIR || undefined,
    trustProxyHops: readTrustProxyHops(env, nodeEnv),
    logLevel: readLogLevel(env),
  };
}
