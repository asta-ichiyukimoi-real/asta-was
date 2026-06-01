const http = require('http');
const health = require('./health');

let serverInstance = null;

function html(snapshot) {
    const logs = (snapshot.recentLogs || [])
        .slice(0, 20)
        .map(log => `<tr><td>${log.at}</td><td>${log.type}</td><td><pre>${JSON.stringify(log, null, 2)}</pre></td></tr>`)
        .join('');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Asta Bot Dashboard</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #f7f7f5; color: #171717; }
    h1 { margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 20px 0; }
    .card { background: white; border: 1px solid #ddd; border-radius: 8px; padding: 14px; }
    .value { font-size: 28px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; background: white; }
    td, th { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
    pre { white-space: pre-wrap; margin: 0; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Asta Bot Dashboard</h1>
  <div>Status: <strong>${snapshot.health.status || 'unknown'}</strong></div>
  <div class="grid">
    <div class="card"><div>Uptime</div><div class="value">${snapshot.health.uptimeSeconds || 0}s</div></div>
    <div class="card"><div>Memory</div><div class="value">${snapshot.health.memoryMb || 0}MB</div></div>
    <div class="card"><div>Total Commands</div><div class="value">${snapshot.usage.totalCommands || 0}</div></div>
    <div class="card"><div>Pending Reminders</div><div class="value">${snapshot.pendingReminders}</div></div>
  </div>
  <h2>Recent Logs</h2>
  <table><tr><th>Time</th><th>Type</th><th>Details</th></tr>${logs}</table>
</body>
</html>`;
}

function startDashboard(port = 3030) {
    if (serverInstance) return;

    const server = http.createServer((req, res) => {
        const snapshot = health.getSnapshot();

        if (req.url === '/api/health') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(snapshot, null, 2));
            return;
        }

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html(snapshot));
    });

    server.listen(port, '127.0.0.1', () => {
        console.log(`Dashboard running at http://127.0.0.1:${port}`);
    });

    serverInstance = server;
}

module.exports = {
    startDashboard
};
