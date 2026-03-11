const path = require('path');
const express = require('express');
const Gun = require('gun');

const app = express();

const PORT = process.env.PORT ? Number(process.env.PORT) : 80;
const DIST_DIR = path.join(__dirname, 'dist');

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

app.use(Gun.serve);

app.get('/gun', (req, res) => {
  res.send('Gun relay endpoint is running');
});

app.use(express.static(DIST_DIR));

app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`GridForge server listening on port ${PORT}`);
});

Gun({ web: server, file: 'radata' });
