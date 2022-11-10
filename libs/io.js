import {Server} from "socket.io";
import {webServer} from "./server.js";

export const io = new Server(webServer, {
  cors: {
    origin: "*", methods: ["GET", "POST"]
  }
});
