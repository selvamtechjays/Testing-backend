// tier: unit
// requires: nothing (pure schema checks; no DB, no network)
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/lib/apiError.js';
import { parseBody } from '../../src/lib/parseBody.js';
import { TAG_ID_PATTERN, TAG_NOT_FOUND } from '../../src/lib/tagId.js';
import {
  DEFAULT_COLOUR,
  TAG_COLOURS,
  TAG_LIMIT,
  TAG_MESSAGES,
  TAG_NAME_MAX,
  createTagSchema,
  updateTagSchema,
} from '../../src/lib/tagFields.js';

/** The per-field messages of the refusal the schema raises for a body. */
function refusalFields(body: unknown): Record<string, string> {
  try {
    parseBody(createTagSchema, body);
  } catch (error) {
    if (error instanceof ApiError) return error.fields ?? {};
    throw error;
  }
  throw new Error('expected the body to be refused');
}

describe('tag field rules (Task-25, FEAT-TAG-01)', () => {
  it('exposes the six colours, the default gray, the 30-unit name limit and the 50-tag limit (BR-4, BR-5)', () => {
    expect(TAG_COLOURS).toEqual(['gray', 'red', 'orange', 'green', 'blue', 'purple']);
    expect(DEFAULT_COLOUR).toBe('gray');
    expect(TAG_NAME_MAX).toBe(30);
    expect(TAG_LIMIT).toBe(50);
  });

  it('accepts a name of 1 character and a name of 30 characters (AC-5)', () => {
    expect(parseBody(createTagSchema, { name: 'a' }).name).toBe('a');
    const longest = 'n'.repeat(TAG_NAME_MAX);
    expect(parseBody(createTagSchema, { name: longest }).name).toBe(longest);
  });

  it('refuses a name of 31 characters, naming name (AC-9)', () => {
    expect(refusalFields({ name: 'n'.repeat(TAG_NAME_MAX + 1) })).toEqual({
      name: TAG_MESSAGES.nameTooLong,
    });
  });

  it('counts 15 emoji (30 code units) as acceptable and 16 as too long (AC-9, BR-3)', () => {
    expect(parseBody(createTagSchema, { name: '😀'.repeat(15) }).name).toBe('😀'.repeat(15));
    expect(refusalFields({ name: '😀'.repeat(16) })).toEqual({ name: TAG_MESSAGES.nameTooLong });
  });

  it('trims spaces at the ends and keeps spaces inside (AC-6)', () => {
    expect(parseBody(createTagSchema, { name: '  Home  ' }).name).toBe('Home');
    expect(parseBody(createTagSchema, { name: ' a  b ' }).name).toBe('a  b');
  });

  it('returns "Q&A" and "🏠 Home" exactly as typed (AC-6)', () => {
    expect(parseBody(createTagSchema, { name: 'Q&A' }).name).toBe('Q&A');
    expect(parseBody(createTagSchema, { name: '🏠 Home' }).name).toBe('🏠 Home');
  });

  it('keeps markup as literal text (AC-13)', () => {
    const markup = '<img src=x onerror=alert(1)>';
    expect(parseBody(createTagSchema, { name: markup }).name).toBe(markup);
  });

  it('refuses an empty, whitespace-only or missing name with the required message, naming name (AC-8)', () => {
    for (const body of [{ name: '' }, { name: '   ' }, {}, { colour: 'red' }]) {
      expect(refusalFields(body), JSON.stringify(body)).toEqual({
        name: TAG_MESSAGES.nameRequired,
      });
    }
  });

  it('refuses a name that is not text, naming name (AC-8)', () => {
    for (const name of [42, null, true, ['a'], { a: 1 }]) {
      expect(refusalFields({ name }), String(name)).toEqual({ name: TAG_MESSAGES.nameType });
    }
  });

  it('accepts each of the six colours and leaves the colour absent when it is left out (AC-2, BR-4)', () => {
    for (const colour of TAG_COLOURS) {
      expect(parseBody(createTagSchema, { name: 'x', colour }).colour).toBe(colour);
    }
    expect(parseBody(createTagSchema, { name: 'x' }).colour).toBeUndefined();
  });

  it('refuses a colour outside the six, naming colour (AC-10, BR-4)', () => {
    for (const colour of ['pink', 'Gray', '', null, 3]) {
      expect(refusalFields({ name: 'x', colour }), String(colour)).toEqual({
        colour: TAG_MESSAGES.colour,
      });
    }
  });

  it('strips keys it does not know, so ownerId and slot can never be written (BR-1)', () => {
    const parsed = parseBody(createTagSchema, { name: 'x', ownerId: 'someone', slot: 7, id: 'z' });
    expect(parsed).toEqual({ name: 'x' });
  });
});

describe('tag update rule (Task-33, FEAT-TAG-02)', () => {
  const refusal = (body: unknown): Record<string, string> => {
    try {
      parseBody(updateTagSchema, body);
    } catch (error) {
      if (error instanceof ApiError) return error.fields ?? {};
      throw error;
    }
    throw new Error('expected the body to be refused');
  };

  it('accepts a name alone, a colour alone and both together (AC-2, AC-3)', () => {
    expect(parseBody(updateTagSchema, { name: 'Office' })).toEqual({ name: 'Office' });
    expect(parseBody(updateTagSchema, { colour: 'blue' })).toEqual({ colour: 'blue' });
    expect(parseBody(updateTagSchema, { name: ' Office ', colour: 'red' })).toEqual({
      name: 'Office',
      colour: 'red',
    });
  });

  it('refuses a body with neither a name nor a colour, under body (AC-12, BR-3)', () => {
    expect(TAG_MESSAGES.updateEmpty).toBe('Provide a name or a colour.');
    for (const body of [{}, { ownerId: 'x' }, { slot: 3 }]) {
      expect(refusal(body), JSON.stringify(body)).toEqual({ body: TAG_MESSAGES.updateEmpty });
    }
  });

  it('applies the create name rule to a rename: empty and 31 characters are refused, 30 is accepted (AC-10, BR-1)', () => {
    expect(refusal({ name: '' })).toEqual({ name: TAG_MESSAGES.nameRequired });
    expect(refusal({ name: '   ' })).toEqual({ name: TAG_MESSAGES.nameRequired });
    expect(refusal({ name: 'n'.repeat(TAG_NAME_MAX + 1) })).toEqual({
      name: TAG_MESSAGES.nameTooLong,
    });
    expect(refusal({ name: 7 })).toEqual({ name: TAG_MESSAGES.nameType });
    expect(parseBody(updateTagSchema, { name: 'n'.repeat(TAG_NAME_MAX) }).name).toHaveLength(30);
  });

  it('applies the create colour rule to a recolour, naming colour (AC-11, BR-2)', () => {
    for (const colour of ['pink', '', null, 3]) {
      expect(refusal({ colour }), String(colour)).toEqual({ colour: TAG_MESSAGES.colour });
    }
  });

  it('reports a refused name and a refused colour together (AC-10, AC-11)', () => {
    expect(refusal({ name: '', colour: 'pink' })).toEqual({
      name: TAG_MESSAGES.nameRequired,
      colour: TAG_MESSAGES.colour,
    });
  });

  it('ignores ownerId and slot in an update body, so they can never be written (BR-10)', () => {
    expect(parseBody(updateTagSchema, { name: 'x', ownerId: 'o', slot: 1 })).toEqual({ name: 'x' });
  });
});

describe('tag id path rule (Task-33, AC-14)', () => {
  it('accepts 24 hex characters in either case and nothing else', () => {
    expect(TAG_ID_PATTERN.test('0123456789abcdef01234567')).toBe(true);
    expect(TAG_ID_PATTERN.test('0123456789ABCDEF01234567')).toBe(true);
    for (const bad of [
      '',
      'abc',
      '0123456789abcdef0123456',
      '0123456789abcdef012345678',
      'g'.repeat(24),
    ]) {
      expect(TAG_ID_PATTERN.test(bad), bad).toBe(false);
    }
  });

  it('words the not-found message once for a missing, malformed and foreign tag', () => {
    expect(TAG_NOT_FOUND).toBe('Tag not found.');
  });
});
