import type { Request, Response } from 'express';
import { sanitizeHex } from './SanitizeHex';

export const sanitizePassword = sanitizeHex;

export function getPassword(req: Request, res: Response): Buffer | null {
  const passwordHex = <string>req.query.password;
  if (!sanitizePassword(passwordHex)) {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'password',
      message: 'bad password characters',
    });
    return null;
  }
  return Buffer.from(passwordHex, 'hex');
}

export function getNewPass(req: Request, res: Response): Buffer | null {
  const newPassHex = <string>req.query.new_pass;
  if (!sanitizePassword(newPassHex)) {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'new_pass',
      message: 'bad password characters',
    });
    return null;
  }
  return Buffer.from(newPassHex, 'hex');
}
