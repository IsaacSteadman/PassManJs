import {readFileSync, existsSync, readFile, writeFile} from 'fs';
import * as express from 'express';
import { Request, Response } from 'express';
import { resolve, join } from 'path';
// import expressWsModule from 'express-ws';
import { createServer } from 'http';
import { Buffer } from 'buffer';
import {createHash, pbkdf2, randomBytes, pbkdf2Sync} from 'crypto';
import * as bodyParser from 'body-parser';
import { getPassTable } from './routes/getPassTable';
import { putPassTable } from './routes/putPassTable';
import { passTableNewPass } from './routes/passTableNewPass';
import { putNewAccount as postNewAccount } from './routes/postNewAccount';

const PORT = 3050;
const CORS = false;

const appNoWs = express();
const server = createServer(appNoWs);
// const expressWs = expressWsModule(appNoWs, server);
// const app = expressWs.app;
const app = appNoWs;

if (CORS) {
  app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });
}

app.use(express.static(resolve(__dirname, '../dist')));
app.use(bodyParser.json({limit: '50mb'}));

app.get('/pass-table', getPassTable);
app.put('/pass-table', putPassTable);
app.put('/pass-table-new-pass', passTableNewPass);
app.post('/pass-table', postNewAccount)

/* app.ws('/app-ws', (ws, req) => {
  const userMsg = (data) => {
    const dv = new DataView(data);
    ;
  };
  const loginMsg = (data) => {
    const dv = new DataView(data);
  }
  ws.on('message', )
});*/

console.log(`listening on port: ${PORT}`);
server.listen(PORT);