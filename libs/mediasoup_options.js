import {announcedIp, listenIp, rtcMaxPort, rtcMinPort} from "./config.js";

export const mediasoupOptions = {
  worker: {
    rtcMinPort: rtcMinPort,
    rtcMaxPort: rtcMaxPort,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  }, // Router settings
  router: {
    mediaCodecs: [{
      kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2
    }]
  },
  webRtcTransport: {
    listenIps: [{ip: listenIp, announcedIp: announcedIp}],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000,
  }
};
