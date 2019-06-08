import { resolve } from "path";
import { readFileSync } from "fs";

export const SERVER_DATA_LOCATION = resolve(__dirname, '../server-data');
export const serverConfig = JSON.parse(readFileSync(resolve(__dirname, '../config.json'), 'utf8'));
export const PORT = 3050;
export const CORS = false;
export const DEBUG = true;