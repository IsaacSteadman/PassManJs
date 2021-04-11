import { Request, Response } from "express";
import { getUserDataBuffer, writeFilePromise, sanitizeHex, getBinaryBodyData, getUsernameStr, getPassword, getUserInfo, getPathLock, Lock } from "./helpers";
import { existsSync } from "fs";
import { serverPolicyAuth } from "../ServerPolicy";
import { DEBUG } from "../consts";

export async function putPassTable(req: Request, res: Response) {
  const policy = serverPolicyAuth(req, res);
  if (policy == null) return;
  const username = getUsernameStr(req, res);
  if (username == null) return;
  const password = getPassword(req, res);
  if (password == null) return;
  const dataFromClient = getBinaryBodyData(req, res);
  if (dataFromClient == null) return;
  const { path } = getUserInfo(username);
  if (!existsSync(path)) {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'username|password',
      message: 'username or password is incorrect'
    });
    return;
  }
  let lock: Lock;
  getUserDataBuffer(path, password, true).then(async function (userData) {
    lock = getPathLock(path);
    if (policy.updateAccountHook(username, dataFromClient)) {
      await policy.save();
      const { remainder, header } = userData;
      console.log('req.headers =', req.headers);
      if (req.headers['If-Unmodified-Since'] != null) {
        const timestampMs = new Date(userData.timestamp).getTime();
        const ius = req.headers['If-Unmodified-Since'];
        console.log('ius =', JSON.stringify(ius));
        const ifUnmodifiedSinceMs = new Date(ius[0]).getTime();
        if (timestampMs > ifUnmodifiedSinceMs) {
          res.status(412).json({
            type: 'E_MODIFIED',
            message: 'password vault was modified by another client since this client last fetched the password vault',
          });
          return;
        }
      }
      const dataToSave = Buffer.alloc(remainder.length + header.length + 4 + dataFromClient.length);
      header.copy(dataToSave);
      remainder.copy(dataToSave, dataToSave.length - remainder.length);
      const dv = new DataView(dataToSave.buffer);
      dv.setUint32(header.length, dataFromClient.length, true);
      dataFromClient.copy(dataToSave, header.length + 4);
      await writeFilePromise(path, dataToSave);
      res.status(200).json({
        type: 'SUCCESS', message: 'successfully saved password table'
      });
    } else {
      res.status(400).json({
        type: 'E_POLICY',
        action: 'updateAccount',
        message: 'action was blocked by server policy'
      });
    }
  }, err => {
    if (DEBUG) console.log(err);
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
  }).then(x => {
    if (lock != null) {
      lock.release();
    }
  });
};
