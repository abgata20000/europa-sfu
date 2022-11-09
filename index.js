import mediasoup from "mediasoup";
import { webServer } from './libs/server.js';
import {rtcMinPort, rtcMaxPort, listenIp, announcedIp} from './libs/config.js';
import { Server } from "socket.io";
const io = new Server(webServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
console.log('socket.io server start. port=' + webServer.address().port);
const rooms = {}

const mediasoupOptions = {
  // Worker settings
  worker: {
    rtcMinPort: rtcMinPort,
    rtcMaxPort: rtcMaxPort,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp', // 'rtx',
      // 'bwe',
      // 'score',
      // 'simulcast',
      // 'svc'
    ],
  }, // Router settings
  router: {
    mediaCodecs: [{
      kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2
    }, {
      kind: 'video', mimeType: 'video/VP8', clockRate: 90000, parameters: {
        'x-google-start-bitrate': 1000
      }
    },]
  }, // WebRtcTransport settings
  webRtcTransport: {
    listenIps: [
      { ip: listenIp, announcedIp: announcedIp }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000,
  }
};


class Room {
  constructor(id, name) {
    this.id = id
    this.name = name
    this.users = []
    this.router = null
    this.consumerTransports = {}
    this.producerTransports = {}
    this.audioProducers = {}
  }

  getConsumerTransport(id) {
    return this.consumerTransports[id];
  }
  addConsumerTransport(id, transport) {
    this.consumerTransports[id] = transport;
  }

  removeConsumerSetDeep(id) {
    return
  }

  removeConsumerTransport(id) {
    delete this.consumerTransports[id];
  }

  getProducerTransport(id) {
    return this.producerTransports[id];
  }

  addProducerTransport(id, transport) {
    this.producerTransports[id] = transport;
  }

  removeProducerTransport(id) {
    delete this.producerTransports[id];
  }

  getProducer(userId) {
    return this.audioProducers[userId];
  }

  addProducer(userId, producer) {
    this.audioProducers[userId] = producer;
  }

  removeProducer(userId) {
    delete this.audioProducers[userId];
  }
}

let worker = null;
async function startWorker() {
  worker = await mediasoup.createWorker(mediasoupOptions.worker);
}
startWorker();


const createTransport = async (roomName) =>{
  const room = rooms[roomName];
  const router = room.router;
  const transport = await router.createWebRtcTransport(mediasoupOptions.webRtcTransport);
  return {
    transport: transport,
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    }
  };
}

const getProducerTransport = (roomName, userId) => {
  const room = rooms[roomName]
  return room.getProducerTransport(userId);
}

const addProducerTransport = (roomName, userId, transport) => {
  const room = rooms[roomName]
  room.addProducerTransport(userId, transport);
}

const removeProducerTransport = (roomName, userId) => {
  const room = rooms[roomName];
  room.removeProducerTransport(userId);
}


const createConsumer = async (roomName, transport, producer, rtpCapabilities) => {
  const room = rooms[roomName];
  const router = room.router;

  if (!router.canConsume({
    producerId: producer.id, rtpCapabilities,
  })) {
    console.error('can not consume');
    return;
  }

  const consumer = await transport.consume({
    producerId: producer.id, rtpCapabilities, paused: producer.kind === 'video',
  })

  return {
    consumer: consumer, params: {
      producerId: producer.id,
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused
    }
  };
}

const addConsumer = (roomName, localId, remoteId, consumer, kind) => {
  const room = rooms[roomName];
  // room.addConsumer(localId, remoteId, consumer, kind);
}


io.on('connection', async (socket) => {
  const { userId, userName, roomName } = socket.handshake.query;

  if(!rooms[roomName]) {
    const room = new Room(roomName, roomName)

    const mediaCodecs = mediasoupOptions.router.mediaCodecs;
    const router = await worker.createRouter({mediaCodecs});
    router.roomName = roomName;

    router.observer.on('close', () => {
      console.log('-- router closed. room=%s', name);
    });
    router.observer.on('newtransport', transport => {
      console.log('-- router newtransport. room=%s', name);
    });
    room.router = router;
    room.users = [
      { userId, userName, socketId: socket.id }
    ]
    rooms[roomName] = room
  } else {
    rooms[roomName].users.push({ userId, userName, socketId: socket.id })
  }

  socket.join(roomName);
  socket.userId = userId;
  socket.userName = userName;
  socket.roomName = roomName;
  console.log('client connected. socket id=' + socket.id);
  io.to(roomName).emit('joined', rooms[roomName]);

  socket.on('disconnect', () => {
    socket.leave(socket.roomName);
    rooms[roomName].users = rooms[roomName].users.filter(user => user.userId !== socket.userId);
    socket.broadcast.to(roomName).emit('leaved', rooms[roomName]);
    // close user connection
    console.log('client disconnected. socket id=' + socket.id);
  });
  socket.on('error', (err) => {
    console.error('socket ERROR:', err);
  });
  socket.on('connect_error', (err) => {
    console.error('client connection error', err);
  });

  const sendResponse = (response, callback) => {
    callback(null, response);
  }

  const sendReject = (error, callback)  =>{
    callback(error.toString(), null);
  }

  socket.on('getRouterRtpCapabilities', (data, callback) => {
    const roomName = socket.roomName
    const room = rooms[roomName]
    const router = room.router;

    if (router) {
      sendResponse(router.rtpCapabilities, callback);
    } else {
      sendReject({text: 'ERROR- router NOT READY'}, callback);
    }
  });

  socket.on('createProducerTransport', async (data, callback) => {
    const roomName = socket.roomName;
    const userId = socket.userId;
    const {transport, params} = await createTransport(roomName);
    addProducerTransport(roomName, userId, transport);
    transport.observer.on('close', () => {
      const room = rooms[roomName];
      const audioProducer = room.getProducer(userId);
      if (audioProducer) {
        audioProducer.close();
        room.removeProducer(userId);
      }
      removeProducerTransport(roomName, userId);
    });
    sendResponse(params, callback);
  });

  socket.on('connectProducerTransport', async (data, callback) => {
    const roomName = socket.roomName;
    const userId = socket.userId;
    const transport = getProducerTransport(roomName, userId);
    await transport.connect({dtlsParameters: data.dtlsParameters});
    sendResponse({}, callback);
  });

  socket.on('produce', async (data, callback) => {
    const roomName = socket.roomName;
    const userId = socket.userId;
    const room = rooms[roomName];
    const {kind, rtpParameters} = data;
    const transport = getProducerTransport(roomName, userId);
    if (!transport) {
      console.error('transport NOT EXIST for id=' + userId);
      return;
    }
    const producer = await transport.produce({kind, rtpParameters});
    room.addProducer(userId, producer);
    producer.observer.on('close', () => {
      console.log('producer closed --- kind=' + kind);
    })
    sendResponse({id: producer.id}, callback);
    socket.broadcast.to(roomName).emit('newProducer', {socketId: userId, userId: userId, producerId: producer.id, kind: producer.kind});
  });

  socket.on('getCurrentProducers', async (data, callback) => {
    const roomName = socket.roomName;
    const userId = socket.userId;
    const room = rooms[roomName];
    const remoteAudioIds = Object.keys(room.audioProducers).filter(id => id !== userId)
    sendResponse({remoteAudioIds: remoteAudioIds}, callback);
  });

  // --- consumer ----
  socket.on('createConsumerTransport', async (data, callback) => {
    const roomName = socket.roomName;
    const userId = socket.userId;
    const room = rooms[roomName];
    const {transport, params} = await createTransport(roomName);
    room.addConsumerTransport(userId, transport);
    transport.observer.on('close', () => {
      const localId = getId(socket);
      room.removeConsumerSetDeep(userId);
      room.removeConsumerTransport(userId);
    });
    //console.log('-- createTransport params:', params);
    sendResponse(params, callback);
  });

  socket.on('connectConsumerTransport', async (data, callback) => {
    const roomName = socket.roomName;
    const userId = socket.userId;
    const room = rooms[roomName];
    let transport = room.getConsumerTransport(userId);
    if (!transport) {
      return;
    }
    await transport.connect({dtlsParameters: data.dtlsParameters});
    sendResponse({}, callback);
  });

  socket.on('consume', async (data, callback) => {
    return;
  });

  socket.on('resume', async (data, callback) => {
    return;
  });

  socket.on('consumeAdd', async (data, callback) => {
    const roomName = socket.roomName;
    const userId = socket.userId;
    const room = rooms[roomName];
    const kind = data.kind;
    let transport = room.getConsumerTransport(userId);
    if (!transport) {
      console.error('transport NOT EXIST for id=' + userId);
      return;
    }
    const rtpCapabilities = data.rtpCapabilities;
    const remoteId = data.remoteId;
    const producer = room.getProducer(remoteId);
    if (!producer) {
      console.error('producer NOT EXIST for remoteId=%s kind=%s', remoteId, kind);
      return;
    }
    const {consumer, params} = await createConsumer(roomName, transport, producer, rtpCapabilities); // producer must exist before consume
    addConsumer(roomName, userId, remoteId, consumer, kind);
    consumer.observer.on('close', () => {
      console.log('consumer closed ---');
    })
    consumer.on('producerclose', () => {
      console.log('consumer -- on.producerclose');
      consumer.close();
      removeConsumer(roomName, localId, remoteId, kind);
      socket.emit('producerClosed', {localId: localId, remoteId: remoteId, kind: kind});
    });

    console.log('-- consumer ready ---');
    sendResponse(params, callback);
  });
});

