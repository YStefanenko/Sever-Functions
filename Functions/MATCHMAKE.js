import { CONNECTED_IPS, Authorized_Players } from "../globalVariables.js";
import { queue1v1, queuev3, queuev4, queuev34 } from "../queue.js";

export default {
  name: 'MATCHMAKE',
  execute: async (ws, msg) => {
    const type = msg.content.type;

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
  }
};