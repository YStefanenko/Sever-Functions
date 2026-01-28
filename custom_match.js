import { activeCustomMatches, CONNECTED_IPS } from "./globalVariables.js";
import { sendToCentral } from "./server.js";

export class Custom_Match {
    constructor(id, mode, players) {
        this.id = id;
        this.mode = mode;
        this.players = players;
        this.startPlayers = null;
        this.spectators = [];
        this.activePlayers = new Map();
        this.startActivePlayers = new Map();
        this.running = false;
        this.tickRate = 997;
        this.interval = null;
        this.waitInterval = null;
        this.messages = [];
        this.peaceTick = 20;
        this.peaceOngoing = true;
        this.endInfo = null;
        this.resolvedEndInfo = false;
        this.matchStartInfo = null;
        this.gameReady = false;
        this.customMap = null;
    }

    async start() {
        console.log(`Starting ${this.mode} match with`, this.players.map(p => p.username));

        this.waiting();

        await waitForTrue(() => this.gameReady === true);

        this.running = true;

        await this.setup();

        this.loop();
    }

    waiting(){
        this.waitInterval = setInterval(async () => {
            try {
                await this.waitTick();
            } catch (err) {
                console.error("Match loop error:", err);
                this.end(`error`);
            }
        }, this.tickRate);
    }

    async waitTick(){
        if(this.matchStartInfo != null){
            var minPlayers;
            if(this.mode === "1v1") minPlayers = 2;
            else if(this.mode === "v3") minPlayers = 3;
            else if(this.mode === "v4") minPlayers = 4;

            if(this.matchStartInfo.type === "start_room" && this.players.length >= minPlayers){
                var i = 0;
                
                this.gameReady = true;
                clearInterval(this.waitInterval);
                return;
            } else{
                this.matchStartInfo = null;
            }
        }

        //DISCONNECT DETECTION
        for (const p of this.players) {
            if (!(await isConnected(p))) {
                this.players = this.players.filter(player => player.username !== p.username);
                console.log(`${p.username} Disconnected from ${this.id} Custom Match.`);
            }
        }

        if(this.players.length === 0 || this.players === null){
            this.end(`error`);
            clearInterval(this.waitInterval);
            return;
        }

        const playerNameList = [];
        for (const p of this.players) {
            const playerName = `${p.username}`;
            playerNameList.push(playerName);
        }

        var i = 0;
        for (const p of this.players) {
            var ready = false;
            var minPlayers;
            if(this.mode === "1v1") minPlayers = 2;
            else if(this.mode === "v3") minPlayers = 3;
            else if(this.mode === "v4") minPlayers = 4;

            if(i===0 && this.players.length >= minPlayers) ready = true;
            await sendToPlayer(p.ws, { type: "room_info", content: {players:  playerNameList, player_index: i, ready: ready}});
            i++;
        }
    }

    async setup() {
        var mapNum;
        if(this.mode === "1v1") mapNum = rand(1, 30);
        else if(this.mode === "v3") mapNum = rand(31, 33);
        else if(this.mode === "v4") mapNum = rand(37, 39);

        var minPlayers;
        if(this.mode === "1v1") minPlayers = 2;
        else if(this.mode === "v3") minPlayers = 3;
        else if(this.mode === "v4") minPlayers = 4;

        this.spectators = this.players.splice(minPlayers);

        this.startPlayers = this.players.map(p => ({
            username: p.username,
            elo: p.elo,
            title: p.title ?? null
        }));
        
        for (const p of this.players) {
            console.log(`Player ${p.username} is in the game.`);
        }
        for (const p of this.spectators) {
            console.log(`Spectator ${p.username} is in the game.`);
        }

        console.log(this.players + "\n" + this.spectators);

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

        for (const p of this.spectators) {
            await sendToPlayer(p.ws, { type: "match_start", content: {color: null, map: String(mapNum), players: playerNameList }});
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
                console.log(`Player ${p.username} disconnected from match.`);
            }
        }

        for (const p of this.spectators) {
            if (!(await isConnected(p))) {
                this.spectators = this.spectators.filter(spectator => spectator.username !== p.username);
            }
        }

        //TICK
        try{
            for (const orderDict of allMessages) {
              for (const [key, value] of Object.entries(orderDict)) {
                  if (key === "game_end") {
                    console.log(`GAME END`);
                    const playerIndex = value.player_index;
                    const [username, data] = Array.from(this.startActivePlayers)[playerIndex];
                    this.endInfo = value.end_info;
                    this.end(`domination`, username);
                    return;
                  }
                  if(key === "surrender"){
                    console.log(`SURRENDER`);
                    const playerIndex = value.player_index;
                    const [username, data] = Array.from(this.startActivePlayers)[playerIndex];
                    this.activePlayers.delete(username);
                  }
                  if (key === "peace") {
                    console.log("PEACE");
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

        if(this.activePlayers.size < 1){
            this.end(`error`);
        }
        

        //SENDING ALL DATA TO USERS
        const data = Object.assign({}, ...allMessages);

        for (const p of this.players) {
            await sendToPlayer(p.ws, { content: data });
        }

        for (const p of this.spectators) {
            await sendToPlayer(p.ws, { content: data });
        }
    }

    async end(condition, winner = null) {
        if(condition === "error"){
            sendToCentral({
            type: `close_custom_room`,
                content:{
                    code: this.id
                }
            });

            activeCustomMatches.delete(this.id);

            for (const p of this.players) {
                p.ws.close(1000, "Match Ended");
            }

            for (const p of this.spectators) {
                p.ws.close(1000, "Match Ended");
            }
            return;
        }
        if (!this.running) return;
        this.running = false;

        clearInterval(this.interval);

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

        for (const p of this.spectators) {
            var value = -1;
            await sendToPlayer(p.ws, { content: {match_over: value}});
        }

        console.log(`Ending ${this.mode} match with winner ${winner}`);

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
                mode:  this.mode,
                elo: false
            }
        });

        await sendToCentral({
            type: `close_custom_room`,
            content:{
                code: this.id
            }
        });

        for (const p of this.players) {
            p.ws.close(1000, "Match Ended");
        }

        for (const p of this.spectators) {
            p.ws.close(1000, "Match Ended");
        }

        activeCustomMatches.delete(this.id);
    }

    async messageHandler(msg){
        if(this.running && msg.type != "start_room"){
            this.messages.push(msg)
        }
        else{
            if(`stats` in msg){
                this.endInfo = msg;

                this.resolvedEndInfo = true;
            }

            if(msg.type === "start_room"){
                this.matchStartInfo = msg;
            }
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