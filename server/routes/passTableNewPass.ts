import { Request, Response } from 'express';
import { existsSync } from 'fs';
import { serverPolicyAuth } from '../ServerPolicy';
import {
  getBinaryBodyData,
  getConditions,
  getNewPass,
  getPassword,
  getUserDataBufferV2,
  getUserInfo,
  getUsernameStr,
} from '../utils';

export async function passTableNewPass(req: Request, res: Response) {
  const policy = serverPolicyAuth(req, res);
  if (policy == null) return;
  const username = getUsernameStr(req, res);
  if (username == null) return;
  const password = getPassword(req, res);
  if (password == null) return;
  const newPass = getNewPass(req, res);
  if (newPass == null) return;
  const dataFromClient = getBinaryBodyData(req, res);
  if (dataFromClient == null) return;
  const conditions = getConditions(req, res);
  if (conditions == null) return;

  const { path } = getUserInfo(username);
  if (!existsSync(path)) return;
  await getUserDataBufferV2({
    type: 'write',
    path,
    password,
    conditions,
    preconditionErr: async (state, preconditionChecksFailed) => {
      res.status(412).json({
        type: 'E_PRECONDITION',
        preconditionChecksFailed,
        message:
          'it is likely that your password vault was modified by another session since the time the vault for the current session was loaded',
      });
      state.responded = true;
    },
    operate: async (user, state, readable, writeable) => {
      if (!(await policy.updatePasswordHook(username, dataFromClient))) {
        res.status(400).json({
          type: 'E_POLICY',
          action: 'updatePassword',
          message: 'action was blocked by server policy',
        });
        state.responded = true;
        return;
      }
      await user.setPassword(newPass);
      await user.putDataBuffer(dataFromClient);
      await user.save(writeable);
      res.status(200).json({
        type: 'SUCCESS',
        message: 'successfully saved password table under a different password',
      });
      state.completed = true;
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
