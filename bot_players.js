import Gun from 'gun';

const roomCode = process.argv[2];
if (!roomCode) {
    console.error("Usage: node bot_players.js <ROOM_CODE>");
    process.exit(1);
}

const room = roomCode.toUpperCase();
const GUN_PEERS = ["https://gun-manhattan.herokuapp.com/gun", "https://gun-us.herokuapp.com/gun"];
const roomKey = (room, suffix) => `gf_v4_${room}_${suffix}`;

const gun = new Gun({ peers: GUN_PEERS, localStorage: false, radisk: false });

// Define virtual players
const BOTS_CONFIG = [
    { id: 'bot_gen', name: 'BotGen (OCGT)', role: 'GENERATOR', asset: 'OCGT', cash: 0, daCash: 0, sof: 600, col: '#f0455a' },
    { id: 'bot_bess', name: 'BotBatt (BESS)', role: 'BESS', asset: 'BESS_M', cash: 0, daCash: 0, sof: 50, col: '#38c0fc' },
    { id: 'bot_trader', name: 'BotTrade (Spec)', role: 'TRADER', asset: 'NONE', cash: 5000, daCash: 0, sof: 100, col: '#b78bfa' },
    { id: 'bot_sup', name: 'BotSupply (Retail)', role: 'SUPPLIER', asset: 'NONE', cash: 0, daCash: 0, sof: 100, col: '#38c0fc' },
    { id: 'bot_dsr', name: 'BotFlex (DSR)', role: 'DSR', asset: 'DSR', cash: 0, daCash: 0, sof: 100, col: '#f5b222' },
    { id: 'bot_ic', name: 'BotIC (Link)', role: 'INTERCONNECTOR', asset: 'IC_FR', cash: 0, daCash: 0, sof: 50, col: '#8b5cf6' }
];

let activeBots = [];
let currentSp = null;
let currentPhase = null;
let lastBidsSp = { DA: null, ID: null, BM: null };

// 1. Listen for real players to determine which bots are needed
console.log(`📡 Listening for players in room ${room}...`);
let humanRoles = new Set();
let botsInitialized = false;

gun.get(roomKey(room, "players")).map().on((data, id) => {
    if (data && !data.isBotPlayer && data.role && data.role !== "INSTRUCTOR") {
        humanRoles.add(data.role);
    }
});

// Give the network 3 seconds to sync existing players before spawning bots
setTimeout(() => {
    botsInitialized = true;

    BOTS_CONFIG.forEach(bot => {
        if (!humanRoles.has(bot.role)) {
            activeBots.push(bot);
            gun.get(roomKey(room, "players")).get(bot.id).put({
                name: bot.name,
                asset: bot.asset,
                cash: bot.cash,
                sof: bot.sof,
                role: bot.role,
                isBotPlayer: true,
                lastSeen: Date.now()
            });
            console.log(`🤖 Spawned ${bot.name} to cover ${bot.role} role`);
        } else {
            console.log(`👤 Human is playing ${bot.role} - skipping bot`);
        }
    });

    if (activeBots.length === 0) {
        console.log("🙌 All roles covered by humans! No bots needed.");
    }
}, 3000);

// Keep active bots "alive" on the leaderboard
setInterval(() => {
    activeBots.forEach(bot => gun.get(roomKey(room, "players")).get(bot.id).put({ lastSeen: Date.now() }));
}, 10000);

// 2. Listen to the game state (phase and SP)
gun.get(roomKey(room, "meta")).on((data) => {
    if (data?.sp !== undefined) currentSp = data.sp;

    if (data?.phase !== undefined && data.phase !== currentPhase) {
        currentPhase = data.phase;
        console.log(`\n⏳ Phase changed to: ${currentPhase} (SP ${currentSp})`);

        // Add a slight delay so they don't instabid like robots (though they are robots)
        setTimeout(() => {
            if (currentPhase === 'DA' && lastBidsSp.DA !== currentSp) {
                lastBidsSp.DA = currentSp;
                submitDaBids();
            } else if (currentPhase === 'ID' && lastBidsSp.ID !== currentSp) {
                lastBidsSp.ID = currentSp;
                submitIdBids();
            } else if (currentPhase === 'BM' && lastBidsSp.BM !== currentSp) {
                lastBidsSp.BM = currentSp;
                submitBmBids();
            }
        }, 1500 + Math.random() * 2000); // 1.5 to 3.5 seconds delay
    }
});

function submitDaBids() {
    if (!botsInitialized || activeBots.length === 0) return;
    const daCycle = Math.floor(currentSp / 6); // DA_CYCLE = 6 (must match App.jsx)
    activeBots.forEach(bot => {
        let mw = 0, price = 0, side = 'offer';

        // Simple logic for bots
        if (bot.role === 'GENERATOR') { mw = 300; price = 50 + Math.floor(Math.random() * 10); side = 'offer'; }
        else if (bot.role === 'SUPPLIER') { mw = 250; price = 65 + Math.floor(Math.random() * 10); side = 'bid'; }
        else if (bot.role === 'TRADER') { mw = 100; price = 55 + Math.floor(Math.random() * 15); side = Math.random() > 0.5 ? 'bid' : 'offer'; }
        else if (bot.role === 'BESS') { mw = 50; price = 40 + Math.floor(Math.random() * 10); side = 'bid'; } // charge in DA
        else if (bot.role === 'INTERCONNECTOR') { mw = 100; price = 45 + Math.floor(Math.random() * 10); side = Math.random() > 0.5 ? 'bid' : 'offer'; }

        if (mw > 0) {
            gun.get(roomKey(room, `da_${daCycle}`)).get(bot.id).put({ id: bot.id, name: bot.name, asset: bot.asset, mw, price, side, col: bot.col, isBot: true });
            console.log(`  [DA] ${bot.name} submitted ${side.toUpperCase()} ${mw}MW @ £${price}`);
        }
    });
}

function submitIdBids() {
    if (!botsInitialized || activeBots.length === 0) return;
    activeBots.forEach(bot => {
        let mw = 0, price = 0, side = 'offer';

        if (bot.role === 'GENERATOR') { mw = 50; price = 65 + Math.floor(Math.random() * 10); side = 'offer'; }
        else if (bot.role === 'BESS') { mw = 20; price = 55 + Math.floor(Math.random() * 10); side = 'bid'; }
        else if (bot.role === 'TRADER') { mw = 30; price = 60 + Math.floor(Math.random() * 15); side = Math.random() > 0.5 ? 'bid' : 'offer'; }
        else if (bot.role === 'INTERCONNECTOR') { mw = 20; price = 60 + Math.floor(Math.random() * 10); side = Math.random() > 0.5 ? 'bid' : 'offer'; }

        if (mw > 0) {
            gun.get(roomKey(room, `id_${currentSp}`)).get(bot.id).put({ id: bot.id, name: bot.name, asset: bot.asset, mw, price, side, col: bot.col, isBot: true });
            console.log(`  [ID] ${bot.name} placed ${side.toUpperCase()} ORDER ${mw}MW @ £${price}`);
        }
    });
}

function submitBmBids() {
    if (!botsInitialized || activeBots.length === 0) return;
    activeBots.forEach(bot => {
        let mw = 0, price = 0, side = 'offer';

        if (bot.role === 'GENERATOR') { mw = 150; price = 75 + Math.floor(Math.random() * 15); side = 'offer'; }
        else if (bot.role === 'BESS') { mw = 50; price = 85 + Math.floor(Math.random() * 20); side = 'offer'; } // discharge in BM
        else if (bot.role === 'DSR') { mw = 30; price = 150 + Math.floor(Math.random() * 50); side = 'offer'; } // expensive demand turn-down
        else if (bot.role === 'TRADER') { mw = 40; price = 70 + Math.floor(Math.random() * 10); side = 'bid'; }
        else if (bot.role === 'INTERCONNECTOR') { mw = 50; price = 75 + Math.floor(Math.random() * 15); side = Math.random() > 0.5 ? 'bid' : 'offer'; }

        if (mw > 0) {
            gun.get(roomKey(room, `bm_${currentSp}`)).get(bot.id).put({ id: bot.id, name: bot.name, asset: bot.asset, mw, price, side, col: bot.col, isBot: true });
            console.log(`  [BM] ${bot.name} submitted ${side.toUpperCase()} ${mw}MW @ £${price}`);
        }
    });
}

console.log(`Listening for market phases... (Press Ctrl+C to exit)`);
