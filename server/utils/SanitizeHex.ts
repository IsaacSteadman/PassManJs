export function sanitizeHex(str: string) {
  if (typeof str !== 'string') return false;
  return /^(?:[0-9A-Fa-f]{2})*$/.test(str);
}
