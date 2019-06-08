"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const path_1 = require("path");
// import expressWsModule from 'express-ws';
const http_1 = require("http");
const bodyParser = require("body-parser");
const getPassTable_1 = require("./routes/getPassTable");
const putPassTable_1 = require("./routes/putPassTable");
const passTableNewPass_1 = require("./routes/passTableNewPass");
const postNewAccount_1 = require("./routes/postNewAccount");
const PORT = 3050;
const CORS = false;
const appNoWs = express();
const server = http_1.createServer(appNoWs);
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
app.use(express.static(path_1.resolve(__dirname, '../dist')));
app.use(bodyParser.json({ limit: '50mb' }));
app.get('/pass-table', getPassTable_1.getPassTable);
app.put('/pass-table', putPassTable_1.putPassTable);
app.put('/pass-table-new-pass', passTableNewPass_1.passTableNewPass);
app.post('/pass-table', postNewAccount_1.putNewAccount);
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
