/* eslint-disable no-console */

setInterval(() => {
  console.log('b');
}, 1_000);

process.on('SIGTERM', () => {
  console.log('b: SIGTERM');
});
