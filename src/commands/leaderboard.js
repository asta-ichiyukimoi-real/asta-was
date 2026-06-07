module.exports = {
    config: {
        name: 'leaderboard',
        aliases: ['lb', 'top', 'ranking'],
        version: '1.0.0',
        description: 'Shows the top users and commands ranking',
        usage: 'leaderboard [users|commands]',
        examples: ['leaderboard', 'leaderboard users', 'leaderboard commands'],
        permissions: 0,
        category: 'stats'
    },
    onRun: async (sock, msg, args) => {
        try {
            const statsManager = require('../models/stats');
            const type = args[0]?.toLowerCase() || 'users';
            const chatId = msg.key.remoteJid;

            let response = '';

            if (type === 'users' || type === 'u') {
                const topUsers = statsManager.getTopUsers(10);

                response = `╔═══════════════════════════╗
║      👥 TOP USERS          ║
╚═══════════════════════════╝

`;
                if (topUsers.length === 0) {
                    response += 'No user data yet. Start using commands!';
                } else {
                    topUsers.forEach((user, index) => {
                        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                        const shortId = user.user_id.substring(0, 15);
                        response += `${medal} ${shortId}\n`;
                        response += `   ⚡ Commands: ${user.total_commands} | 💬 Messages: ${user.total_messages}\n\n`;
                    });
                }
            } else if (type === 'commands' || type === 'c' || type === 'cmd') {
                const topCommands = statsManager.getTopCommands(7, 10);

                response = `╔═══════════════════════════╗
║    🔥 TOP COMMANDS (7d)     ║
╚═══════════════════════════╝

`;
                if (topCommands.length === 0) {
                    response += 'No command data yet. Try using some commands!';
                } else {
                    topCommands.forEach((cmd, index) => {
                        const medal = index === 0 ? '🔴' : index === 1 ? '🟠' : index === 2 ? '🟡' : '⚪';
                        const successRate = cmd.success_count && cmd.usage_count 
                            ? Math.round((cmd.success_count / cmd.usage_count) * 100) 
                            : 0;
                        response += `${medal} ${cmd.command_name}\n`;
                        response += `   📊 Used ${cmd.usage_count}x | ⏱️ Avg ${cmd.avg_time}ms | ✅ ${successRate}% success\n\n`;
                    });
                }
            } else {
                response = `╔═══════════════════════════╗
║       📊 LEADERBOARDS       ║
╚═══════════════════════════╝

Available leaderboards:

🏆 *leaderboard users* - Top 10 most active users
🔥 *leaderboard commands* - Top 10 most used commands

Usage: ${require('../../config').prefix}leaderboard <type>`;
            }

            response += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━';

            await sock.sendMessage(chatId, { text: response }, { quoted: msg });
        } catch (error) {
            console.error('Leaderboard command error:', error);
            await sock.sendMessage(msg.key.remoteJid, 
                { text: '❌ Error fetching leaderboard. Please try again.' }, 
                { quoted: msg }
            );
        }
    }
};
