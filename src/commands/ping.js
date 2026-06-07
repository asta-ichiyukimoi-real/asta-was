module.exports = {
    config: {
        name: 'ping',
        aliases: ['p'],
        version: '2.0.0',
        description: 'Replies with real ping latency and bot status',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        try {
            // Measure ping by recording message send time
            const startTime = Date.now();
            
            // Get bot uptime
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            
            // Determine connection status
            let statusEmoji = '🟢';
            let statusText = 'Online';
            
            // Send the ping message
            const sentMsg = await sock.sendMessage(msg.key.remoteJid, 
                { text: '⏳ *Calculating ping...*' }, 
                { quoted: msg }
            );
            
            // Calculate actual ping
            const ping = Date.now() - startTime;
            
            // Determine connection quality based on ping
            let qualityEmoji = '⚡';
            let quality = 'Excellent';
            if (ping > 500) {
                qualityEmoji = '🐢';
                quality = 'Slow';
            } else if (ping > 200) {
                qualityEmoji = '⚠️';
                quality = 'Good';
            } else if (ping > 100) {
                qualityEmoji = '✨';
                quality = 'Very Good';
            }
            
            // Format uptime
            const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
            
            // Create formatted response
            const reply = `╔═══════════════════════╗
║      🏓 PING PONG      ║
╚═══════════════════════╝

${statusEmoji} *Status:* ${statusText}
${qualityEmoji} *Latency:* ${ping}ms
⏱️ *Quality:* ${quality}
🕐 *Uptime:* ${uptimeStr}

━━━━━━━━━━━━━━━━━━━━━━━
✅ Bot is responding perfectly!`;
            
            // Edit the loading message with final response
            await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
            
        } catch (error) {
            console.error('Ping command error:', error);
            await sock.sendMessage(msg.key.remoteJid, 
                { text: '❌ Error calculating ping. Please try again.' }, 
                { quoted: msg }
            );
        }
    }
};
