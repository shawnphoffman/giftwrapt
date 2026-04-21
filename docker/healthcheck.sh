#!/bin/sh
# Lightweight health check using Node.js (always available in the image).
# On failure, dump the status + response body to stderr so
# `docker inspect --format='{{json .State.Health}}' <container>` carries a
# diagnostic. Previously the script only exited non-zero, leaving the operator
# guessing why the probe was unhealthy.
node -e "
const http = require('http');
const req = http.get('http://localhost:3000/api/health?verbose=1', (res) => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (c) => { body += c; });
  res.on('end', () => {
    if (res.statusCode === 200) {
      process.exit(0);
    }
    process.stderr.write('healthcheck failed: status=' + res.statusCode + ' body=' + body.slice(0, 512) + '\n');
    process.exit(1);
  });
});
req.on('error', (err) => {
  process.stderr.write('healthcheck error: ' + (err && err.message ? err.message : String(err)) + '\n');
  process.exit(1);
});
req.setTimeout(3000, () => {
  req.destroy();
  process.stderr.write('healthcheck timeout after 3s\n');
  process.exit(1);
});
"
