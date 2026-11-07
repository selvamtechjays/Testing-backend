import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// OWASP-recommended scrypt cost (N=2^15, r=8, p=3); recorded in the README (DEC-058).
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 3;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEMORY_BYTES = 128 * 1024 * 1024;
const FORMAT_TAG = 'scrypt';

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Hashes with a fresh per-user salt. Output: `scrypt$N$r$p$<salt hex>$<hash hex>`, self-describing. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const options = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAX_MEMORY_BYTES };
  const key = await derive(password, salt, options);
  const parts = [
    FORMAT_TAG,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('hex'),
    key.toString('hex'),
  ];
  return parts.join('$');
}

/** Checks a password against a stored hash in constant time. Malformed input verifies as false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [tag, n, r, p, saltHex, hashHex] = stored.split('$');
  if (tag !== FORMAT_TAG || !saltHex || !hashHex) return false;
  const options = { N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEMORY_BYTES };
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await derive(password, Buffer.from(saltHex, 'hex'), options).catch(() => null);
  return actual !== null && actual.length === expected.length && timingSafeEqual(actual, expected);
}
