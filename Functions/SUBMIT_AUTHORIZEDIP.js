import { CONNECTED_IPS, Authorized_Players } from "../globalVariables.js";

export default {
  name: 'SUBMIT_AUTHORIZEDIP',
  execute: async (msg) => {
    const ip = msg.content.ip;
    const username = msg.content.username;
    const title = msg.content.title;
    const elo = msg.content.elo;

    Authorized_Players.set(ip, {username: username, title: title, elo: elo});
    console.log(`[AUTH] ${username} Whitelisted on ${process.env.name}`);
  }
};