export function lpad(
  n: number,
  s: string | { toString(): string },
  ch: string = '0'
) {
  const str = `${s}`;
  return ch.repeat(Math.max(0, n - str.length)) + s;
}
