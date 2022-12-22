import * as bodyParser from 'body-parser';
import * as express from 'express';
import { existsSync, mkdirSync } from 'fs';
import { createServer } from 'http';
import { resolve } from 'path';
import { CORS, DEBUG, PORT, SERVER_DATA_LOCATION } from './consts';
import { getPassTable } from './routes/getPassTable';
import { passTableNewPass } from './routes/passTableNewPass';
import { postNewAccount } from './routes/postNewAccount';
import { putPassTable } from './routes/putPassTable';

if (!existsSync(SERVER_DATA_LOCATION)) {
  console.log('creating directory at', SERVER_DATA_LOCATION);
  mkdirSync(SERVER_DATA_LOCATION);
}

const app = express();
const server = createServer(app);

if (CORS) {
  app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });
}

app.use(express.static(resolve(__dirname, '../dist')));
app.use('/icons', express.static(resolve(__dirname, '../icons')));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.raw({ limit: '50mb', type: 'application/octet-stream' }));

if (DEBUG) {
  app.use(function (req, res, next) {
    console.log(`${req.method} ${req.url}`);
    console.log('req.query = ' + JSON.stringify(req.query, null, 2));
    console.log(`req.body = ${JSON.stringify(req.body, null, 2)}`);
    next();
  });
}

app.get('/pass-table', getPassTable);
app.put('/pass-table', putPassTable);
app.put('/pass-table-new-pass', passTableNewPass);
app.post('/pass-table', postNewAccount);

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
console.log(`visit http://localhost:${PORT}/ if developing locally`);
