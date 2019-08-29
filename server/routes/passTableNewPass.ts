import { Request, Response } from "express";
import { getUserDataBuffer, writeFilePromise, versionSettings, getNewPass, getBinaryBodyData, getPassword, getUsernameStr, getUserInfo } from "./helpers";
import { randomBytes, pbkdf2Sync } from "crypto";
import { existsSync } from "fs";
import { serverPolicyAuth } from "../ServerPolicy";

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
  const { path } = getUserInfo(username);
  if (!existsSync(path)) return;
  await getUserDataBuffer(path, password).then(async function (userData) {
    if (policy.updatePasswordHook(username, dataFromClient)) {
      await policy.save();
      const { remainder } = userData;
      const salt = randomBytes(32);
      const settings = versionSettings[0].pbkdf2Settings([]);
      const hash = pbkdf2Sync(newPass, salt, settings.iterations, settings.keylen, settings.hash);
      const header = Buffer.alloc(4 + 4 + salt.length + hash.length);
      const dataToSave = Buffer.alloc(remainder.length + header.length + dataFromClient.length);
      header.copy(dataToSave);
      remainder.copy(dataToSave, dataToSave.length - remainder.length);
      dataFromClient.copy(dataToSave, header.length);
      await writeFilePromise(path, dataToSave);
      res.status(200).json({
        type: 'SUCCESS',
        message: 'successfully saved password table under a different password'
      });
    } else {
      res.status(400).json({
        type: 'E_POLICY',
        action: 'updatePassword',
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
