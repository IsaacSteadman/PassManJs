import { Request, Response } from 'express';
import { existsSync } from 'fs';
import { stat } from 'fs/promises';
import { serverPolicyAuth } from '../ServerPolicy';
import {
  getBinaryBodyData,
  getConditions,
  getPassword,
  getUserDataBufferV2,
  getUserInfo,
  getUsernameStr,
  stringifyDateHeader,
} from '../utils';

export async function putPassTable(req: Request, res: Response) {
  console.log('putPassTable');
  const policy = serverPolicyAuth(req, res);
  if (policy == null) return;
  const username = getUsernameStr(req, res);
  if (username == null) return;
  const password = getPassword(req, res);
  if (password == null) return;
  const dataFromClient = getBinaryBodyData(req, res);
  if (dataFromClient == null) return;
  const conditions = getConditions(req, res);
  if (conditions == null) return;
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
    type: 'write',
    path,
    password,
    prependLog: '  ',
    conditions,
    preconditionErr: async (state, preconditionChecksFailed) => {
      res.status(412).json({
        type: 'E_PRECONDITION',
        preconditionChecksFailed,
        message:
          'your password vault was probably modified by another session the current session was loaded',
      });
      state.responded = true;
    },
    preOpenWritable: async (state) => {
      if (await policy.updateAccountHook(username, dataFromClient)) {
        return;
      }
      res.status(400).json({
        type: 'E_POLICY',
        action: 'updateAccount',
        message: 'action was blocked by server policy',
      });
      state.responded = true;
    },
    operate: async (user, state, readable, writable) => {
      await user.putDataBuffer(dataFromClient);
      await user.save(writable);
      state.completed = true;
    },
    afterSavedIfNotResponded: async (state) => {
      res
        .status(200)
        .header('last-modified', stringifyDateHeader((await stat(path)).mtime))
        .json({
          type: 'SUCCESS',
          message: 'successfully saved password table',
        });
      state.responded = true;
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
