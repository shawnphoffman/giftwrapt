#!/bin/sh
# Lightweight health check using Node.js (always available in the image).
node -e "
const http = require('http');
const req = http.get('http://localhost:3000/api/health', (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on('error', () => process.exit(1));
req.setTimeout(3000, () => { req.destroy(); process.exit(1); });
"
