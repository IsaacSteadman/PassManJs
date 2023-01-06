import { Request, Response } from 'express';
import {
  getUsernameStr,
  getPassword,
  getUserInfo,
  getUserDataBufferV2,
  stringifyDateHeader,
} from '../utils';
import { existsSync } from 'fs';
import { serverPolicyAuth } from '../ServerPolicy';

export async function getPassTable(req: Request, res: Response) {
  console.log('getPassTable');
  const policy = serverPolicyAuth(req, res);
  if (policy == null) return;
  const username = getUsernameStr(req, res);
  if (username == null) return;
  const password = getPassword(req, res);
  if (password == null) return;
  const { path } = getUserInfo(username);
  if (!existsSync(path)) {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'username|password',
      message: 'username or password is incorrect',
    });
    return;
  }
  await getUserDataBufferV2({
    type: 'read',
    path,
    password,
    prependLog: '  ',
    operate: async (user, state, readFile) => {
      await user.loadBody(readFile);
      const data = await user.getDataBuffer();
      if (!(await policy.readAccountHook(username, data))) {
        res.status(400).json({
          type: 'E_POLICY',
          action: 'readAccount',
          message: 'action was blocked by server policy',
        });
        state.responded = true;
        return;
      }
      res.status(200);
      res.header(
        'last-modified',
        stringifyDateHeader((await readFile.fh.stat()).mtime)
      );
      if (req.accepts(['octet-stream', 'json']) === 'octet-stream') {
        res.header('content-type', 'application/octet-stream');
        res.write(data);
        state.responded = true;
        state.completed = true;
      } else {
        res.json({
          type: 'SUCCESS',
          data: data.toString('hex'),
        });
        state.responded = true;
        state.completed = true;
      }
    },
    authErr: async (state, err) => {
      res.status(400).json({
        type: 'E_AUTH',
        query_param: 'username|password',
        message: 'username or password is incorrect',
      });
      state.responded = true;
      if (err == null) {
        console.log('auth error, username: ' + username);
      } else {
        console.error('internal server error');
        console.error(err);
      }
    },
  });
}
