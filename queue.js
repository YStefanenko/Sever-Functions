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


// This is 1v1 matchmaking
export async function matchmaking1v1() {
    console.log("Matchmaking 1v1 running");

    while (true) {
        let players = [];

        while (players.length < 2) {
            try {
                const player = queue1v1.getNowait();
                players.push(player);
            } catch (err) {
                // Remove disconnected players
                for (let i = players.length - 1; i >= 0; i--) {
                    // Check if the player is connected (if you already have a funciton like that)
                    if (!(await isConnected(players[i]))) {
                        await disconnect(players[i]);
                        players.splice(i, 1);
                    }
                }

                await sleep(10_000);
            }
        }

        // Sort by score (ascending)
        players.sort((a, b) => a.score - b.score);

        const matches = [];

        while (players.length >= 2) {
            const matchPlayers = players.slice(0, 2);
            matches.push(matchPlayers);
            players = players.slice(2);
        }

        for (const matchPlayers of matches) {
            gameSession("1v1", matchPlayers)
                .catch(err => console.error("Game session error:", err));
        }
    }
} 

// Matchmaking 3p, 4p, 3 or 4 p
export async function matchmakingV34() {
    console.log("Matchmaking v34 running");

    let playersV3 = [];
    let playersV4 = [];
    let playersV34 = [];

    while (true) {
        while (
            playersV3.length + playersV34.length < 3 &&
            playersV4.length + playersV34.length < 4
        ) {
            // ---- v3 queue ----
            try {
                const player = queueV3.getNowait();
                playersV3.push(player);
            } catch (err) {
                for (let i = playersV3.length - 1; i >= 0; i--) {
                    if (!(await isConnected(playersV3[i]))) {
                        await disconnect(playersV3[i]);
                        playersV3.splice(i, 1);
                    }
                }
                await sleep(1_000);
            }

            // ---- v4 queue ----
            try {
                const player = queueV4.getNowait();
                playersV4.push(player);
            } catch (err) {
                for (let i = playersV4.length - 1; i >= 0; i--) {
                    if (!(await isConnected(playersV4[i]))) {
                        await disconnect(playersV4[i]);
                        playersV4.splice(i, 1);
                    }
                }
                await sleep(1_000);
            }

            // ---- v34 queue ----
            try {
                const player = queueV34.getNowait();
                playersV34.push(player);
            } catch (err) {
                for (let i = playersV34.length - 1; i >= 0; i--) {
                    if (!(await isConnected(playersV34[i]))) {
                        await disconnect(playersV34[i]);
                        playersV34.splice(i, 1);
                    }
                }
                await sleep(1_000);
            }
        }

        // ---- Create match ----
        if (playersV4.length + playersV34.length >= 4) {
            const selectedPlayers = [];

            while (selectedPlayers.length < 4) {
                if (playersV4.length > 0) {
                    selectedPlayers.push(playersV4.shift());
                } else if (playersV34.length > 0) {
                    selectedPlayers.push(playersV34.shift());
                }
            }

            gameSession("v4", selectedPlayers)
                .catch(err => console.error("v4 session error:", err));
        } else {
            const selectedPlayers = [];

            while (selectedPlayers.length < 3) {
                if (playersV3.length > 0) {
                    selectedPlayers.push(playersV3.shift());
                } else if (playersV34.length > 0) {
                    selectedPlayers.push(playersV34.shift());
                }
            }

            gameSession("v3", selectedPlayers)
                .catch(err => console.error("v3 session error:", err));
        }
    }
}

