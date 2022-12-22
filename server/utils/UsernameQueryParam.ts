import type { Request, Response } from 'express';

export function sanitizeUsername(name: string) {
  if (typeof name !== 'string') return false;
  if (name === '.') return false;
  if (name === '..') return false;
  for (let i = 0; i < name.length; ++i) {
    const ch = name.charAt(i);
    if (!/[A-Za-z0-9_\.$\-]/.test(ch)) {
      return false;
    }
  }
  return true;
}

export function getUsernameStr(req: Request, res: Response): string | null {
  const username = <string>req.query.username;
  if (!sanitizeUsername(username)) {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'username',
      message: 'bad username characters',
    });
    return null;
  }
  return username;
}
