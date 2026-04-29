#!/bin/sh
# Lightweight health check using Node.js (always available in the image).
# Port is resolved from the same env vars Nitro uses for its listen port, so
# the probe follows the server when it's rehomed (NITRO_PORT, PORT). Note:
# APP_PORT in docker-compose.selfhost.yml is the host-side port mapping only;
# it doesn't change what the app binds to inside the container, so it is NOT
# consulted here.
# Hitting 127.0.0.1 rather than `localhost` sidesteps the IPv4/IPv6 coin-flip
# some slim images do when resolving localhost.
# On failure, the status + response body (or error) goes to stderr so
# `docker inspect --format='{{json .State.Health}}' <container>` carries a
# diagnostic instead of an empty Output field.
node -e "
const http = require('http');
const port = process.env.NITRO_PORT || process.env.PORT || 3000;
const req = http.get('http://127.0.0.1:' + port + '/api/health', (res) => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (c) => { body += c; });
  res.on('end', () => {
    if (res.statusCode === 200) {
      process.exit(0);
    }
    process.stderr.write('healthcheck failed: port=' + port + ' status=' + res.statusCode + ' body=' + body.slice(0, 512) + '\n');
    process.exit(1);
  });
});
req.on('error', (err) => {
  process.stderr.write('healthcheck error on port ' + port + ': ' + (err && err.message ? err.message : String(err)) + '\n');
  process.exit(1);
});
req.setTimeout(3000, () => {
  req.destroy();
  process.stderr.write('healthcheck timeout after 3s on port ' + port + '\n');
  process.exit(1);
});
"
