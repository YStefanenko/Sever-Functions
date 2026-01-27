import { Match } from "./match.js";
import { Custom_Match } from "./custom_match.js";
import { CONNECTED_IPS } from "./globalVariables.js";
import { sendToCentral } from "./server.js";
import { activeCustomMatches } from "./globalVariables.js";

export const activeMatches = new Map();

let matchIdCounter = 1;

export function createMatch(mode, players) {
    const id = matchIdCounter++;
    const match = new Match(id, mode, players);
    match.id = id;

    activeMatches.set(id, match);

    match.start().catch(err => {
        console.error("Match failed to start:", err);
        activeMatches.delete(id);
    });

    for (const p of players) {
        CONNECTED_IPS.get(p.ws.clientIP).match = id;
    }

    return id;
}

export function createCustomMatch(id, mode, players, customMap = null) {
    const match = new Custom_Match(id, mode, players);
    match.id = id;
    match.customMap = customMap;

    activeCustomMatches.set(id, match);

    match.start().catch(err => {
        console.error("Match failed to start:", err);
        activeCustomMatches.delete(id);
        sendToCentral({
            type: `close_custom_room`,
            content:{
                code: id
            }
        });
    });

    for (const p of players) {
        CONNECTED_IPS.get(p.ws.clientIP).match = `CUSTOM_MATCH::${id}`;
    }

    return id;
}