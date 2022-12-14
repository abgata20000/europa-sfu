'use strict';

let producerList = {};
let consumerList = {};




const fs = require('fs');
let serverOptions = {
  hostName: "europa-sfu.dev.big-gate.co.jp", listenPort: 443, useHttps: true,
  httpsKeyFile: "/etc/letsencrypt/live/europa-sfu.dev.big-gate.co.jp/privkey.pem",
  httpsCertFile: "/etc/letsencrypt/live/europa-sfu.dev.big-gate.co.jp/fullchain.pem"
};
let sslOptions = {};
if (serverOptions.useHttps) {
  sslOptions.key = fs.readFileSync(serverOptions.httpsKeyFile).toString();
  sslOptions.cert = fs.readFileSync(serverOptions.httpsCertFile).toString();
}

// --- prepare server ---
const http = require("http");
const https = require("https");
const express = require('express');

const app = express();
const webPort = serverOptions.listenPort;
app.use(express.static('public'));

let webServer = null;
if (serverOptions.useHttps) {
  // -- https ---
  webServer = https.createServer(sslOptions, app).listen(webPort, function () {
    console.log('Web server start. https://' + serverOptions.hostName + ':' + webServer.address().port + '/');
  });
} else {
  // --- http ---
  webServer = http.Server(app).listen(webPort, function () {
    console.log('Web server start. http://' + serverOptions.hostName + ':' + webServer.address().port + '/');
  });
}

// --- WebSocketサーバー ---

const io = require('socket.io')(webServer);

io.on('connection', sock => {
  // ----- 共通 -----

  // クライアントがMediaSoupのDeviceを準備するために必要な情報を返す
  sock.on('get-rtp-capabilities', (_, callback) => {
    callback(router.rtpCapabilities);
  });

  // ----- Producerのリクエスト処理 -----

  sock.on('create-producer-transport', async (_, callback) => {
    let {transport, params} = await createTransport();
    transport.observer.on('close', () => {
      transport.producer.close();
      transport.producer = null;
      delete producerList[transport.id];
      transport = null;
    });
    callback(params);

    producerList[transport.id] = transport;
  });

  sock.on('connect-producer-transport', async (req, callback) => {
    const transport = producerList[req.transportId];
    await transport.connect({dtlsParameters: req.dtlsParameters});
    callback({});
  });

  sock.on('produce-data', async (req, callback) => {
    const transport = producerList[req.transportId];
    const dataProducer = await transport.produceData(req.produceParameters);
    callback(dataProducer.id);

    // 新しいProducerをブロードキャストでConsumerへ通知
    sock.broadcast.emit('new-producer', {
      producerId: dataProducer.id,
    });

    transport.producer = dataProducer;
  });

  // ----- Consumerのリクエスト処理 -----

  sock.on('create-consumer-transport', async (_, callback) => {
    let {transport, params} = await createTransport();
    transport.observer.on('close', () => {
      transport.consumer.close();
      transport.consumer = null;
      delete consumerList[transport.id];
      transport = null;
    });
    callback(params);

    consumerList[transport.id] = transport;
  });

  sock.on('connect-consumer-transport', async (req, callback) => {
    const transport = consumerList[req.transportId];
    await transport.connect({dtlsParameters: req.dtlsParameters});
    callback({});
  });

  sock.on('consume-data', async (req, callback) => {
    const transport = consumerList[req.transportId];
    const dataConsumer = await transport.consumeData(req.consumeParameters);
    const params = {
      id: dataConsumer.id,
      dataProducerId: dataConsumer.dataProducerId,
      sctpStreamParameters: dataConsumer.sctpStreamParameters,
      label: dataConsumer.label,
      protocol: dataConsumer.protocol,
    };
    callback(params);

    transport.consumer = dataConsumer;
  });
});

// --- MediaSoupサーバー ---

let worker = null;
let router = null;

const mediasoup = require('mediasoup');
const transportOption = {
  listenIps: [
    // {ip: '127.0.0.1'},
    { ip: "0.0.0.0", announcedIp: "54.199.138.5" }
  ],
  enableSctp: true,
};

async function startWorker() {
  worker = await mediasoup.createWorker();
  router = await worker.createRouter({});
}

async function createTransport() {
  const transport = await router.createWebRtcTransport(transportOption);
  return {
    transport: transport, params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    }
  };
}

startWorker();
