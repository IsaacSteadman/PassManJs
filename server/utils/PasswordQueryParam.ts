import type { Request } from 'express';
import { sanitizeHex } from './SanitizeHex';

export const sanitizePassword = sanitizeHex;

export function getPasswordThrow(req: Request): Buffer {
  const passwordHex = req.query.password;
  if (typeof passwordHex === 'string' && sanitizePassword(passwordHex)) {
    return Buffer.from(passwordHex, 'hex');
  }
  throw {
    type: 'json-response',
    jsonStatus: 400,
    jsonBody: {
      type: 'E_AUTH',
      query_param: 'password',
      message: 'bad password characters',
    },
  };
}

export function getNewPassThrow(req: Request): Buffer {
  const newPassHex = req.query.new_pass;
  if (typeof newPassHex === 'string' && sanitizePassword(newPassHex)) {
    return Buffer.from(newPassHex, 'hex');
  }
  throw {
    type: 'json-response',
    jsonStatus: 400,
    jsonBody: {
      type: 'E_AUTH',
      query_param: 'new_pass',
      message: 'bad password characters',
    },
  };
}
