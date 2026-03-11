/**
 * gun-relay.cjs
 *
 * Lightweight local GunDB relay server.
 * Enables cross-browser data synchronization for multiplayer sessions.
 *
 * Usage:
 *   node gun-relay.cjs          # starts on port 8765
 *   PORT=9000 node gun-relay.cjs  # custom port
 */

const express = require('express');
const Gun = require('gun');

const PORT = process.env.PORT || 8765;
const app = express();

// Allow CORS for dev server
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

app.use(Gun.serve);

// Explicit /gun route handler to avoid 404
app.get('/gun', (req, res) => {
    res.send('Gun relay endpoint is running');
});

const server = app.listen(PORT, () => {
    console.log(`⚡ Gun relay server running on http://localhost:${PORT}/gun`);
});

Gun({ web: server });
