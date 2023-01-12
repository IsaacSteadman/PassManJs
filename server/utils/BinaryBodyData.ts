import type { Request } from 'express';
import { sanitizeHex } from './SanitizeHex';

export function getBinaryBodyDataThrow(req: Request): Buffer {
  const [contentType] = (
    req.header('content-type') || 'application/json'
  ).split(';');
  if (contentType.toLowerCase() === 'application/octet-stream') {
    return Buffer.from(req.body);
  }
  if (contentType.toLowerCase() !== 'application/json') {
    throw {
      type: 'json-response',
      jsonStatus: 400,
      jsonBody: {
        type: 'E_INVAL',
        message: 'invalid content-type header',
        contentTypeOptions: ['application/json', 'application/octet-stream'],
      },
    };
  }
  const data = req.body;
  if (data == null) {
    throw {
      type: 'json-response',
      jsonStatus: 400,
      jsonBody: {
        type: 'E_INVAL',
        message: 'POST request body must be json with one key: "data"',
      },
    };
  }
  if (typeof data !== 'object' || data instanceof Array) {
    throw {
      type: 'json-response',
      jsonStatus: 400,
      jsonBody: {
        type: 'E_INVAL',
        message: 'POST request body must be json with one key: "data"',
      },
    };
  }
  const badKeys = Object.keys(data).filter((x) => x !== 'data');
  if (badKeys.length) {
    throw {
      type: 'json-response',
      jsonStatus: 400,
      jsonBody: {
        type: 'E_INVAL',
        keys: badKeys,
        message: 'unexpected keys in json object request body',
      },
    };
  }
  if (!sanitizeHex(data.data)) {
    throw {
      type: 'json-response',
      jsonStatus: 400,
      jsonBody: {
        type: 'E_INVAL',
        message:
          'POST request body must be json with one key: "data" which must be a hexadecimal string',
      },
    };
  }
  return Buffer.from(data.data, 'hex');
}
