import { Request, Response } from "express";
import { getUserDataBuffer, writeFilePromise, sanitizeHex, doServerAuth, getBinaryBodyData, getUsernameStr, getPassword, getUserInfo } from "./helpers";
import { existsSync } from "fs";

export function putPassTable(req: Request, res: Response) {
  if (!doServerAuth(req, res)) return;
  const username = getUsernameStr(req, res);
  if (username == null) return;
  const password = getPassword(req, res);
  if (password == null) return;
  const dataFromClient = getBinaryBodyData(req, res);
  if (dataFromClient == null) return;
  const { path } = getUserInfo(username);
  if (!existsSync(path)) return;
  getUserDataBuffer(path, password).then(userData => {
    const { remainder, header } = userData;
    const dataToSave = Buffer.alloc(remainder.length + header.length + 4 + dataFromClient.length);
    header.copy(dataToSave);
    remainder.copy(dataToSave, dataToSave.length - remainder.length);
    const dv = new DataView(dataToSave);
    dv.setUint32(header.length, dataFromClient.length, true);
    dataFromClient.copy(dataToSave, header.length + 4);
    return writeFilePromise(path, dataToSave);
  }).catch(err => {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'username|password',
      message: 'username or password is incorrect'
    });
    console.log(err);
  });
};
