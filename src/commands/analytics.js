const state = require('../utils/stateManager');
const commandQueue = require('../utils/commandQueue');
const statsManager = require('../models/stats');
const { sendStyledMessage } = require('../utils/messageStyle');

function topEntries(object, limit = 8) {
    return Object.entries(object || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);
}

module.exports = {
    config: {
        name: 'analytics',
        aliases: ['metrics', 'botstats'],
        version: '1.0.0',
        description: 'Shows bot usage, errors, and runtime metrics',
        usage: 'analytics [export json|csv] [days]',
        examples: ['analytics', 'analytics export json', 'analytics export csv 30'],
        permissions: 2,
        category: 'developer'
    },
    onRun: async (sock, msg, args) => {
        const chat = msg.key.remoteJid;
        const action = (args[1] || 'view').toLowerCase();

        try {
            if (action === 'export') {
                const format = (args[2] || 'json').toLowerCase();
                const days = parseInt(args[3] || '30');

                if (format === 'json') {
                    const data = await statsManager.exportStatsJSON('all', days);
                    const json = JSON.stringify(data, null, 2);
                    
                    const text = `📦 *Analytics Export (JSON)*

✅ *Export Generated*
Size: ${json.length} bytes
Date Range: Last ${days} days
Generated: ${new Date().toLocaleString()}

*Data Included:*
${Object.keys(data).map((key, i) => `${i + 1}. ${key}`).join('\n')}

${json.length > 5000 ? '*Note: Full data is too large to display. Save this message.*' : '```json\n' + json.substring(0, 2000) + (json.length > 2000 ? '\n...\n```' : '```')}`;

                    return await sock.sendMessage(chat, { text });
                } 
                else if (format === 'csv') {
                    const csv = await statsManager.exportStatsCSV('commands', days);
                    const lines = csv.split('\n');
                    
                    const text = `📊 *Analytics Export (CSV)*

✅ *Export Generated*
Rows: ${Math.max(0, lines.length - 1)}
Date Range: Last ${days} days
Generated: ${new Date().toLocaleString()}

*Preview:*
\`\`\`
${lines.slice(0, 6).join('\n')}
${lines.length > 6 ? `... (${lines.length - 6} more rows)` : ''}
\`\`\``;

                    return await sock.sendMessage(chat, { text });
                } 
                else {
                    return await sock.sendMessage(chat, { text: '❌ Invalid format. Use `json` or `csv`' });
                }
            }

            // Default view - show database analytics
            const allStats = await statsManager.getAllStats();
            const errorStats = await statsManager.getErrorStats(7);
            const dailyStats = await statsManager.getDailyStats(7);

            const text = [
                '📊 *Bot Analytics*',
                '',
                '📈 *Overall Statistics*',
                `Total Commands: ${allStats.totalCommands}`,
                `Registered Users: ${allStats.totalUsers}`,
                `Active Chats: ${allStats.totalChats}`,
                `Commands (24h): ${allStats.commands24h}`,
                '',
                '⏱️ *Performance (24h)*',
                `Avg Response Time: ${allStats.avgMetrics?.avg_response_time || 0}ms`,
                `Memory Usage: ${allStats.avgMetrics?.avg_memory || 0} MB`,
                `CPU Usage: ${allStats.avgMetrics?.avg_cpu || 0}%`,
                '',
                '🏆 *Top Commands (7 days)*',
                allStats.topCommands?.slice(0, 5).map((cmd, i) => 
                    `${i + 1}. ${cmd.command_name}: ${cmd.usage_count} uses`
                ).join('\n') || 'No data',
                '',
                '👥 *Top Users*',
                allStats.topUsers?.slice(0, 5).map((user, i) => 
                    `${i + 1}. ${user.user_id.split('@')[0]}: ${user.total_commands} commands`
                ).join('\n') || 'No data',
                '',
                '❌ *Recent Errors (7 days)*',
                errorStats.length > 0
                    ? errorStats.slice(0, 5).map((err, i) => `${i + 1}. ${err.command_name}: ${err.error_count} errors`).join('\n')
                    : 'No errors!',
                '',
                '📅 *Daily Trend*',
                dailyStats.slice(0, 3).map((day, i) => 
                    `${i + 1}. ${day.stat_date}: ${day.total_commands} commands, ${day.unique_users} users`
                ).join('\n') || 'No data',
                '',
                '*Commands:*',
                '`.analytics export json [days]`',
                '`.analytics export csv [days]`'
            ].join('\n');

            await sendStyledMessage(sock, chat, text, {
                quoted: msg,
                commandName: 'analytics'
            });
            await statsManager.recordCommand('analytics', chat, msg.key.participant, 0, 'success');
        } catch (error) {
            console.error('Error in analytics command:', error);
            
            // Fallback to old analytics
            const snapshot = state.getState();
            const usage = snapshot.usage || {};
            const recentLogs = snapshot.logs?.recent || [];
            const errorLogs = recentLogs.filter(entry => /error|fail/i.test(entry.type || ''));
            const apiErrors = recentLogs.filter(entry => entry.type === 'api_error');
            const topCommands = topEntries(usage.commands, 8);
            const commandCount = global.commandHandler?.commands?.size || 0;
            const replyCount = global.replyCommandHandler?.replyCommands?.size || 0;
            const chatCount = global.chatCommandHandler?.chatCommands?.size || 0;

            const text = [
                '*Bot Analytics*',
                `Total commands: ${usage.totalCommands || 0}`,
                `Command entries: ${commandCount}`,
                `Reply entries: ${replyCount}`,
                `Chat triggers: ${chatCount}`,
                `Queue size: ${commandQueue.size()}`,
                `Recent errors: ${errorLogs.length}`,
                `Recent API errors: ${apiErrors.length}`,
                `Custom command chats: ${Object.keys(snapshot.customCommands?.chats || {}).length}`,
                `Role chats: ${Object.keys(snapshot.roles?.chats || {}).length}`,
                '',
                '*Top Commands*',
                topCommands.length
                    ? topCommands.map(([name, count], index) => `${index + 1}. ${name}: ${count}`).join('\n')
                    : 'none',
                '',
                '*Last Error*',
                errorLogs[0] ? `${errorLogs[0].type}: ${errorLogs[0].error || errorLogs[0].message || 'see logs'}` : 'none'
            ].join('\n');

            await sendStyledMessage(sock, chat, text.slice(0, 3500), {
                quoted: msg,
                commandName: 'analytics'
            });
            await statsManager.recordCommand('analytics', chat, msg.key.participant, 0, 'error');
        }
    }
};
