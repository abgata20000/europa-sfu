
// --- socket.io server ---
import { webServer} from "./server.js";
import { Server } from "socket.io";
const io = new Server(webServer);
console.log('socket.io server start. port=' + webServer.address().port);

io.on('connection', function (socket) {
  console.log('client connected. socket id=' + getId(socket) + '  , total clients=' + getClientCount());

  socket.on('disconnect', function () {
    const roomName = getRoomname();

    // close user connection
    console.log('client disconnected. socket id=' + getId(socket) + '  , total clients=' + getClientCount());
    cleanUpPeer(roomName, socket);

    // --- socket.io room ---
    socket.leave(roomName);
  });
  socket.on('error', function (err) {
    console.error('socket ERROR:', err);
  });
  socket.on('connect_error', (err) => {
    console.error('client connection error', err);
  });

  socket.on('getRouterRtpCapabilities', (data, callback) => {
    const router = defaultRoom.router;

    if (router) {
      //console.log('getRouterRtpCapabilities: ', router.rtpCapabilities);
      sendResponse(router.rtpCapabilities, callback);
    } else {
      sendReject({text: 'ERROR- router NOT READY'}, callback);
    }
  });

  // --- setup room ---
  socket.on('prepare_room', async (data) => {
    const roomId = data.roomId;
    const existRoom = Room.getRoom(roomId);
    if (existRoom) {
      console.log('--- use exist room. roomId=' + roomId);
    } else {
      console.log('--- create new room. roomId=' + roomId);
      const room = await setupRoom(roomId);
    }

    // --- socket.io room ---
    socket.join(roomId);
    setRoomname(roomId);
  })

  // --- producer ----
  socket.on('createProducerTransport', async (data, callback) => {
    const roomName = getRoomname();

    console.log('-- createProducerTransport ---room=%s', roomName);
    const {transport, params} = await createTransport(roomName);
    addProducerTransport(roomName, getId(socket), transport);
    transport.observer.on('close', () => {
      const id = getId(socket);
      const videoProducer = getProducer(roomName, id, 'video');
      if (videoProducer) {
        videoProducer.close();
        removeProducer(roomName, id, 'video');
      }
      const audioProducer = getProducer(roomName, id, 'audio');
      if (audioProducer) {
        audioProducer.close();
        removeProducer(roomName, id, 'audio');
      }
      removeProducerTransport(roomName, id);
    });
    //console.log('-- createProducerTransport params:', params);
    sendResponse(params, callback);
  });

  socket.on('connectProducerTransport', async (data, callback) => {
    const roomName = getRoomname();
    const transport = getProducerTransport(roomName, getId(socket));
    await transport.connect({dtlsParameters: data.dtlsParameters});
    sendResponse({}, callback);
  });

  socket.on('produce', async (data, callback) => {
    const roomName = getRoomname();
    const {kind, rtpParameters} = data;
    console.log('-- produce --- kind=' + kind);
    const id = getId(socket);
    const transport = getProducerTransport(roomName, id);
    if (!transport) {
      console.error('transport NOT EXIST for id=' + id);
      return;
    }
    const producer = await transport.produce({kind, rtpParameters});
    addProducer(roomName, id, producer, kind);
    producer.observer.on('close', () => {
      console.log('producer closed --- kind=' + kind);
    })
    sendResponse({id: producer.id}, callback);

    // inform clients about new producer

    if (roomName) {
      console.log('--broadcast room=%s newProducer ---', roomName);
      socket.broadcast.to(roomName).emit('newProducer', {socketId: id, producerId: producer.id, kind: producer.kind});
    } else {
      console.log('--broadcast newProducer ---');
      socket.broadcast.emit('newProducer', {socketId: id, producerId: producer.id, kind: producer.kind});
    }
  });

  // --- consumer ----
  socket.on('createConsumerTransport', async (data, callback) => {
    const roomName = getRoomname();
    console.log('-- createConsumerTransport -- id=' + getId(socket));
    const {transport, params} = await createTransport(roomName);
    addConsumerTransport(roomName, getId(socket), transport);
    transport.observer.on('close', () => {
      const localId = getId(socket);
      removeConsumerSetDeep(roomName, localId);
      removeConsumerTransport(roomName, lid);
    });
    //console.log('-- createTransport params:', params);
    sendResponse(params, callback);
  });

  socket.on('connectConsumerTransport', async (data, callback) => {
    const roomName = getRoomname();
    console.log('-- connectConsumerTransport -- id=' + getId(socket));
    let transport = getConsumerTrasnport(roomName, getId(socket));
    if (!transport) {
      console.error('transport NOT EXIST for id=' + getId(socket));
      return;
    }
    await transport.connect({dtlsParameters: data.dtlsParameters});
    sendResponse({}, callback);
  });

  socket.on('consume', async (data, callback) => {
    console.error('-- ERROR: consume NOT SUPPORTED ---');
    return;
  });

  socket.on('resume', async (data, callback) => {
    console.error('-- ERROR: resume NOT SUPPORTED ---');
    return;
  });

  socket.on('getCurrentProducers', async (data, callback) => {
    const roomName = getRoomname();
    const clientId = data.localId;
    console.log('-- getCurrentProducers for Id=' + clientId);

    const remoteVideoIds = getRemoteIds(roomName, clientId, 'video');
    console.log('-- remoteVideoIds:', remoteVideoIds);
    const remoteAudioIds = getRemoteIds(roomName, clientId, 'audio');
    console.log('-- remoteAudioIds:', remoteAudioIds);

    sendResponse({remoteVideoIds: remoteVideoIds, remoteAudioIds: remoteAudioIds}, callback);
  });

  socket.on('consumeAdd', async (data, callback) => {
    const roomName = getRoomname();
    const localId = getId(socket);
    const kind = data.kind;
    console.log('-- consumeAdd -- localId=%s kind=%s', localId, kind);

    let transport = getConsumerTrasnport(roomName, localId);
    if (!transport) {
      console.error('transport NOT EXIST for id=' + localId);
      return;
    }
    const rtpCapabilities = data.rtpCapabilities;
    const remoteId = data.remoteId;
    console.log('-- consumeAdd - localId=' + localId + ' remoteId=' + remoteId + ' kind=' + kind);
    const producer = getProducer(roomName, remoteId, kind);
    if (!producer) {
      console.error('producer NOT EXIST for remoteId=%s kind=%s', remoteId, kind);
      return;
    }
    const {consumer, params} = await createConsumer(roomName, transport, producer, rtpCapabilities); // producer must exist before consume
    //subscribeConsumer = consumer;
    addConsumer(roomName, localId, remoteId, consumer, kind); // TODO: MUST comination of  local/remote id
    console.log('addConsumer localId=%s, remoteId=%s, kind=%s', localId, remoteId, kind);
    consumer.observer.on('close', () => {
      console.log('consumer closed ---');
    })
    consumer.on('producerclose', () => {
      console.log('consumer -- on.producerclose');
      consumer.close();
      removeConsumer(roomName, localId, remoteId, kind);

      // -- notify to client ---
      socket.emit('producerClosed', {localId: localId, remoteId: remoteId, kind: kind});
    });

    console.log('-- consumer ready ---');
    sendResponse(params, callback);
  });

  socket.on('resumeAdd', async (data, callback) => {
    const roomName = getRoomname();
    const localId = getId(socket);
    const remoteId = data.remoteId;
    const kind = data.kind;
    console.log('-- resumeAdd localId=%s remoteId=%s kind=%s', localId, remoteId, kind);
    let consumer = getConsumer(roomName, localId, remoteId, kind);
    if (!consumer) {
      console.error('consumer NOT EXIST for remoteId=' + remoteId);
      return;
    }
    await consumer.resume();
    sendResponse({}, callback);
  });

  // ---- sendback welcome message with on connected ---
  const newId = getId(socket);
  sendback(socket, {type: 'welcome', id: newId});

  // --- send response to client ---
  function sendResponse(response, callback) {
    //console.log('sendResponse() callback:', callback);
    callback(null, response);
  }

  // --- send error to client ---
  function sendReject(error, callback) {
    callback(error.toString(), null);
  }

  function sendback(socket, message) {
    socket.emit('message', message);
  }

  function setRoomname(room) {
    socket.roomname = room;
  }

  function getRoomname() {
    const room = socket.roomname;
    return room;
  }
});
