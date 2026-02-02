import { createMatch } from "./match_manager.js";

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

export const queue1v1 = new AsyncQueue();
export const queuev3 = new AsyncQueue();
export const queuev4 = new AsyncQueue();
export const queuev34 = new AsyncQueue();

export function startMatchmaking(){
    matchmaking1v1();
    matchmakingV34();
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function matchmaking1v1() {
    console.log("[MATCHMAKING] Matchmaking 1v1 running");

    while (true) {
        try {
            let players = [];

            // Drain queue with event loop yields to prevent blocking
            let drainIterations = 0;
            while (true) {
                try {
                    const player = queue1v1.getNowait();
                    if (player.ws.readyState === 1) {
                        players.push(player);
                    }
                    // Yield every 100 dequeues to prevent event loop starvation
                    if (++drainIterations % 100 === 0) {
                        await new Promise(res => setImmediate(res));
                    }
                } catch {
                    break;
                }
            }

            players.sort((a, b) => a.score - b.score);

            while (players.length >= 2) {
                const matchPlayers = players.splice(0, 2);
                createMatch("1v1", matchPlayers);
            }

            players.forEach(p => queue1v1.put(p));

            await sleep(500);
        } catch (err) {
            console.error("[MATCHMAKING] 1v1 error:", err);
            await sleep(1000);
        }
    }
}

export async function matchmakingV34() {
    console.log("[MATCHMAKING] Matchmaking v34 running");

    while (true) {
        try {
            const playersV3 = [];
            const playersV4 = [];
            const playersV34 = [];

            let drainIterations = 0;
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

                // Yield to event loop every 100 iterations
                if (++drainIterations % 100 === 0) {
                    await new Promise(res => setImmediate(res));
                }

                if (!gotPlayer) break;
            }

            //Create all possible 4-player matches first
            while (playersV4.length + playersV34.length >= 4) {
                const matchPlayers = [];

                while (matchPlayers.length < 4) {
                    if (playersV4.length > 0) matchPlayers.push(playersV4.shift());
                    else if (playersV34.length > 0) matchPlayers.push(playersV34.shift());
                }

                createMatch("v4", matchPlayers);
            }

            //Then create all possible 3-player matches
            while (playersV3.length + playersV34.length >= 3) {
                const matchPlayers = [];

                while (matchPlayers.length < 3) {
                    if (playersV3.length > 0) matchPlayers.push(playersV3.shift());
                    else if (playersV34.length > 0) matchPlayers.push(playersV34.shift());
                }

                createMatch("v3", matchPlayers);
            }

            //Put leftover players back into their queues
            playersV3.forEach(p => queuev3.put(p));
            playersV4.forEach(p => queuev4.put(p));
            playersV34.forEach(p => queuev34.put(p));

            // Increased cooldown for better event loop health
            await sleep(500);
        } catch (err) {
            console.error("[MATCHMAKING] v34 error:", err);
            await sleep(1000);
        }
    }
}

