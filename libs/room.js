export class Room {
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
