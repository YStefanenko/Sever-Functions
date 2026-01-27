import { CONNECTED_IPS, Authorized_Players } from "../globalVariables.js";

export default {
  name: 'CREATE_ROOM',
  execute: async (ws, msg, ctx) => {
    const code = msg.content.code;
    const type = msg.content.mode;
    const customMap = msg.content.custom_map;
    var mapInfo = null;

    const createCustomMatch = ctx;

    if(customMap){
      mapInfo = msg.content.map_info;
    }

    const Player = {
      ws: ws,
      username: Authorized_Players.get(ws.clientIP).username,
      title: Authorized_Players.get(ws.clientIP).title,
      elo: Authorized_Players.get(ws.clientIP).elo
    };

    await createCustomMatch(code, type, [Player], mapInfo);

    const playerNameList = [`${Authorized_Players.get(ws.clientIP).username}`];

    ws.send(JSON.stringify({
      type: `create_room`,
      status: 1,
      content: {players: playerNameList}
    }));

    console.log(`${Authorized_Players.get(ws.clientIP).username} Created the ${code} Custom Room.`);
  }
};