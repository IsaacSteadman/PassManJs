export function sanitizeUsername(name: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_\.$\-]*$/.test(name);
}
