import fs from 'fs';
import * as dotenv from 'dotenv'
dotenv.config()

const hostName = process.env.HOSTNAME || 'localhost';
const listenPort = Number(process.env.LISTEN_PORT || 3000);
const useHttps = process.env.USE_HTTPS === 'true';
const httpsKeyFile = process.env.HTTPS_KEY_FILE || '';
const httpsCertFile = process.env.HTTPS_CERT_FILE || '';
const rtcMinPort = Number(process.env.RTC_MIN_PORT || 40000);
const rtcMaxPort = Number(process.env.RTC_MAX_PORT || 49999);
const listenIp = process.env.LISTEN_IP || '127.0.0.1'
const announcedIp = process.env.ANNOUNCED_IP || null;
let serverOptions = {
  hostName: hostName,
  listenPort: listenPort,
  useHttps: useHttps,
  httpsKeyFile: httpsKeyFile,
  httpsCertFile: httpsCertFile
};
let sslOptions = {};
if (serverOptions.useHttps) {
  sslOptions.key = fs.readFileSync(serverOptions.httpsKeyFile).toString();
  sslOptions.cert = fs.readFileSync(serverOptions.httpsCertFile).toString();
}


export { serverOptions, sslOptions, rtcMinPort, rtcMaxPort, listenIp, announcedIp };
