import { Request, Response } from "express";
import { writeFilePromise, doServerAuth, getNewPass, getBinaryBodyData, getUsernameStr, versionSettings, getUserInfo } from "./helpers";
import { existsSync } from "fs";
import { pbkdf2Sync, randomBytes } from "crypto";

export function putNewAccount(req: Request, res: Response) {
  if (!doServerAuth(req, res)) return;
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
  const salt = randomBytes(32);
  const settings = versionSettings[0].pbkdf2Settings([]);
  const hash = pbkdf2Sync(newPass, salt, settings.iterations, settings.keylen, settings.hash);
  const header = Buffer.alloc(4 + 4 + salt.length + hash.length);
  const dv = new DataView(header.buffer);
  let off = 4;
  dv.setUint16(off, salt.length, true);
  off += 2;
  dv.setUint16(off, hash.length, true);
  off += 2
  salt.copy(header, off);
  off += salt.length;
  hash.copy(header, off);
  off += hash.length;
  const dataToSave = Buffer.alloc(header.length + dataFromClient.length + 4);
  header.copy(dataToSave, 0);
  const dv1 = new DataView(dataToSave.buffer);
  dv1.setUint32(header.length, dataFromClient.length, true);
  dataFromClient.copy(dataToSave, header.length + 4);
  writeFilePromise(path, dataToSave).then(x => {
    res.status(200).json({ type: 'SUCCESS' });
  }).catch(err => {
    res.status(500).json({ type: 'SERVER_ERROR' });
    console.log(err);
  });
};
