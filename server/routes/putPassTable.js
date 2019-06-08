"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const helpers_1 = require("./helpers");
const fs_1 = require("fs");
function putPassTable(req, res) {
    if (!helpers_1.doServerAuth(req, res))
        return;
    const username = helpers_1.getUsernameStr(req, res);
    if (username == null)
        return;
    const password = helpers_1.getPassword(req, res);
    if (password == null)
        return;
    const dataFromClient = helpers_1.getBinaryBodyData(req, res);
    if (dataFromClient == null)
        return;
    const { path } = helpers_1.getUserInfo(username);
    if (!fs_1.existsSync(path))
        return;
    helpers_1.getUserDataBuffer(path, password).then(userData => {
        const { remainder, header } = userData;
        const dataToSave = Buffer.alloc(remainder.length + header.length + dataFromClient.length);
        header.copy(dataToSave);
        remainder.copy(dataToSave, dataToSave.length - remainder.length);
        dataFromClient.copy(dataToSave, header.length);
        return helpers_1.writeFilePromise(path, dataToSave);
    }).catch(err => {
        res.status(400).json({
            type: 'E_AUTH',
            query_param: 'username|password',
            message: 'username or password is incorrect'
        });
        console.log(err);
    });
}
exports.putPassTable = putPassTable;
;
