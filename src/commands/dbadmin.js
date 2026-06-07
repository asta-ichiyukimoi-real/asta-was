const statsManager = require('../models/stats');

module.exports = {
    config: {
        name: 'dbadmin',
        aliases: ['db', 'database'],
        version: '1.0.0',
        description: 'Database admin panel - view stats, clear data, export',
        usage: 'dbadmin [stats|export|clear] [format] [days]',
        examples: ['dbadmin stats', 'dbadmin export json 30', 'dbadmin clear'],
        permissions: 3,
        category: 'developer'
    },
    onRun: async (sock, msg, args) => {
        const chat = msg.key.remoteJid;
        const subcommand = (args[1] || 'stats').toLowerCase();

        try {
            if (subcommand === 'stats') {
                const allStats = await statsManager.getAllStats();
                
                const text = `📊 *Database Statistics*

✅ *Overview*
Commands: ${allStats.totalCommands}
Users: ${allStats.totalUsers}
Chats: ${allStats.totalChats}
Commands (24h): ${allStats.commands24h}

📈 *Average Metrics (24h)*
Memory: ${allStats.avgMetrics?.avg_memory || 0} MB
CPU: ${allStats.avgMetrics?.avg_cpu || 0}%
Response Time: ${allStats.avgMetrics?.avg_response_time || 0}ms

🏆 *Top Commands*
${allStats.topCommands?.slice(0, 5).map((cmd, i) => `${i + 1}. ${cmd.command_name}: ${cmd.usage_count} uses`).join('\n') || 'None'}

👥 *Top Users*
${allStats.topUsers?.slice(0, 5).map((user, i) => `${i + 1}. User ID: ${user.user_id.split('@')[0]}`).join('\n') || 'None'}`;

                await sock.sendMessage(chat, { text });
            } 
            else if (subcommand === 'export') {
                const format = (args[2] || 'json').toLowerCase();
                const days = parseInt(args[3] || '30');

                if (format === 'json') {
                    const data = await statsManager.exportStatsJSON('all', days);
                    const json = JSON.stringify(data, null, 2);
                    
                    // Send as text since we can't send files directly in many bots
                    const preview = `📦 *Database Export (JSON)*

*Size:* ${json.length} bytes
*Date Range:* Last ${days} days
*Timestamp:* ${new Date().toLocaleString()}

*Data Included:*
${Object.keys(data).map(key => `✓ ${key}`).join('\n')}

Export is ${json.length > 10000 ? 'too large to display' : 'ready'}.`;

                    await sock.sendMessage(chat, { text: preview });
                } 
                else if (format === 'csv') {
                    const csv = await statsManager.exportStatsCSV('commands', days);
                    const preview = `📊 *Database Export (CSV)*

*Rows:* ${csv.split('\n').length - 1}
*Date Range:* Last ${days} days
*Format:* Comma-separated values

${csv.split('\n').slice(0, 5).join('\n')}
...`;

                    await sock.sendMessage(chat, { text: preview });
                } 
                else {
                    await sock.sendMessage(chat, { text: '❌ Unsupported format. Use `json` or `csv`' });
                    return;
                }
            } 
            else if (subcommand === 'clear') {
                const confirm = args[2];
                if (confirm !== 'confirm') {
                    return await sock.sendMessage(chat, { 
                        text: '⚠️ This will delete data older than 90 days. Use:\n`.dbadmin clear confirm` to proceed'
                    });
                }

                await statsManager.clearOldData(90);
                await sock.sendMessage(chat, { text: '✅ Old data (>90 days) has been cleared' });
            }
            else if (subcommand === 'query') {
                const queryType = (args[2] || '').toLowerCase();
                
                if (queryType === 'errors') {
                    const errors = await statsManager.getErrorStats(30);
                    const text = `❌ *Error Statistics (30 days)*

${errors.length === 0 ? 'No errors recorded!' : errors.slice(0, 10).map((err, i) => 
    `${i + 1}. ${err.command_name}: ${err.error_count} errors`
).join('\n')}`;

                    await sock.sendMessage(chat, { text });
                }
                else if (queryType === 'banned') {
                    const banned = await statsManager.getBannedUsers(chat, false);
                    const text = `🚫 *Banned Users in this Chat*

${banned.length === 0 ? 'No banned users' : banned.slice(0, 10).map((ban, i) => 
    `${i + 1}. ${ban.user_id.split('@')[0]}: ${ban.reason}`
).join('\n')}`;

                    await sock.sendMessage(chat, { text });
                }
                else if (queryType === 'muted') {
                    const muted = await statsManager.getMutedUsers(chat);
                    const text = `🔇 *Muted Users in this Chat*

${muted.length === 0 ? 'No muted users' : muted.slice(0, 10).map((m, i) => 
    `${i + 1}. ${m.user_id.split('@')[0]}: ${m.reason}`
).join('\n')}`;

                    await sock.sendMessage(chat, { text });
                }
                else {
                    await sock.sendMessage(chat, { text: '❌ Unknown query type. Use: errors, banned, muted' });
                }
            }
            else {
                const helpText = `📊 *Database Admin Panel*

*Subcommands:*
\`dbadmin stats\` - View database statistics
\`dbadmin export [json|csv] [days]\` - Export data
\`dbadmin clear confirm\` - Clear old data (>90 days)
\`dbadmin query [errors|banned|muted]\` - Query specific data

*Examples:*
\`.dbadmin stats\`
\`.dbadmin export json 30\`
\`.dbadmin query errors\``;

                await sock.sendMessage(chat, { text: helpText });
            }

            await statsManager.recordCommand('dbadmin', chat, msg.key.participant, 0, 'success');
        } catch (error) {
            console.error('Error in dbadmin command:', error);
            await sock.sendMessage(chat, { text: '❌ Error executing database command' });
            await statsManager.recordCommand('dbadmin', chat, msg.key.participant, 0, 'error');
        }
    }
};
