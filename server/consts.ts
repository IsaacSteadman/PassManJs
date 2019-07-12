import { resolve } from "path";
import { readFileSync } from "fs";

export const SERVER_DATA_LOCATION = resolve(__dirname, '../server-data');
export const serverConfig = JSON.parse(readFileSync(resolve(__dirname, '../config.json'), 'utf8'));
export const PORT = (
  (
    Object.prototype.hasOwnProperty.call(serverConfig, 'Port')
    && typeof serverConfig.Port === 'number')
  ? serverConfig.Port : 3050
);
export const CORS = (
  (
    Object.prototype.hasOwnProperty.call(serverConfig, 'Cors')
    && typeof serverConfig.Cors === 'boolean')
  ? serverConfig.Cors : false
);
export const DEBUG = (
  (
    Object.prototype.hasOwnProperty.call(serverConfig, 'Debug')
    && typeof serverConfig.Debug === 'boolean')
  ? serverConfig.Debug : true
);
