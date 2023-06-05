/* eslint-disable no-console */

const { spawn } = require('node:child_process');
const { resolve } = require('node:path');

const b = spawn('node', [resolve(__dirname, 'b.js')]);

b.stdout.on('data', (data) => {
  console.log(data.toString());
});
