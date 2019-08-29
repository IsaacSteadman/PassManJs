import { Request, Response } from "express";
import { getUserDataBuffer, getUsernameStr, getPassword, getUserInfo } from "./helpers";
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
  await getUserDataBuffer(path, password).then(async function (userData) {
    const { data } = userData;
    if (policy.readAccountHook(username, data)) {
      await policy.save();
      res.status(200).json({
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
