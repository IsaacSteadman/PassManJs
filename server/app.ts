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
import { MockFsSource, NativeFsSource, wrapUserOperation } from './utils';

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
app.use(bodyParser.raw({ limit: '26mb', type: 'application/octet-stream' }));

if (DEBUG) {
  app.use(function (req, res, next) {
    console.log(`${req.method} ${req.url}`);
    console.log('req.query = ' + JSON.stringify(req.query, null, 2));
    console.log(`req.body = ${JSON.stringify(req.body, null, 2)}`);
    console.log(`req.headers = ${JSON.stringify(req.headers, null, 2)}`);
    next();
  });
}

const mocking =
  process.env.NODE_ENV === 'development' &&
  process.env.MODE === 'E2E_TESTING_MOCKED';
if (mocking) {
  const line = '#'.repeat(80);
  console.log(
    [
      line,
      line,
      line,
      'MOCKED',
      'Server is not persisting user data.',
      'user data can be dumped at any time by calling POST /dump-mock-server-data)',
      line,
      line,
      line,
    ].join('\n')
  );
}

const fsSource = mocking ? new MockFsSource() : new NativeFsSource();

app.get('/pass-table', (req, res) =>
  wrapUserOperation(req, res, 'read', getPassTable, fsSource)
);
app.put('/pass-table', (req, res) =>
  wrapUserOperation(req, res, 'update', putPassTable, fsSource)
);
app.put('/pass-table-new-pass', (req, res) =>
  wrapUserOperation(req, res, 'update', passTableNewPass, fsSource)
);
app.post('/pass-table', (req, res) =>
  wrapUserOperation(req, res, 'create', postNewAccount, fsSource)
);
if (mocking) {
  app.post('/dump-mock-server-data', (req, res) => {
    (fsSource as MockFsSource).dump();
    console.log('dumped server data');
    res.status(200).json({});
  });
}

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
