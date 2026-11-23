import { createHash } from 'node:crypto';
import { ApiError } from '../lib/apiError.js';
import { createFixedWindowCounter, type WindowState } from '../middleware/rateLimit.js';

const MINUTE_MS = 60 * 1000;
// Fixed by decision (DEC-303), not configuration: sign-in 10 attempts per client address per 15 minutes,
// 5 failed attempts per username per 15 minutes, register 5 per client address per hour.
export const LOGIN_IP_MAX = 10;
export const LOGIN_IP_WINDOW_MS = 15 * MINUTE_MS;
export const LOGIN_USER_FAILURE_MAX = 5;
export const LOGIN_USER_FAILURE_WINDOW_MS = 15 * MINUTE_MS;
export const REGISTER_IP_MAX = 5;
export const REGISTER_IP_WINDOW_MS = 60 * MINUTE_MS;

// One body for every refusal, whatever the username or address (DEC-305).
export const RATE_LIMITED_MESSAGE = 'Too many attempts. Try again in a few minutes.';
const UNKNOWN_ADDRESS = 'unknown';
const IPV4_MAPPED_PREFIX = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** Fixed-length (43 char) key for a username, so a huge username cannot make a huge map key. */
export function usernameKey(username: string): string {
  return createHash('sha256').update(username).digest('base64url');
}

/** Rewrites a trailing dotted IPv4 part of an IPv6 address as two hex groups. */
function withHexTail(address: string): string {
  const lastColon = address.lastIndexOf(':');
  const tail = address.slice(lastColon + 1);
  if (!tail.includes('.')) return address;
  const [a = 0, b = 0, c = 0, d = 0] = tail.split('.').map(Number);
  const hex = (high: number, low: number) => ((high << 8) | low).toString(16);
  return `${address.slice(0, lastColon + 1)}${hex(a, b)}:${hex(c, d)}`;
}

function expandIpv6(address: string): string[] {
  const [head = '', rest, ...extra] = withHexTail(address).split('::');
  const headGroups = head === '' ? [] : head.split(':');
  if (rest === undefined || extra.length > 0) return headGroups;
  const restGroups = rest === '' ? [] : rest.split(':');
  const fill = Math.max(0, 8 - headGroups.length - restGroups.length);
  return [...headGroups, ...Array<string>(fill).fill('0'), ...restGroups];
}

/**
 * The key a client address is counted under: an IPv4-mapped IPv6 address counts as its IPv4 address,
 * and any other IPv6 address counts as its /64 network so one host cannot rotate through its range.
 */
export function addressKey(ip: string | undefined): string {
  if (ip === undefined || ip === '') return UNKNOWN_ADDRESS;
  const mapped = IPV4_MAPPED_PREFIX.exec(ip);
  if (mapped?.[1]) return mapped[1];
  if (!ip.includes(':')) return ip;
  const groups = expandIpv6(ip.split('%')[0] ?? ip)
    .slice(0, 4)
    .map((group) => (Number.parseInt(group, 16) || 0).toString(16));
  return `${groups.join(':')}::/64`;
}

export interface AuthThrottleLimits {
  loginIpMax: number;
  loginUserFailureMax: number;
  registerIpMax: number;
}

export interface AuthThrottleOptions {
  /** Time source in epoch milliseconds. */
  now?: () => number;
  /** Test-only override of the fixed limits; production code leaves it out. */
  limits?: Partial<AuthThrottleLimits>;
}

export interface AuthThrottle {
  /** Counts a sign-in attempt against the client address; throws 429 once it is over the limit. */
  checkLoginAddress(ip: string | undefined): void;
  /**
   * Throws 429 when the username's failures plus attempts already in flight reach the limit; otherwise
   * reserves one in-flight slot that `releaseLogin` must give back. Runs before any hashing.
   */
  checkLoginUsername(username: string): void;
  /** Gives back the in-flight slot taken by a successful `checkLoginUsername`. */
  releaseLogin(username: string): void;
  /** Counts one failed sign-in (wrong password or unknown username) against the username. */
  recordLoginFailure(username: string): void;
  /** Forgets the username's failures after a successful sign-in. */
  clearLogin(username: string): void;
  /** The keys the username counter holds (digests, never usernames); for tests. */
  usernameCounterKeys(): string[];
  /** Counts a registration against the client address; throws 429 once it is over the limit. */
  checkRegisterAddress(ip: string | undefined): void;
}

function refuse(state: WindowState): never {
  throw new ApiError(429, 'RATE_LIMITED', RATE_LIMITED_MESSAGE).withRetryAfter(
    state.retryAfterSeconds,
  );
}

/** The three auth limits, built per app and injected (DEC-307). Windows are fixed and in memory. */
export function createAuthThrottle(options: AuthThrottleOptions = {}): AuthThrottle {
  const now = options.now ?? Date.now;
  const loginIpMax = options.limits?.loginIpMax ?? LOGIN_IP_MAX;
  const loginUserFailureMax = options.limits?.loginUserFailureMax ?? LOGIN_USER_FAILURE_MAX;
  const registerIpMax = options.limits?.registerIpMax ?? REGISTER_IP_MAX;
  const loginIp = createFixedWindowCounter({ windowMs: LOGIN_IP_WINDOW_MS, max: loginIpMax, now });
  const loginUser = createFixedWindowCounter({
    windowMs: LOGIN_USER_FAILURE_WINDOW_MS,
    max: loginUserFailureMax,
    now,
  });
  const registerIp = createFixedWindowCounter({
    windowMs: REGISTER_IP_WINDOW_MS,
    max: registerIpMax,
    now,
  });

  const inFlight = new Map<string, number>();

  return {
    checkLoginAddress(ip) {
      const state = loginIp.hit(addressKey(ip));
      // The attempt that reaches the max is still allowed; the one after it is refused.
      if (state.count > loginIpMax) refuse(state);
    },
    checkLoginUsername(username) {
      const key = usernameKey(username);
      const state = loginUser.peek(key);
      const pending = inFlight.get(key) ?? 0;
      if (state.count + pending >= loginUserFailureMax) refuse(state);
      inFlight.set(key, pending + 1);
    },
    releaseLogin(username) {
      const key = usernameKey(username);
      const pending = (inFlight.get(key) ?? 0) - 1;
      if (pending > 0) inFlight.set(key, pending);
      else inFlight.delete(key);
    },
    recordLoginFailure(username) {
      loginUser.hit(usernameKey(username));
    },
    clearLogin(username) {
      loginUser.reset(usernameKey(username));
    },
    usernameCounterKeys: () => loginUser.keys(),
    checkRegisterAddress(ip) {
      const state = registerIp.hit(addressKey(ip));
      if (state.count > registerIpMax) refuse(state);
    },
  };
}
