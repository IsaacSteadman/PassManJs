"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const helpers_1 = require("./helpers");
const fs_1 = require("fs");
const crypto_1 = require("crypto");
function putNewAccount(req, res) {
    if (!helpers_1.doServerAuth(req, res))
        return;
    const username = helpers_1.getUsernameStr(req, res);
    if (username == null)
        return;
    const newPass = helpers_1.getNewPass(req, res);
    if (newPass == null)
        return;
    const dataFromClient = helpers_1.getBinaryBodyData(req, res);
    if (dataFromClient == null)
        return;
    const { path } = helpers_1.getUserInfo(username);
    if (fs_1.existsSync(path)) {
        res.status(400).json({ type: 'E_USER', message: 'username already taken' });
        return;
    }
    const salt = crypto_1.randomBytes(32);
    const settings = helpers_1.versionSettings[0].pbkdf2Settings([]);
    const hash = crypto_1.pbkdf2Sync(newPass, salt, settings.iterations, settings.keylen, settings.hash);
    const header = Buffer.alloc(4 + 4 + salt.length + hash.length);
    const dataToSave = Buffer.alloc(header.length + dataFromClient.length);
    header.copy(dataToSave, 0);
    dataFromClient.copy(dataToSave, header.length);
    helpers_1.writeFilePromise(path, dataToSave).then(x => {
        res.status(200).json({ type: 'SUCCESS' });
    }).catch(err => {
        res.status(500).json({ type: 'SERVER_ERROR' });
        console.log(err);
    });
}
exports.putNewAccount = putNewAccount;
;
