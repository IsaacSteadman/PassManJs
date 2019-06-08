"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const helpers_1 = require("./helpers");
const fs_1 = require("fs");
function getPassTable(req, res) {
    if (!helpers_1.doServerAuth(req, res))
        return;
    const username = helpers_1.getUsernameStr(req, res);
    if (username == null)
        return;
    const password = helpers_1.getPassword(req, res);
    if (password == null)
        return;
    const { path } = helpers_1.getUserInfo(username);
    if (!fs_1.existsSync(path))
        return;
    helpers_1.getUserDataBuffer(path, password).then(userData => {
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
}
exports.getPassTable = getPassTable;
;
