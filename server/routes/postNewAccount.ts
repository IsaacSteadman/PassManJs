import { Request, Response } from 'express';
import { existsSync } from 'fs';
import { serverPolicyAuth } from '../ServerPolicy';
import {
  getBinaryBodyData,
  getNewPass,
  getUserDataBufferV2,
  getUserInfo,
  getUsernameStr,
} from '../utils';

export async function postNewAccount(req: Request, res: Response) {
  console.log('postNewAccount');
  const policy = serverPolicyAuth(req, res);
  if (policy == null) return;
  const username = getUsernameStr(req, res);
  if (username == null) return;
  const newPass = getNewPass(req, res);
  if (newPass == null) return;
  const dataFromClient = getBinaryBodyData(req, res);
  if (dataFromClient == null) return;
  const { path } = getUserInfo(username);
  if (existsSync(path)) {
    res.status(400).json({ type: 'E_USER', message: 'username already taken' });
    return;
  }
  await getUserDataBufferV2({
    type: 'new',
    path,
    password: newPass,
    prependLog: '  ',
    preOpenWritable: async (state) => {
      if (await policy.createAccountHook(username, dataFromClient)) {
        return;
      }
      res.status(400).json({
        type: 'E_POLICY',
        action: 'createAccount',
        message: 'action was blocked by server policy',
      });
      state.responded = true;
    },
    operate: async (user, state, writable) => {
      await user.setPassword(newPass);
      await user.putDataBuffer(dataFromClient);
      await user.save(writable);
      state.completed = true;
      state.responded = true;
    },
    authErr: async (state, err) => {
      if (err == null) {
        res.status(400).json({ type: 'E_INVAL', message: 'unknown error' });
        state.responded = true;
      } else {
        res.status(500).json({ type: 'SERVER_ERROR' });
        state.responded = true;
        console.log(err);
      }
    },
  });
}
