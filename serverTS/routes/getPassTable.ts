import { Request, Response } from "express";
import { getUserDataBuffer, doServerAuth, getUsernameStr, getPassword, getUserInfo } from "./helpers";
import { existsSync } from "fs";

export function getPassTable(req: Request, res: Response) {
  if (!doServerAuth(req, res)) return;
  const username = getUsernameStr(req, res);
  if (username == null) return;
  const password = getPassword(req, res);
  if (password == null) return;
  const { path } = getUserInfo(username);
  if (!existsSync(path)) return;
  getUserDataBuffer(path, password).then(userData => {
    const { data } = userData;
    res.status(200).json({
      type: 'SUCCESS',
      data: data.toString('hex')
    });
  }).catch(err => {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'username|password',
      message: 'username or password is incorrect'
    });
    console.log(err);
  });
};
