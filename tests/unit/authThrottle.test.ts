// tier: unit
// requires: nothing (in-memory throttle with an injected clock)
import { describe, expect, it } from 'vitest';
import {
  LOGIN_IP_MAX,
  LOGIN_IP_WINDOW_MS,
  LOGIN_USER_FAILURE_MAX,
  RATE_LIMITED_MESSAGE,
  REGISTER_IP_MAX,
  LOGIN_USER_FAILURE_WINDOW_MS,
  REGISTER_IP_WINDOW_MS,
  addressKey,
  createAuthThrottle,
  usernameKey,
} from '../../src/auth/authThrottle.js';
import { ApiError } from '../../src/lib/apiError.js';

function setup() {
  let nowMs = 5_000_000;
  const throttle = createAuthThrottle({ now: () => nowMs });
  return {
    throttle,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

function refusal(fn: () => void): ApiError {
  try {
    fn();
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('expected a RATE_LIMITED refusal');
}

describe('auth throttle constants (DEC-303)', () => {
  it('uses 10 / 5 / 5 attempts and 15 min / 15 min / 1 h windows', () => {
    expect([LOGIN_IP_MAX, LOGIN_USER_FAILURE_MAX, REGISTER_IP_MAX]).toEqual([10, 5, 5]);
    expect(LOGIN_IP_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(REGISTER_IP_WINDOW_MS).toBe(60 * 60 * 1000);
  });
});

describe('sign-in address limit (AC-1)', () => {
  it('allows 10 attempts from one address and refuses the 11th with RATE_LIMITED', () => {
    const { throttle } = setup();
    for (let i = 0; i < 10; i += 1) throttle.checkLoginAddress('203.0.113.5');
    const err = refusal(() => throttle.checkLoginAddress('203.0.113.5'));
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.message).toBe(RATE_LIMITED_MESSAGE);
    expect(err.fields).toBeUndefined();
    expect(err.retryAfterSeconds).toBe(900);
  });

  it('keeps another address unaffected and lets the first back in after 15 minutes', () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 10; i += 1) throttle.checkLoginAddress('203.0.113.5');
    expect(refusal(() => throttle.checkLoginAddress('203.0.113.5')).code).toBe('RATE_LIMITED');
    expect(() => throttle.checkLoginAddress('203.0.113.6')).not.toThrow();
    advance(LOGIN_IP_WINDOW_MS - 1);
    expect(refusal(() => throttle.checkLoginAddress('203.0.113.5')).code).toBe('RATE_LIMITED');
    advance(1);
    expect(() => throttle.checkLoginAddress('203.0.113.5')).not.toThrow();
  });

  it('counts an IPv4-mapped address as its IPv4 address and an IPv6 address by its /64', () => {
    const { throttle } = setup();
    for (let i = 0; i < 10; i += 1) throttle.checkLoginAddress('203.0.113.5');
    expect(refusal(() => throttle.checkLoginAddress('::ffff:203.0.113.5')).code).toBe(
      'RATE_LIMITED',
    );
    for (let i = 0; i < 10; i += 1) throttle.checkLoginAddress(`2001:db8:1:2::${i + 1}`);
    expect(refusal(() => throttle.checkLoginAddress('2001:db8:1:2:ffff::9')).code).toBe(
      'RATE_LIMITED',
    );
    expect(() => throttle.checkLoginAddress('2001:db8:1:3::1')).not.toThrow();
  });

  it('treats an unknown address as one shared bucket rather than skipping the limit', () => {
    const { throttle } = setup();
    for (let i = 0; i < 10; i += 1) throttle.checkLoginAddress(undefined);
    expect(refusal(() => throttle.checkLoginAddress(undefined)).code).toBe('RATE_LIMITED');
  });
});

describe('sign-in username failure limit (AC-1)', () => {
  it('refuses once 5 failures are recorded and not before', () => {
    const { throttle } = setup();
    for (let i = 0; i < 5; i += 1) {
      expect(() => throttle.checkLoginUsername('priya_b')).not.toThrow();
      throttle.recordLoginFailure('priya_b');
      throttle.releaseLogin('priya_b');
    }
    const err = refusal(() => throttle.checkLoginUsername('priya_b'));
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryAfterSeconds).toBe(900);
    expect(() => throttle.checkLoginUsername('someone_else')).not.toThrow();
  });

  it('checking never counts: only recorded failures do', () => {
    const { throttle } = setup();
    for (let i = 0; i < 20; i += 1) {
      throttle.checkLoginUsername('priya_b');
      throttle.releaseLogin('priya_b');
    }
    expect(() => throttle.checkLoginUsername('priya_b')).not.toThrow();
  });

  it('forgets the failures after a successful sign-in', () => {
    const { throttle } = setup();
    for (let i = 0; i < 4; i += 1) throttle.recordLoginFailure('priya_b');
    throttle.clearLogin('priya_b');
    throttle.recordLoginFailure('priya_b');
    expect(() => throttle.checkLoginUsername('priya_b')).not.toThrow();
  });

  it('lets the username back in once the 15 minute window has passed', () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 5; i += 1) throttle.recordLoginFailure('priya_b');
    advance(LOGIN_USER_FAILURE_WINDOW_MS - 1);
    expect(refusal(() => throttle.checkLoginUsername('priya_b')).code).toBe('RATE_LIMITED');
    advance(1);
    expect(() => throttle.checkLoginUsername('priya_b')).not.toThrow();
  });

  it('refuses the 6th of 6 concurrent attempts, because in-flight attempts count', () => {
    const { throttle } = setup();
    for (let i = 0; i < 5; i += 1)
      expect(() => throttle.checkLoginUsername('priya_b')).not.toThrow();
    expect(refusal(() => throttle.checkLoginUsername('priya_b')).code).toBe('RATE_LIMITED');
    throttle.releaseLogin('priya_b');
    expect(() => throttle.checkLoginUsername('priya_b')).not.toThrow();
  });

  it('keys a 100,000 character username under a 43 character digest and keeps near-twins apart', () => {
    const { throttle } = setup();
    const huge = 'a'.repeat(100_000);
    expect(usernameKey(huge)).toHaveLength(43);
    expect(usernameKey(huge)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (let i = 0; i < 5; i += 1) throttle.recordLoginFailure(huge);
    expect(throttle.usernameCounterKeys()).toEqual([usernameKey(huge)]);
    expect(refusal(() => throttle.checkLoginUsername(huge)).code).toBe('RATE_LIMITED');
    expect(() => throttle.checkLoginUsername(`${huge}b`)).not.toThrow();
  });

  it('answers the same body whichever username is refused (nothing to enumerate)', () => {
    const { throttle } = setup();
    for (let i = 0; i < 5; i += 1) {
      throttle.recordLoginFailure('exists_1');
      throttle.recordLoginFailure('nobody_9');
    }
    const a = refusal(() => throttle.checkLoginUsername('exists_1'));
    const b = refusal(() => throttle.checkLoginUsername('nobody_9'));
    expect([a.status, a.code, a.message, a.fields]).toEqual([
      b.status,
      b.code,
      b.message,
      b.fields,
    ]);
  });
});

describe('register address limit (AC-2)', () => {
  it('allows 5 registrations from one address and refuses the 6th with RATE_LIMITED', () => {
    const { throttle } = setup();
    for (let i = 0; i < 5; i += 1) throttle.checkRegisterAddress('198.51.100.7');
    const err = refusal(() => throttle.checkRegisterAddress('198.51.100.7'));
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(3600);
    expect(() => throttle.checkRegisterAddress('198.51.100.8')).not.toThrow();
  });

  it('is independent of the sign-in limit for the same address', () => {
    const { throttle } = setup();
    for (let i = 0; i < 10; i += 1) throttle.checkLoginAddress('198.51.100.7');
    expect(() => throttle.checkRegisterAddress('198.51.100.7')).not.toThrow();
  });
});

describe('client address key', () => {
  it('strips the IPv4-mapped prefix and leaves IPv4 alone', () => {
    expect(addressKey('::ffff:203.0.113.5')).toBe('203.0.113.5');
    expect(addressKey('203.0.113.5')).toBe('203.0.113.5');
  });

  it('reduces an IPv6 address to its first four groups, expanding ::', () => {
    expect(addressKey('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:db8:1:2::9')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressKey('::1')).toBe('0:0:0:0::/64');
    expect(addressKey('2001:0DB8:0001:0002::1')).toBe(addressKey('2001:db8:1:2::2'));
  });

  it('uses one shared key for a missing address', () => {
    expect(addressKey(undefined)).toBe('unknown');
  });
});
