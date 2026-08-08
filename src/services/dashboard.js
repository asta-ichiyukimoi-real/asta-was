const http = require('http');
const health = require('./health');

let serverInstance = null;

// Lazy load stats to avoid circular dependencies
let statsManager = null;
function getStats() {
    if (!statsManager) {
        try {
            statsManager = require('../models/stats');
        } catch (e) {
            console.log('Stats module not initialized yet');
            return null;
        }
    }
    return statsManager;
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
}

function getStatusColor(status) {
    if (status === 'online') return '#10b981';
    if (status === 'connected') return '#0ea5e9';
    return '#ef4444';
}

function getStatusBg(status) {
    if (status === 'online') return '#dcfce7';
    if (status === 'connected') return '#cffafe';
    return '#fee2e2';
}

async function html(snapshot) {
    const status = snapshot.health?.status || 'offline';
    const uptime = snapshot.health?.uptimeSeconds || 0;
    const memory = snapshot.health?.memoryMb || 0;
    const memoryPercent = Math.min(100, (memory / 512) * 100);
    const totalCommands = snapshot.usage?.totalCommands || 0;
    const pendingReminders = snapshot.pendingReminders || 0;
    
    // Get stats if available
    const stats = getStats();
    let allStats = null;
    let topCommands = [];
    let topUsers = [];
    let topChats = [];
    
    if (stats) {
        try {
            allStats = await stats.getAllStats();
            topCommands = allStats?.topCommands || [];
            topUsers = allStats?.topUsers || [];
            topChats = allStats?.topChats || [];
            await stats.recordDailyStats();
        } catch (error) {
            console.error('Error getting stats for dashboard:', error);
        }
    }
    
    const logs = (snapshot.recentLogs || [])
        .slice(0, 15)
        .map(log => {
            const logType = log.type || 'info';
            const logColor = logType === 'error' ? '#ef4444' : logType === 'warn' ? '#f59e0b' : '#0ea5e9';
            return `<tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; color: #666; font-size: 12px;">${log.at || new Date().toLocaleTimeString()}</td>
                <td style="padding: 12px;"><span style="background: ${logColor}20; color: ${logColor}; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${logType.toUpperCase()}</span></td>
                <td style="padding: 12px; color: #444; font-size: 12px;"><pre style="white-space: pre-wrap; margin: 0; font-family: 'Monaco', 'Menlo', monospace;">${JSON.stringify(log, null, 2).substring(0, 80)}</pre></td>
            </tr>`;
        })
        .join('');

    const commandsHtml = topCommands.map(cmd => `
        <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px; color: #1f2937; font-weight: 600;">${cmd.command_name}</td>
            <td style="padding: 12px; text-align: center;">
                <span style="background: #dbeafe; color: #0284c7; padding: 4px 12px; border-radius: 20px; font-weight: 600;">${cmd.usage_count}</span>
            </td>
            <td style="padding: 12px; text-align: center; color: #666;">${cmd.avg_time}ms</td>
            <td style="padding: 12px; text-align: center;">
                <span style="color: #10b981; font-weight: 600;">${cmd.success_count}/${cmd.usage_count}</span>
            </td>
        </tr>
    `).join('');

    const usersHtml = topUsers.slice(0, 5).map(user => `
        <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px; color: #1f2937; font-weight: 600; font-size: 12px;">${user.user_id.substring(0, 20)}...</td>
            <td style="padding: 12px; text-align: center;">
                <span style="background: #e0e7ff; color: #6366f1; padding: 4px 12px; border-radius: 20px; font-weight: 600;">${user.total_commands}</span>
            </td>
            <td style="padding: 12px; text-align: center; color: #666;">${user.total_messages}</td>
        </tr>
    `).join('');

    const chatsHtml = topChats.slice(0, 5).map(chat => `
        <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px; color: #1f2937; font-weight: 600;">${chat.chat_name || 'Unknown'}</td>
            <td style="padding: 12px; text-align: center;">
                <span style="background: #fef3c7; color: #d97706; padding: 4px 12px; border-radius: 20px; font-weight: 600;">${chat.total_commands}</span>
            </td>
            <td style="padding: 12px; text-align: center; color: #666;">${chat.members_count || 0}</td>
        </tr>
    `).join('');

    const statusColor = getStatusColor(status);
    const statusBg = getStatusBg(status);

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Asta Bot Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    .header {
      background: white;
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { font-size: 32px; font-weight: 700; color: #1f2937; margin-bottom: 8px; }
    .header-right { text-align: right; }
    .status-badge {
      background: ${statusBg};
      color: ${statusColor};
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 14px;
      display: inline-block;
      margin-top: 10px;
    }
    .status-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      background: ${statusColor};
      border-radius: 50%;
      margin-right: 6px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover { transform: translateY(-5px); box-shadow: 0 15px 40px rgba(0,0,0,0.15); }
    .card-icon { font-size: 28px; margin-bottom: 12px; }
    .card-label { color: #666; font-size: 13px; font-weight: 600; text-transform: uppercase; margin-bottom: 8px; }
    .card-value { font-size: 32px; font-weight: 700; color: #1f2937; margin-bottom: 12px; }
    .card-subtext { color: #999; font-size: 12px; }
    .progress-bar {
      background: #e5e7eb;
      height: 6px;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 12px;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #34d399);
      border-radius: 3px;
      transition: width 0.3s;
    }
    .table-container {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    }
    .table-container h2 { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #1f2937; }
    .table { width: 100%; border-collapse: collapse; }
    .table th {
      background: #f9fafb;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #666;
      font-size: 12px;
      border-bottom: 2px solid #e5e7eb;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      color: white;
      font-size: 12px;
    }
    .refresh-info { color: #999; font-size: 12px; margin-top: 20px; text-align: center; }
    .stats-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .stat-small { background: #f9fafb; padding: 12px; border-radius: 8px; text-align: center; }
    .stat-small-value { font-size: 20px; font-weight: 700; color: #1f2937; }
    .stat-small-label { font-size: 11px; color: #666; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>🤖 Asta Bot Dashboard</h1>
        <p style="color: #666; margin-top: 4px;">Advanced analytics & real-time monitoring</p>
      </div>
      <div class="header-right">
        <div class="status-badge">
          <span class="status-dot"></span>
          ${status.charAt(0).toUpperCase() + status.slice(1)}
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-icon">⏱️</div>
        <div class="card-label">Uptime</div>
        <div class="card-value">${formatUptime(uptime)}</div>
        <div class="card-subtext">${uptime} seconds</div>
      </div>

      <div class="card">
        <div class="card-icon">💾</div>
        <div class="card-label">Memory Usage</div>
        <div class="card-value">${memory}MB</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${memoryPercent}%"></div>
        </div>
        <div class="card-subtext">${Math.round(memoryPercent)}% of allocated</div>
      </div>

      <div class="card">
        <div class="card-icon">⚡</div>
        <div class="card-label">Total Commands</div>
        <div class="card-value">${totalCommands}</div>
        <div class="card-subtext">All time execution</div>
      </div>

      <div class="card">
        <div class="card-icon">🔔</div>
        <div class="card-label">Pending Reminders</div>
        <div class="card-value">${pendingReminders}</div>
        <div class="card-subtext">Scheduled tasks</div>
      </div>

      <div class="card">
        <div class="card-icon">👥</div>
        <div class="card-label">Total Users</div>
        <div class="card-value">${allStats?.totalUsers || 0}</div>
        <div class="card-subtext">Unique users</div>
      </div>

      <div class="card">
        <div class="card-icon">💬</div>
        <div class="card-label">Total Chats</div>
        <div class="card-value">${allStats?.totalChats || 0}</div>
        <div class="card-subtext">Active chats</div>
      </div>

      <div class="card">
        <div class="card-icon">📊</div>
        <div class="card-label">Commands (24h)</div>
        <div class="card-value">${allStats?.commands24h || 0}</div>
        <div class="card-subtext">Last 24 hours</div>
      </div>

      <div class="card">
        <div class="card-icon">⌛</div>
        <div class="card-label">Avg Response</div>
        <div class="card-value">${allStats?.avgMetrics?.avg_response_time || 0}ms</div>
        <div class="card-subtext">Average time</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="table-container">
        <h2>🔥 Top Commands (7 days)</h2>
        <table class="table">
          <thead>
            <tr>
              <th>Command</th>
              <th>Usage</th>
              <th>Avg Time</th>
              <th>Success Rate</th>
            </tr>
          </thead>
          <tbody>
            ${commandsHtml || '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #999;">No data yet</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="table-container">
        <h2>👤 Top Users</h2>
        <table class="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Commands</th>
              <th>Messages</th>
            </tr>
          </thead>
          <tbody>
            ${usersHtml || '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #999;">No data yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="table-container" style="margin-bottom: 20px;">
      <h2>💬 Top Chats</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Chat</th>
            <th>Commands</th>
            <th>Members</th>
          </tr>
        </thead>
        <tbody>
          ${chatsHtml || '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #999;">No data yet</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="table-container">
      <h2>📋 Recent Activity (Last 15 Events)</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Type</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${logs || '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #999;">No logs yet</td></tr>'}
        </tbody>
      </table>
      <div class="refresh-info">🔄 Page auto-refreshes every 10 seconds | Last updated: ${new Date().toLocaleString()}</div>
    </div>

    <div class="footer">
      <p>Asta Bot Dashboard v3.0 | Advanced Analytics Enabled | Running on Node.js</p>
      <p style="margin-top: 8px;">Database: SQLite | Uptime: ${formatUptime(uptime)}</p>
    </div>
  </div>

  <script>
    // Auto-refresh dashboard every 10 seconds
    setTimeout(() => location.reload(), 10000);
  </script>
</body>
</html>`;
}

function startDashboard(port = process.env.PORT || 3030) {
    if (serverInstance) return;

    const server = http.createServer(async (req, res) => {
        try {
            const snapshot = health.getSnapshot();

            if (req.url === '/api/health') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(snapshot, null, 2));
                return;
            }

            if (req.url === '/api/stats') {
                const stats = getStats();
                let allStats = {};
                if (stats) {
                    try {
                        allStats = await stats.getAllStats();
                    } catch (error) {
                        console.error('Error getting stats:', error);
                    }
                }
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(allStats, null, 2));
                return;
            }

            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            const htmlContent = await html(snapshot);
            res.end(htmlContent);
        } catch (error) {
            console.error('Dashboard error:', error);
            res.writeHead(500, { 'content-type': 'text/plain' });
            res.end('Internal Server Error');
        }
    });

    server.on('error', (error) => {
        if (error?.code === 'EADDRINUSE') {
            console.log(`[Dashboard] Port ${port} is already in use. Dashboard disabled for this run.`);
            serverInstance = null;
            return;
        }

        console.log('[Dashboard] Server error:', error?.message || error);
        serverInstance = null;
    });

    const listenResult = server.listen(port, '0.0.0.0', () => {
        console.log(`✨ Dashboard running at http://0.0.0.0:${port}`);
        console.log(`📊 API endpoint available at http://0.0.0.0:${port}/api/stats`);
    });

    serverInstance = server;
    return listenResult;
}

module.exports = {
    startDashboard
};
