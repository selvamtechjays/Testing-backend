import { Writable } from 'node:stream';

export type LogLine = Record<string, unknown> & {
  level: number;
  msg: string;
  requestId?: string;
  err?: { message: string; stack: string };
};

/** A pino destination that keeps every written line, so tests can read what was logged. */
export function createLogLines() {
  const raw: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      raw.push(chunk.toString());
      done();
    },
  });
  return {
    stream,
    raw: (): string => raw.join(''),
    parsed: (): LogLine[] =>
      raw
        .join('')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as LogLine),
  };
}
