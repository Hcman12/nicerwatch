'use strict';

/**
 * Nicer Watch - static server + health endpoint.
 * Zero dependencies: runs on plain Node.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const VERSION = '1.0.0';
const STARTED_AT = new Date();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// Assets the watch cannot render without.
const REQUIRED_ASSETS = ['index.html', 'watch.js', 'styles.css', 'vendor/three.min.js'];

let requestCount = 0;

function buildHealth() {
  const checks = [];

  for (const asset of REQUIRED_ASSETS) {
    let ok = false;
    let detail = 'missing';
    try {
      const stat = fs.statSync(path.join(PUBLIC_DIR, asset));
      ok = stat.isFile() && stat.size > 0;
      detail = ok ? stat.size + ' bytes' : 'empty file';
    } catch (err) {
      detail = err.code || 'unreadable';
    }
    checks.push({ name: 'asset:' + asset, status: ok ? 'pass' : 'fail', detail });
  }

  const heapMb = process.memoryUsage().heapUsed / 1048576;
  const heapLimitMb = 512;
  checks.push({
    name: 'memory',
    status: heapMb < heapLimitMb ? 'pass' : 'warn',
    detail: heapMb.toFixed(1) + ' MB heap used (limit ' + heapLimitMb + ' MB)'
  });

  checks.push({
    name: 'event_loop',
    status: 'pass',
    detail: 'responsive after ' + process.uptime().toFixed(1) + 's uptime'
  });

  const failed = checks.filter(function (c) { return c.status === 'fail'; });
  const warned = checks.filter(function (c) { return c.status === 'warn'; });
  const status = failed.length ? 'unhealthy' : warned.length ? 'degraded' : 'healthy';

  return {
    status: status,
    service: 'nicer-watch',
    version: VERSION,
    timestamp: new Date().toISOString(),
    startedAt: STARTED_AT.toISOString(),
    uptimeSeconds: Number(process.uptime().toFixed(3)),
    serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    serverLocalTime: new Date().toLocaleString(),
    requestsServed: requestCount,
    runtime: {
      node: process.version,
      platform: process.platform + ' ' + os.release(),
      pid: process.pid
    },
    checks: checks
  };
}

function healthPage(health) {
  const color =
    health.status === 'healthy' ? '#2fd07a' : health.status === 'degraded' ? '#f5c14b' : '#ff5a5a';

  const rows = health.checks
    .map(function (c) {
      const dot = c.status === 'pass' ? '#2fd07a' : c.status === 'warn' ? '#f5c14b' : '#ff5a5a';
      return (
        '<tr><td><span class="dot" style="background:' + dot + '"></span>' + c.name + '</td>' +
        '<td class="s">' + c.status + '</td><td class="d">' + c.detail + '</td></tr>'
      );
    })
    .join('\n');

  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Nicer Watch health</title><style>',
    ':root{color-scheme:dark}',
    'body{margin:0;background:#0b0d12;color:#e8ecf3;font:14px/1.5 ui-sans-serif,system-ui,"Segoe UI",sans-serif;padding:40px 20px}',
    '.wrap{max-width:760px;margin:0 auto}',
    'h1{font-size:20px;letter-spacing:.16em;text-transform:uppercase;margin:0 0 4px;font-weight:600}',
    '.sub{color:#8a93a6;margin:0 0 26px}',
    '.badge{display:inline-flex;align-items:center;gap:10px;background:#141922;border:1px solid #222a38;border-radius:999px;padding:10px 20px;font-size:15px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}',
    '.pulse{width:10px;height:10px;border-radius:50%;background:' + color + ';box-shadow:0 0 0 0 ' + color + ';animation:p 2s infinite}',
    '@keyframes p{70%{box-shadow:0 0 0 9px transparent}100%{box-shadow:0 0 0 0 transparent}}',
    'table{width:100%;border-collapse:collapse;margin-top:24px;background:#10141c;border:1px solid #1e2532;border-radius:12px;overflow:hidden}',
    'td,th{padding:11px 14px;border-bottom:1px solid #1a2130;text-align:left;vertical-align:top}',
    'tr:last-child td{border-bottom:none}',
    'th{color:#8a93a6;font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.1em;background:#141a24}',
    '.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:9px}',
    '.s{text-transform:uppercase;font-size:12px;letter-spacing:.08em;color:#a9b3c6}',
    '.d{color:#8a93a6}',
    '.meta{margin-top:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}',
    '.card{background:#10141c;border:1px solid #1e2532;border-radius:12px;padding:14px 16px}',
    '.card b{display:block;color:#8a93a6;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:500;margin-bottom:5px}',
    'a{color:#7fb2ff}code{background:#141a24;padding:2px 6px;border-radius:5px;color:#a9b3c6}',
    '</style></head><body><div class="wrap">',
    '<h1>Nicer Watch</h1><p class="sub">Health endpoint &middot; v' + health.version + '</p>',
    '<div class="badge"><span class="pulse"></span>' + health.status + '</div>',
    '<div class="meta">',
    '<div class="card"><b>Uptime</b>' + health.uptimeSeconds.toFixed(1) + 's</div>',
    '<div class="card"><b>Server time</b>' + health.serverLocalTime + '</div>',
    '<div class="card"><b>Timezone</b>' + health.serverTimezone + '</div>',
    '<div class="card"><b>Requests served</b>' + health.requestsServed + '</div>',
    '<div class="card"><b>Node</b>' + health.runtime.node + '</div>',
    '<div class="card"><b>PID</b>' + health.runtime.pid + '</div>',
    '</div>',
    '<table><tr><th>Check</th><th>Status</th><th>Detail</th></tr>' + rows + '</table>',
    '<p class="sub" style="margin-top:24px">Raw JSON: <a href="/healthz?format=json">/healthz?format=json</a>',
    ' &middot; back to the <a href="/">watch</a> &middot; <code>curl localhost:' + PORT + '/healthz</code> returns JSON.</p>',
    '</div></body></html>'
  ].join('\n');
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, rel);

  // Refuse anything that escapes public/.
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

const server = http.createServer(function (req, res) {
  requestCount++;
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (url.pathname === '/healthz' || url.pathname === '/healthz/' || url.pathname === '/health') {
    const health = buildHealth();
    const code = health.status === 'unhealthy' ? 503 : 200;
    const format = url.searchParams.get('format');
    const wantsHtml =
      format === 'html' ||
      (format !== 'json' && String(req.headers.accept || '').indexOf('text/html') !== -1);

    if (wantsHtml) {
      res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(healthPage(health));
    }
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify(health, null, 2));
  }

  if (url.pathname === '/api/time') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(
      JSON.stringify({
        iso: new Date().toISOString(),
        epochMs: Date.now(),
        serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
    );
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, function () {
  console.log('');
  console.log('  NICER WATCH');
  console.log('  ----------------------------------------');
  console.log('  Watch    http://localhost:' + PORT + '/');
  console.log('  Health   http://localhost:' + PORT + '/healthz');
  console.log('  JSON     http://localhost:' + PORT + '/healthz?format=json');
  console.log('');
});
