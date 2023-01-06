import type { Request, Response } from 'express';
import { sanitizeHex } from './SanitizeHex';

export function getBinaryBodyData(req: Request, res: Response): Buffer | null {
  const [contentType] = (
    req.header('content-type') || 'application/json'
  ).split(';');
  if (contentType.toLowerCase() === 'application/octet-stream') {
    return Buffer.from(req.body);
  }
  if (contentType.toLowerCase() !== 'application/json') {
    res.status(400).json({
      type: 'E_INVAL',
      message: 'invalid content-type header',
      contentTypeOptions: ['application/json', 'application/octet-stream'],
    });
    return null;
  }
  const data = req.body;
  if (data == null) {
    res.status(400).json({
      type: 'E_INVAL',
      message: 'POST request body must be json with one key: "data"',
    });
    return null;
  }
  if (typeof data !== 'object' || data instanceof Array) {
    res.status(400).json({
      type: 'E_INVAL',
      message: 'POST request body must be json with one key: "data"',
    });
    return null;
  }
  const badKeys = Object.keys(data).filter((x) => x !== 'data');
  if (badKeys.length) {
    res.status(400).json({
      type: 'E_INVAL',
      keys: badKeys,
      message: 'unexpected keys in json object request body',
    });
    return null;
  }
  if (!sanitizeHex(data.data)) {
    res.status(400).json({
      type: 'E_INVAL',
      message:
        'POST request body must be json with one key: "data" which must be a hexadecimal string',
    });
    return null;
  }
  return Buffer.from(data.data, 'hex');
}
