import { WebSocketServer } from "ws";
import WebSocket from "ws";
import fs from 'fs';
import path from 'path';
import dotenv from "dotenv";
import { CONNECTED_IPS, Authorized_Players } from "./globalVariables.js";
import send from "send";
import websocketserver from "websocketserver";
import { activeMatches } from "./match_manager.js";
import { activeCustomMatches } from "./globalVariables.js";
import { startMatchmaking } from "./queue.js";
import { createCustomMatch } from "./match_manager.js";
import { queue1v1, queuev3, queuev4, queuev34 } from "./queue.js";

dotenv.config();

const PORT = process.env.port;
const TICK_INTERVAL = 10000;
const thisIP =`${process.env.this_IP}`;

const CENTRAL_SERVER_URL = `${process.env.CS_IP}`;
let centralWS = null;

const wss = new WebSocketServer({ port: PORT });
connectToCentralServer();

console.log(`WebSocket server running on ${PORT}`);

wss.funcs = new Map();
const dbFunctionsLoad = fs.readdirSync("./Functions").filter(file => file.endsWith(".js"));

var funcNum = 0;
for (const file of dbFunctionsLoad) {
  const filePath = `./Functions/${file}`;
  console.log(filePath);
  const functionModule = await import(filePath);
  const _function = functionModule.default;

  if (_function) {
    wss.funcs.set(_function.name, {..._function, category: _function.category || "uncategorized"});
  }
  funcNum++;
}
console.log("Loaded " + funcNum + " FUNCTIONS.");

startMatchmaking();

wss.on("connection", (ws, request) => {
  const ip = String(request.headers["x-forwarded-for"]?.split(",")[0] || request.socket.remoteAddress).replace("::ffff:", "");
  /*if (CONNECTED_IPS.has(ip)) {
    console.log(`Rejected duplicate connection from ${ip}`);
    ws.close(1008, "Only one connection per IP allowed");
    return;
  }*/

  if(!Authorized_Players.has(ip)){
    ws.close(401, "Unauthorized Connection");
  }

  CONNECTED_IPS.set(ip, {type: "client", ws: ws, match: null});

  ws.clientIP = ip;
  ws.type = `client`;
  ws.isAlive = true;

  console.log(`${ip} Connected`);

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch(e) {
      return console.log(e);
    }

    handleMessage(ws, msg);
  });

  ws.on("close", (code, reason) => {
    const ip = ws.clientIP;

    CONNECTED_IPS.delete(ip);
    console.log("Client disconnected:", ip);
  });
});

async function handleMessage(ws, msg) {
  console.log(msg);
  if(CONNECTED_IPS.get(ws.clientIP).match != null){
    if(String(CONNECTED_IPS.get(ws.clientIP).match).includes(`CUSTOM_MATCH::`)){
      const matchID = String(CONNECTED_IPS.get(ws.clientIP).match).replace("CUSTOM_MATCH::", '');
      activeCustomMatches.get(matchID).messageHandler(msg);
    }
    else{
      activeMatches.get(CONNECTED_IPS.get(ws.clientIP).match).messageHandler(msg);
    }
    return;
  }

  switch (String(msg.type).toUpperCase()) {
    default:
      try{
        var ctx;
        switch(String(msg.type).toUpperCase()){
          case `CREATE_ROOM`:
            ctx = createCustomMatch;
            break;
          case `MATCHMAKE`:
            ctx = {queue1v1: queue1v1, queuev3: queuev3, queuev4: queuev4, queuev34: queuev34};
            break;
        }
        var func = wss.funcs.get(String(msg.type).toUpperCase());
        await func.execute(ws, msg, ctx);
      }catch(e){
        console.log(e);
        ws.send(JSON.stringify({
          type: `${String(msg.type).toLowerCase()}`,
          status: 0,
          error: `request-error`
        }));
      }
      break;
  }
}

function connectToCentralServer() {
  centralWS = new WebSocket(CENTRAL_SERVER_URL);

  centralWS.on("open", () => {
    console.log("Connected to CENTRAL server");

    // identify yourself
    sendToCentral({
        type: `submit_gameserver`,
        content: {ip: `${thisIP}`, port: PORT, passkey: `${process.env.CS_ACCESSKEY}`}
      });
  });

  centralWS.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    handleCentralMessage(msg);
  });

  centralWS.on("close", () => {
    console.log("Central server connection closed. Reconnecting...");
    setTimeout(connectToCentralServer, 5000);
  });

  centralWS.on("error", (err) => {
    console.error("Central server error:", err.message);
  });
}

async function handleCentralMessage(msg) {
  console.log(msg);
  if(msg.status) return;
  switch (String(msg.type).toUpperCase()) {
    default:
      try{
        var func = wss.funcs.get(String(msg.type).toUpperCase());
        console.log(func);
        await func.execute(msg);
      }catch(e){
        console.log(e);
      }
      break;
  }
}

export function sendToCentral(payload) {
  if ( centralWS && centralWS.readyState === WebSocket.OPEN) 
  {
    centralWS.send(JSON.stringify(payload));
  }
}

setInterval(() => {
  broadcastState();
}, TICK_INTERVAL);

function broadcastState() {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      console.log("Terminating dead connection:", ws.clientIP);
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();
  });
}

//Handling Rejections and Exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
