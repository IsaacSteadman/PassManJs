"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const util_1 = require("util");
const path_1 = require("path");
const crypto_1 = require("crypto");
exports.readFilePromise = util_1.promisify(fs_1.readFile);
exports.writeFilePromise = util_1.promisify(fs_1.writeFile);
exports.pbkdf2Promise = util_1.promisify(crypto_1.pbkdf2);
exports.versionSettings = [
    {
        getAdditionalParams: function (buf, off) {
            return { params: [], off: off };
        },
        putAdditionalParams: function (buf, off, params) {
            return off;
        },
        sizeAdditionalParams: function (params) {
            return 0;
        },
        pbkdf2Settings: function (params) {
            return {
                iterations: 10000,
                keylen: 256,
                hash: 'sha256'
            };
        }
    }
];
function sanitizeUsername(name) {
    if (typeof name !== 'string')
        return false;
    if (name === '.')
        return false;
    if (name === '..')
        return false;
    for (let i = 0; i < name.length; ++i) {
        const ch = name.charAt(i);
        if (!/[A-Za-z_\.$\-]/.test(ch)) {
            return false;
        }
    }
    return true;
}
exports.sanitizeUsername = sanitizeUsername;
;
function sanitizeHex(str) {
    if (typeof str !== 'string')
        return false;
    if (str.length & 1)
        return false;
    for (let i = 0; i < str.length; ++i) {
        const ch = str.charAt(i);
        if (!/[0-9A-Fa-f]/.test(ch)) {
            return false;
        }
    }
    return true;
}
exports.sanitizeHex = sanitizeHex;
;
exports.sanitizePassword = sanitizeHex;
const serverConfig = JSON.parse(fs_1.readFileSync(path_1.resolve(__dirname, '../../config.json'), 'utf8'));
function doServerAuth(req, res) {
    if (serverConfig.ServerAccessPassword !== req.query.server_pass) {
        res.status(400).json({ type: 'E_AUTH', query_param: 'server_pass', message: 'bad server access password' });
        return false;
    }
    return true;
}
exports.doServerAuth = doServerAuth;
function getUsernameStr(req, res) {
    const username = req.query.username;
    if (!sanitizeUsername(username)) {
        res.status(400).json({ type: 'E_AUTH', query_param: 'username', message: 'bad username characters' });
        return null;
    }
    return username;
}
exports.getUsernameStr = getUsernameStr;
function getPassword(req, res) {
    const passwordHex = req.query.password;
    if (!exports.sanitizePassword(passwordHex)) {
        res.status(400).json({ type: 'E_AUTH', query_param: 'password', message: 'bad password characters' });
        return null;
    }
    return Buffer.from(passwordHex, 'hex');
}
exports.getPassword = getPassword;
function getNewPass(req, res) {
    const newPassHex = req.query.new_pass;
    if (!exports.sanitizePassword(newPassHex)) {
        res.status(400).json({ type: 'E_AUTH', query_param: 'new_pass', message: 'bad password characters' });
        return null;
    }
    return Buffer.from(newPassHex, 'hex');
}
exports.getNewPass = getNewPass;
function getBinaryBodyData(req, res) {
    const data = req.body;
    if (data == null) {
        res.status(400).json({ type: 'E_INVAL', message: 'POST request body must be json with one key: "data"' });
        return null;
    }
    else if (typeof data !== 'object' || data instanceof Array) {
        res.status(400).json({ type: 'E_INVAL', message: 'POST request body must be json with one key: "data"' });
        return null;
    }
    const badKeys = Object.keys(data).filter(x => x !== 'data');
    if (badKeys.length) {
        res.status(400).json({ type: 'E_INVAL', keys: badKeys, message: 'unexpected keys in json object request body' });
        return null;
    }
    else if (!sanitizeHex(data.data)) {
        res.status(400).json({ type: 'E_INVAL', message: 'POST request body must be json with one key: "data" which must be a hexadecimal string' });
        return null;
    }
    return Buffer.from(data.data, 'hex');
}
exports.getBinaryBodyData = getBinaryBodyData;
function getUserInfo(username) {
    const path = path_1.resolve(__dirname, '../../serverData', username);
    return {
        path: path
    };
}
exports.getUserInfo = getUserInfo;
function getUserDataBuffer(path, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const buf = yield exports.readFilePromise(path);
        const dv = new DataView(buf);
        const version = dv.getUint32(0, true);
        if (version !== 0) {
            return Promise.reject({ type: 'E_BAD_VER', version: version });
        }
        const { getAdditionalParams, pbkdf2Settings } = exports.versionSettings[version];
        let off = 4;
        const { params, off: off1 } = getAdditionalParams(buf, off);
        off = off1;
        const { iterations, keylen, hash: hashFn } = pbkdf2Settings(params);
        const saltLen = dv.getUint16(off, true);
        off += 2;
        const hashLen = dv.getUint16(off, true);
        off += 2;
        const end = off + saltLen + hashLen;
        const salt = buf.slice(off, off + saltLen);
        const hash = buf.slice(off + saltLen, end);
        const testHash = yield exports.pbkdf2Promise(password, salt, iterations, keylen, hashFn);
        if (hash.equals(testHash)) {
            const dataLen = dv.getUint32(end, true);
            return {
                params: params,
                version: version,
                salt: salt, hash: hash,
                header: buf.slice(0, end),
                data: buf.slice(end + 4, end + 4 + dataLen),
                remainder: buf.slice(end + 4 + dataLen),
                totalLen: buf.length
            };
        }
        else {
            return Promise.reject({ type: 'E_AUTH' });
        }
    });
}
exports.getUserDataBuffer = getUserDataBuffer;
;
