import type { Request } from 'express';
import { sanitizeUsername } from '../client-common/sanitizeUsername';

export function getUsernameStrThrow(req: Request): string {
  const username = req.query.username;
  if (typeof username === 'string' && sanitizeUsername(username)) {
    return username;
  }
  throw {
    type: 'json-response',
    jsonStatus: 400,
    jsonBody: {
      type: 'E_AUTH',
      query_param: 'username',
      message: 'bad username characters',
    },
  };
}
