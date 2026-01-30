import { activeMatches, CONNECTED_IPS, loadRounds, saveRounds } from "./globalVariables.js";
import { sendToCentral } from "./server.js";

export class Match {
    constructor(id, mode, players) {
        this.id = id;
        this.mode = mode;
        this.players = players;
        this.startPlayers = null;
        this.activePlayers = new Map();
        this.startActivePlayers = new Map();
        this.running = false;
        this.tickRate = 997;
        this.interval = null;
        this.messages = [];
        this.peaceTick = 20;
        this.peaceOngoing = true;
        this.endInfo = null;
        this.resolvedEndInfo = false;
    }

    async start() {
        console.log(`[MATCH] Starting ${this.mode} match with`, this.players.map(p => p.username));

        this.running = true;

        await this.setup();

        this.loop();
    }

    async setup() {
        var mapNum;
        if(this.mode === "1v1") mapNum = rand(1, 30);
        else if(this.mode === "v3") mapNum = rand(31, 33);
        else if(this.mode === "v4") mapNum = rand(37, 39);

        this.startPlayers = this.players.map(p => ({
            username: p.username,
            elo: p.elo,
            title: p.title ?? null
        }));

        const playerNameList = [];
        for (const p of this.players) {
            var playerName;
            if(p.title != null){
                playerName = `${p.username} [${p.title}]`;
            }else{
                playerName = `${p.username}`;
            }
            const playerList = [playerName];
            playerNameList.push(playerList);

            this.activePlayers.set(p.username, {peace: false});
        }

        this.startActivePlayers = new Map(this.activePlayers);

        var i = 0;
        for (const p of this.players) {
            await sendToPlayer(p.ws, { type: "match_start", content: {color: i, map: String(mapNum), players: playerNameList }});
            i++;
        }
    }

    loop() {
        this.interval = setInterval(async () => {
            if (!this.running) return;

            try {
                await this.tick();
            } catch (err) {
                console.error("Match loop error:", err);
                this.end(`error`);
            }
        }, this.tickRate);
    }

    async tick() {
        //TICK SETUP
        const allMessages = this.messages;
        this.messages = [];

        if(this.peaceOngoing){
            if(this.peaceTick <= 0){
                this.peaceOngoing = false;
                this.peaceTick = 20;
            }else{
                this.peaceTick -= 1;
            }
        }

        //DISCONNECT DETECTION
        for (const p of this.players) {
            if (!(await isConnected(p))) {
                this.activePlayers.delete(p.username);
                this.players = this.players.filter(player => player.username !== p.username);
            }
        }

        //TICK
        try{
            for (const orderDict of allMessages) {
              for (const [key, value] of Object.entries(orderDict)) {
                  if (key === "game_end") {
                    const playerIndex = value.player_index;
                    const [username, data] = Array.from(this.startActivePlayers)[playerIndex];
                    this.endInfo = value.stats;
                    this.end(`domination`, username);
                    return;
                  }
                  if(key === "surrender"){
                    const playerIndex = value.player_index;
                    const [username, data] = Array.from(this.startActivePlayers)[playerIndex];
                    this.activePlayers.delete(username);
                  }
                  if (key === "peace") {
                    const playerIndex = value.player_index;
                    const [username, data] = Array.from(this.startActivePlayers)[playerIndex];
                    this.peaceTick = 20;
                    this.peaceOngoing = true;
                    const player = this.activePlayers.get(username);
                    if (player) player.peace = true;
                  }
                }
            }
        }catch{}

        //WIN CONDITIONS
        if(this.peaceOngoing){
            var peaceNum = 0;
            for (const [username, data] of this.activePlayers) {
              if(data.peace){
                peaceNum++;
              }
            }

            if(peaceNum === this.activePlayers.size){
                this.end(`peace`);
                return;
            }
        }

        if(this.activePlayers.size === 1){
            this.end(`domination`);
            return;
        }
        

        //SENDING ALL DATA TO USERS
        const data = Object.assign({}, ...allMessages);

        for (const p of this.players) {
            await sendToPlayer(p.ws, { content: data });
        }
    }

    async end(condition, winner = null) {
        let roundsPlayed = loadRounds();
        roundsPlayed++;
        saveRounds(roundsPlayed);

        clearInterval(this.interval);

        if(condition === "error"){
            for (const p of this.players) {
                p.ws.close(1000, "Match Ended");
            }

            activeMatches.delete(this.id);
            return;
        }
        
        if (!this.running) return;

        this.running = false;

        if(condition === "domination" && winner === null){
            winner = this.activePlayers.keys().next().value;
        }

        for (const p of this.players) {
            var value;
            if(winner === p.username) value = 1;
            if(winner != p.username) value = 0;
            if(condition === `peace`) value = 0.5;
            await sendToPlayer(p.ws, { content: {match_over: value}});
        }

        console.log(`[MATCH] Ending ${this.mode} match with winner ${winner}`);

        if(this.endInfo === null){
            await waitForTrue(() => this.resolvedEndInfo === true);
        }

        await sendToCentral({
            type: `score_game`,
            content:{
                players: this.startPlayers,
                winner: winner,
                condition: condition,
                end_info: this.endInfo,
                mode: this.mode,
                elo: true
            }
        });

        for (const p of this.players) {
            p.ws.close(1000, "Match Ended");
        }

        activeMatches.delete(this.id);
    }

    async messageHandler(msg){
        if(this.running){
            this.messages.push(msg)
        }
        if(`stats` in msg){
            this.endInfo = msg;

            this.resolvedEndInfo = true;
        }
    }
}

async function sendToPlayer(ws, msg){
    ws.send(JSON.stringify(msg));
}

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isConnected(player) {
    return player.ws.readyState === 1;
}

function waitForTrue(checkFn, interval = 50) {
  return new Promise(resolve => {
    const timer = setInterval(() => {
      if (checkFn()) {
        clearInterval(timer);
        resolve();
      }
    }, interval);
  });
}