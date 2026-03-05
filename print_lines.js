const fs = require('fs');
const lines = fs.readFileSync('src/App.jsx','utf-8').split('\n');
for (let i = 760; i <= 790; i++) {
  console.log(i, lines[i-1]);
}
