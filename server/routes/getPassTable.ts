import { Request, Response } from "express";
import { getUserDataBuffer, getUsernameStr, getPassword, getUserInfo, getPathLock } from "./helpers";
import { existsSync } from "fs";
import { serverPolicyAuth } from "../ServerPolicy";

export async function getPassTable(req: Request, res: Response) {
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
      message: 'username or password is incorrect'
    });
    return;
  }
  const lock = getPathLock(path)
  await lock.acquire();
  await getUserDataBuffer(path, password, true).then(async function (userData) {
    lock.release();
    const { data, timestamp } = userData;
    if (policy.readAccountHook(username, data)) {
      await policy.save();
      res.set('Last-Modified', timestamp).status(200).json({
        type: 'SUCCESS',
        data: data.toString('hex')
      });
    } else {
      res.status(400).json({
        type: 'E_POLICY',
        action: 'readAccount',
        message: 'action was blocked by server policy'
      });
    }
  }, err => {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'username|password',
      message: 'username or password is incorrect'
    });
    console.log('auth error, username: ' + username);
  }).catch(err => {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'username|password',
      message: 'username or password is incorrect'
    });
    console.error('internal server error');
    console.error(err);
  });
};
