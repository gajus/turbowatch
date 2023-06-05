/* eslint-disable no-console */

const { spawn } = require('node:child_process');
const { resolve } = require('node:path');

spawn('node', [resolve(__dirname, 'b.js')], {
  stdio: 'inherit',
});
