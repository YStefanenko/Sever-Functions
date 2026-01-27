import { CONNECTED_IPS, Authorized_Players } from "../globalVariables.js";
import { activeCustomMatches } from "../globalVariables.js";

export default {
  name: 'JOIN_ROOM',
  execute: async (ws, msg, ctx) => {
    const code = msg.content.code;
    
    var custom_map = false;

    var customMap = null;
    const customMatch = activeCustomMatches.get(code);
    if(customMatch.customMap != null){
      customMap = customMatch.customMap;
      custom_map = true;
    }

    if(customMatch.running){
      ws.send(JSON.stringify({
        type: `join_room`,
        status: 0,
      }));
      return;
    }

    const Player = {
      ws: ws,
      username: Authorized_Players.get(ws.clientIP).username,
      title: Authorized_Players.get(ws.clientIP).title,
      elo: Authorized_Players.get(ws.clientIP).elo
    };

    customMatch.players.push(Player);
    CONNECTED_IPS.get(ws.clientIP).match = `CUSTOM_MATCH::${code}`;
    const players = customMatch.players;
    const playerNameList = [];
    for (const p of players) {
        const playerName = `${p.username}`;
        playerNameList.push(playerName);
    }

    ws.send(JSON.stringify({
      type: `join_room`,
      status: 1,
      content: {custom_map: custom_map, map_info: customMap, players: playerNameList, mode: customMatch.mode}
    }));

    console.log(`${Authorized_Players.get(ws.clientIP).username} Joined the ${code} Custom Room.`);
  }
};