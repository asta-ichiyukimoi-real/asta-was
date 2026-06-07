module.exports = {
    config: {
        name: 'mystats',
        aliases: ['mystat', 'stats', 'profile'],
        version: '1.0.0',
        description: 'Shows your personal statistics',
        usage: 'mystats [@user]',
        examples: ['mystats', 'mystats @someone'],
        permissions: 0,
        category: 'stats'
    },
    onRun: async (sock, msg, args) => {
        try {
            const statsManager = require('../models/stats');
            const chatId = msg.key.remoteJid;
            
            // Get target user (mentioned or sender)
            let targetUserId = msg.key.participant || msg.key.remoteJid;
            
            // Check if someone was mentioned
            const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
            if (args[0]?.startsWith('@') || (contextInfo?.mentionedJid && contextInfo.mentionedJid.length > 0)) {
                targetUserId = contextInfo?.mentionedJid?.[0] || targetUserId;
            }

            const userStats = statsManager.getUserStats(targetUserId);
            const allStats = statsManager.getAllStats();
            
            if (!userStats) {
                await sock.sendMessage(chatId, 
                    { text: '📊 No statistics found for this user yet. Use some commands first!' }, 
                    { quoted: msg }
                );
                return;
            }

            const isSelf = targetUserId === (msg.key.participant || msg.key.remoteJid);
            const userName = isSelf ? 'Your' : targetUserId.split('@')[0] + "'s";
            
            // Calculate rank
            const topUsers = statsManager.getTopUsers(1000);
            const userRank = topUsers.findIndex(u => u.user_id === targetUserId) + 1;

            const firstSeen = new Date(userStats.first_seen);
            const lastSeen = new Date(userStats.last_seen);
            const daysActive = Math.floor((new Date() - firstSeen) / (1000 * 60 * 60 * 24)) + 1;

            const response = `╔═══════════════════════════╗
║       📊 ${userName.toUpperCase()} STATS        ║
╚═══════════════════════════╝

👤 *User:* ${targetUserId.split('@')[0]}
🏆 *Rank:* #${userRank} / ${allStats.totalUsers || 1}

━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ *Commands Used:* ${userStats.total_commands}
💬 *Messages Sent:* ${userStats.total_messages}
⚠️ *Warnings:* ${userStats.warnings || 0}

━━━━━━━━━━━━━━━━━━━━━━━━━━

🌍 *First Seen:* ${firstSeen.toLocaleDateString()}
👁️ *Last Seen:* ${lastSeen.toLocaleString()}
📅 *Days Active:* ${daysActive}

━━━━━━━━━━━━━━━━━━━━━━━━━━

💯 *Activity Level:* ${userStats.total_commands > 100 ? '🔥 Very Active' : userStats.total_commands > 50 ? '⚡ Active' : userStats.total_commands > 20 ? '✨ Moderate' : '🌱 Quiet'}`;

            await sock.sendMessage(chatId, { text: response }, { quoted: msg });
        } catch (error) {
            console.error('MyStats command error:', error);
            await sock.sendMessage(msg.key.remoteJid, 
                { text: '❌ Error fetching your statistics. Please try again.' }, 
                { quoted: msg }
            );
        }
    }
};
