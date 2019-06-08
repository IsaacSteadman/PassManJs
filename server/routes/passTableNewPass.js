"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const helpers_1 = require("./helpers");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
function passTableNewPass(req, res) {
    if (!helpers_1.doServerAuth(req, res))
        return;
    const username = helpers_1.getUsernameStr(req, res);
    if (username == null)
        return;
    const password = helpers_1.getPassword(req, res);
    if (password == null)
        return;
    const newPass = helpers_1.getNewPass(req, res);
    if (newPass == null)
        return;
    const dataFromClient = helpers_1.getBinaryBodyData(req, res);
    if (dataFromClient == null)
        return;
    const { path } = helpers_1.getUserInfo(username);
    if (!fs_1.existsSync(path))
        return;
    helpers_1.getUserDataBuffer(path, password).then(userData => {
        const { remainder } = userData;
        const salt = crypto_1.randomBytes(32);
        const settings = helpers_1.versionSettings[0].pbkdf2Settings([]);
        const hash = crypto_1.pbkdf2Sync(newPass, salt, settings.iterations, settings.keylen, settings.hash);
        const header = Buffer.alloc(4 + 4 + salt.length + hash.length);
        const dataToSave = Buffer.alloc(remainder.length + header.length + dataFromClient.length);
        header.copy(dataToSave);
        remainder.copy(dataToSave, dataToSave.length - remainder.length);
        dataFromClient.copy(dataToSave, header.length);
        return helpers_1.writeFilePromise(path, dataToSave);
    });
}
exports.passTableNewPass = passTableNewPass;
;
