import { createMatch } from "./match_manager.js";

// This is queue class definition
class AsyncQueue {
    constructor() {
        this.items = [];
    }

    getNowait() {
        if (this.items.length === 0) {
            throw new Error("QueueEmpty");
        }
        return this.items.shift();
    }

    put(item) {
        this.items.push(item);
    }
}

// This is queue creation
export const queue1v1 = new AsyncQueue();
export const queuev3 = new AsyncQueue();
export const queuev4 = new AsyncQueue();
export const queuev34 = new AsyncQueue();

export function startMatchmaking(){
    matchmaking1v1();
    matchmakingV34();
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// This is 1v1 matchmaking
export async function matchmaking1v1() {
    console.log("[MATCHMAKING] Matchmaking 1v1 running");

    while (true) {
        let players = [];

        // 🔥 DRAIN QUEUE AS MUCH AS POSSIBLE
        while (true) {
            try {
                const player = queue1v1.getNowait();
                if (player.ws.readyState === 1) {
                    players.push(player);
                }
            } catch {
                break; // queue empty
            }
        }

        // Make all possible matches
        players.sort((a, b) => a.score - b.score);

        while (players.length >= 2) {
            const matchPlayers = players.splice(0, 2);
            createMatch("1v1", matchPlayers);
        }

        // Put leftover player back
        players.forEach(p => queue1v1.put(p));

        await sleep(200); // small cooldown, NOT 10s
    }
}

// Matchmaking 3p, 4p, 3 or 4 p
export async function matchmakingV34() {
    console.log("[MATCHMAKING] Matchmaking v34 running");

    while (true) {
        const playersV3 = [];
        const playersV4 = [];
        const playersV34 = [];

        // --- Drain all queues ---
        while (true) {
            let gotPlayer = false;

            // v3 queue
            try {
                const p3 = queuev3.getNowait();
                if (p3.ws.readyState === 1) playersV3.push(p3);
                gotPlayer = true;
            } catch {}

            // v4 queue
            try {
                const p4 = queuev4.getNowait();
                if (p4.ws.readyState === 1) playersV4.push(p4);
                gotPlayer = true;
            } catch {}

            // v34 queue
            try {
                const p34 = queuev34.getNowait();
                if (p34.ws.readyState === 1) playersV34.push(p34);
                gotPlayer = true;
            } catch {}

            if (!gotPlayer) break; // queues empty
        }

        // --- Create all possible 4-player matches first ---
        while (playersV4.length + playersV34.length >= 4) {
            const matchPlayers = [];

            while (matchPlayers.length < 4) {
                if (playersV4.length > 0) matchPlayers.push(playersV4.shift());
                else if (playersV34.length > 0) matchPlayers.push(playersV34.shift());
            }

            createMatch("v4", matchPlayers);
        }

        // --- Then create all possible 3-player matches ---
        while (playersV3.length + playersV34.length >= 3) {
            const matchPlayers = [];

            while (matchPlayers.length < 3) {
                if (playersV3.length > 0) matchPlayers.push(playersV3.shift());
                else if (playersV34.length > 0) matchPlayers.push(playersV34.shift());
            }

            createMatch("v3", matchPlayers);
        }

        // --- Put leftover players back into their queues ---
        playersV3.forEach(p => queuev3.put(p));
        playersV4.forEach(p => queuev4.put(p));
        playersV34.forEach(p => queuev34.put(p));

        // Short cooldown to prevent tight CPU loop
        await sleep(50);
    }
}

