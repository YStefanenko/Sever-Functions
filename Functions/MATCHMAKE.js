import { CONNECTED_IPS, Authorized_Players } from "../globalVariables.js";

export default {
  name: 'MATCHMAKE',
  execute: async (ws, msg, ctx) => {
    const type = msg.content.type;

    const queue1v1 = ctx.queue1v1;
    const queuev3 = ctx.queuev3;
    const queuev4 = ctx.queuev4;
    const queuev34 = ctx.queuev34;

    const Player = {
      ws: ws,
      username: Authorized_Players.get(ws.clientIP).username,
      title: Authorized_Players.get(ws.clientIP).title,
      elo: Authorized_Players.get(ws.clientIP).elo
    };

    switch(type){
      case `1v1`:
        queue1v1.put(Player);
        break;
      case `v3`:
        queuev3.put(Player);
        break;
      case `v4`:
        queuev4.put(Player);
        break;
      case `v34`:
        queuev34.put(Player);
        break;
    }

    ws.send(JSON.stringify({
      type: `matchmake`,
      status: 1,
    }));

    console.log(`${Authorized_Players.get(ws.clientIP).username} Joined the ${String(type).toUpperCase()} Queue.`);
  }
};