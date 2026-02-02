import { WebSocketServer } from "ws";
import WebSocket from "ws";
import fs from 'fs';
import path from 'path';
import dotenv from "dotenv";
import { CONNECTED_IPS, Authorized_Players } from "./globalVariables.js";
import send from "send";
import websocketserver from "websocketserver";
import { activeCustomMatches, activeMatches } from "./globalVariables.js";
import { startMatchmaking } from "./queue.js";
import { createCustomMatch } from "./match_manager.js";
import { queue1v1, queuev3, queuev4, queuev34 } from "./queue.js";

dotenv.config();

const PORT = process.env.port;
const TICK_INTERVAL = 10000;
const HEARTBEAT_INTERVAL = 30000;
const MAX_MISSED_PONGS = 2;
const thisIP =`${process.env.this_IP}`;
const HEARTBEAT_SPREAD_MS = 5000;

const CENTRAL_SERVER_URL = `${process.env.CS_IP}`;
let centralWS = null;

const wss = new WebSocketServer({ port: PORT });
connectToCentralServer();

console.log(`[SERVER] WebSocket server running on ${PORT}`);

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
console.log("[SERVER] Loaded " + funcNum + " FUNCTIONS.");

startMatchmaking();
await import('./stats-website.js');

wss.on("connection", (ws, request) => {
  const ip = String(request.headers["x-forwarded-for"]?.split(",")[0] || request.socket.remoteAddress).replace("::ffff:", "");
  /*if (CONNECTED_IPS.has(ip)) {
    console.log(`[SERVER] Rejected duplicate connection from ${ip}`);
    ws.close(1008, "Only one connection per IP allowed");
    return;
  }*/

  if(!Authorized_Players.has(ip)){
    ws.close(1008, "Unauthorized Connection");
  }

  CONNECTED_IPS.set(ip, {type: "client", ws: ws, match: null});

  ws.clientIP = ip;
  ws.type = `client`;
  ws.missedPongs = 0;
  ws.isAlive = true;

  //console.log(`${ip} Connected`);

  ws.on("pong", () => {
    ws.missedPongs = 0;
    ws.isAlive = true;
  });

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch(e) {
      return console.log(`[ERR] ${e}`);
    }

    handleMessage(ws, msg);
  });

  ws.on("close", (code, reason) => {
    const ip = ws.clientIP;

    CONNECTED_IPS.delete(ip);
    //console.log("Client disconnected:", ip);
  });
});

async function handleMessage(ws, msg) {
  //console.log(msg);
  if(CONNECTED_IPS.get(ws.clientIP).match != null){
    try{
      if(String(CONNECTED_IPS.get(ws.clientIP).match).includes(`CUSTOM_MATCH::`)){
        const matchID = String(CONNECTED_IPS.get(ws.clientIP).match).replace("CUSTOM_MATCH::", '');
        activeCustomMatches.get(matchID).messageHandler(msg);
      }
      else{
        activeMatches.get(CONNECTED_IPS.get(ws.clientIP).match).messageHandler(msg);
      }
      return;
    }catch{}
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
        //console.log(e);
        ws.send(JSON.stringify({
          type: `${String(msg.type).toLowerCase()}`,
          status: 0,
          error: `request-error`
        }));
      }
      break;
  }
}

async function connectToCentralServer() {
  centralWS = new WebSocket(CENTRAL_SERVER_URL);

  centralWS.on("open", async () => {
    console.log("[CS] Connected to CENTRAL server");

    // identify yourself
    await sendToCentral({
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
    console.log("[CS] Central server connection closed. Reconnecting...");
    setTimeout(connectToCentralServer, 5000);
  });

  centralWS.on("error", (err) => {
    console.error("[CS-ERR] ", err.message);
  });
}

async function handleCentralMessage(msg) {
  //console.log(msg);
  if(msg.status) return;
  switch (String(msg.type).toUpperCase()) {
    default:
      try{
        var func = wss.funcs.get(String(msg.type).toUpperCase());
        await func.execute(msg);
      }catch(e){
        console.log(`[CS ERR] ${e} MSG RECEIVED: ${msg}`);
      }
      break;
  }
}

export async function sendToCentral(payload) {
  if (!centralWS || centralWS.readyState !== WebSocket.OPEN) {
    console.log("[CS ERR] Central server not ready.");
    return setTimeout(() => sendToCentral(payload), 5000);
  }

  console.log(`[CS] SENT TO CENTRAL: ${JSON.stringify(payload)}`);
  centralWS.send(JSON.stringify(payload));
}

setInterval(() => {
  broadcastState();
}, HEARTBEAT_INTERVAL);

async function broadcastState() {
  const clients = Array.from(wss.clients);
  const delayPerClient = HEARTBEAT_SPREAD_MS / Math.max(clients.length, 1);

  for (let i = 0; i < clients.length; i++) {
    const ws = clients[i];

    if (ws.missedPongs >= MAX_MISSED_PONGS) {
      console.log("[CONNECTION] Terminating stale connection:", ws.clientIP);
      ws.terminate();
      continue;
    }

    ws.missedPongs++;
    ws.ping();

    // Spread heartbeats over time and yield to event loop
    if (i % 10 === 0) {
      await new Promise(res => setTimeout(res, delayPerClient * 10));
    }
  }
}

setInterval(() => {
  const start = Date.now();
  setImmediate(() => {
    const lag = Date.now() - start;
    if (lag > 200) {
      console.log(`[LAG] Event loop blocked for ${lag}ms`);
    }
  });
}, 1000);

//Handling Rejections and Exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
