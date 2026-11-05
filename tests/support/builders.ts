/** Generic typed builder: returns a fresh object each call, so tests never share mutable fixtures. */
export function build<T extends object>(defaults: T, overrides: Partial<T> = {}): T {
  return { ...structuredClone(defaults), ...overrides };
}
