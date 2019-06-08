import { Request, Response } from "express";
import { getUserDataBuffer, writeFilePromise, versionSettings, doServerAuth, getNewPass, getBinaryBodyData, getPassword, getUsernameStr, getUserInfo } from "./helpers";
import { randomBytes, pbkdf2Sync } from "crypto";
import { existsSync } from "fs";

export function passTableNewPass(req: Request, res: Response) {
  if (!doServerAuth(req, res)) return;
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
  getUserDataBuffer(path, password).then(userData => {
    const {remainder } = userData;
    const salt = randomBytes(32);
    const settings = versionSettings[0].pbkdf2Settings([]);
    const hash = pbkdf2Sync(newPass, salt, settings.iterations, settings.keylen, settings.hash);
    const header = Buffer.alloc(4 + 4 + salt.length + hash.length);
    const dataToSave = Buffer.alloc(remainder.length + header.length + dataFromClient.length);
    header.copy(dataToSave);
    remainder.copy(dataToSave, dataToSave.length - remainder.length);
    dataFromClient.copy(dataToSave, header.length);
    return writeFilePromise(path, dataToSave);
  });
};
