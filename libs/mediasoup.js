
// ========= mediasoup ===========
const mediasoup = require("mediasoup");
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

let worker = null;
// --- default room ---
let defaultRoom = null;



function getClientCount() {
  // WARN: undocumented method to get clients number
  return io.eio.clientsCount;
}


async function setupRoom(name) {
  const room = new Room(name);
  const mediaCodecs = mediasoupOptions.router.mediaCodecs;
  const router = await worker.createRouter({mediaCodecs});
  router.roomname = name;

  router.observer.on('close', () => {
    console.log('-- router closed. room=%s', name);
  });
  router.observer.on('newtransport', transport => {
    console.log('-- router newtransport. room=%s', name);
  });

  room.router = router;
  Room.addRoom(room, name);
  return room;
}


function cleanUpPeer(roomname, socket) {
  const id = getId(socket);
  removeConsumerSetDeep(roomname, id);

  const transport = getConsumerTrasnport(roomname, id);
  if (transport) {
    transport.close();
    removeConsumerTransport(roomname, id);
  }

  const videoProducer = getProducer(roomname, id, 'video');
  if (videoProducer) {
    videoProducer.close();
    removeProducer(roomname, id, 'video');
  }
  const audioProducer = getProducer(roomname, id, 'audio');
  if (audioProducer) {
    audioProducer.close();
    removeProducer(roomname, id, 'audio');
  }

  const producerTransport = getProducerTransport(roomname, id);
  if (producerTransport) {
    producerTransport.close();
    removeProducerTransport(roomname, id);
  }
}


function getProducerTransport(roomname, id) {
  if (roomname) {
    console.log('=== getProducerTransport use room=%s ===', roomname);
    const room = Room.getRoom(roomname);
    return room.getProducerTransport(id);
  } else {
    console.log('=== getProducerTransport use defaultRoom room=%s ===', roomname);
    return defaultRoom.getProducerTransport(id);
  }
}

function addProducerTransport(roomname, id, transport) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.addProducerTransport(id, transport);
    console.log('=== addProducerTransport use room=%s ===', roomname);
  } else {
    defaultRoom.addProducerTransport(id, transport);
    console.log('=== addProducerTransport use defaultRoom room=%s ===', roomname);
  }
}

function removeProducerTransport(roomname, id) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.removeProducerTransport(id);
  } else {
    defaultRoom.removeProducerTransport(id);
  }
}

function getProducer(roomname, id, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    return room.getProducer(id, kind);
  } else {
    return defaultRoom.getProducer(id, kind);
  }
}


function getRemoteIds(roomname, clientId, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    return room.getRemoteIds(clientId, kind);
  } else {
    return defaultRoom.getRemoteIds(clientId, kind);
  }
}


function addProducer(roomname, id, producer, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.addProducer(id, producer, kind);
    console.log('=== addProducer use room=%s ===', roomname);
  } else {
    defaultRoom.addProducer(id, producer, kind);
    console.log('=== addProducer use defaultRoom room=%s ===', roomname);
  }
}

function removeProducer(roomname, id, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.removeProducer(id, kind);
  } else {
    defaultRoom.removeProducer(id, kind);
  }
}


// --- multi-consumers --
//let consumerTransports = {};
//let videoConsumers = {};
//let audioConsumers = {};

function getConsumerTrasnport(roomname, id) {
  if (roomname) {
    console.log('=== getConsumerTrasnport use room=%s ===', roomname);
    const room = Room.getRoom(roomname);
    return room.getConsumerTrasnport(id);
  } else {
    console.log('=== getConsumerTrasnport use defaultRoom room=%s ===', roomname);
    return defaultRoom.getConsumerTrasnport(id);
  }
}

function addConsumerTransport(roomname, id, transport) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.addConsumerTransport(id, transport);
    console.log('=== addConsumerTransport use room=%s ===', roomname);
  } else {
    defaultRoom.addConsumerTransport(id, transport);
    console.log('=== addConsumerTransport use defaultRoom room=%s ===', roomname);
  }
}

function removeConsumerTransport(roomname, id) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.removeConsumerTransport(id);
  } else {
    defaultRoom.removeConsumerTransport(id);
  }
}

// function getConsumerSet(localId, kind) {
//   if (kind === 'video') {
//     return videoConsumers[localId];
//   }
//   else if (kind === 'audio') {
//     return audioConsumers[localId];
//   }
//   else {
//     console.warn('WARN: getConsumerSet() UNKNWON kind=%s', kind);
//   }
// }

function getConsumer(roomname, localId, remoteId, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    return room.getConsumer(localId, remoteId, kind);
  } else {
    return defaultRoom.getConsumer(localId, remoteId, kind);
  }
}

function addConsumer(roomname, localId, remoteId, consumer, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.addConsumer(localId, remoteId, consumer, kind);
    console.log('=== addConsumer use room=%s ===', roomname);
  } else {
    defaultRoom.addConsumer(localId, remoteId, consumer, kind);
    console.log('=== addConsumer use defaultRoom room=%s ===', roomname);
  }
}

function removeConsumer(roomname, localId, remoteId, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.removeConsumer(localId, remoteId, kind);
  } else {
    defaultRoom.removeConsumer(localId, remoteId, kind);
  }
}

function removeConsumerSetDeep(roomname, localId) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.removeConsumerSetDeep(localId);
  } else {
    defaultRoom.removeConsumerSetDeep(localId);
  }
}

// function addConsumerSet(localId, set, kind) {
//   if (kind === 'video') {
//     videoConsumers[localId] = set;
//   }
//   else if (kind === 'audio') {
//     audioConsumers[localId] = set;
//   }
//   else {
//     console.warn('WARN: addConsumerSet() UNKNWON kind=%s', kind);
//   }
// }

async function createTransport(roomname) {
  let router = null;
  if (roomname) {
    const room = Room.getRoom(roomname);
    router = room.router;
  } else {
    router = defaultRoom.router;
  }
  const transport = await router.createWebRtcTransport(mediasoupOptions.webRtcTransport);
  console.log('-- create transport room=%s id=%s', roomname, transport.id);

  return {
    transport: transport, params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    }
  };
}

async function createConsumer(roomname, transport, producer, rtpCapabilities) {
  let router = null;
  if (roomname) {
    const room = Room.getRoom(roomname);
    router = room.router;
  } else {
    router = defaultRoom.router;
  }


  if (!router.canConsume({
    producerId: producer.id, rtpCapabilities,
  })) {
    console.error('can not consume');
    return;
  }

  let consumer = null;
  //consumer = await producerTransport.consume({ // NG: try use same trasport as producer (for loopback)
  consumer = await transport.consume({ // OK
    producerId: producer.id, rtpCapabilities, paused: producer.kind === 'video',
  }).catch(err => {
    console.error('consume failed', err);
    return;
  });

  //if (consumer.type === 'simulcast') {
  //  await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });
  //}

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

async function startWorker() {
  const mediaCodecs = mediasoupOptions.router.mediaCodecs;
  worker = await mediasoup.createWorker(mediasoupOptions.worker);
  //router = await worker.createRouter({ mediaCodecs });
  //producerTransport = await router.createWebRtcTransport(mediasoupOptions.webRtcTransport);

  defaultRoom = await setupRoom('_default_room');
  console.log('-- mediasoup worker start. -- room:', defaultRoom.name);
}

export { worker, startWorker, defaultRoom }
