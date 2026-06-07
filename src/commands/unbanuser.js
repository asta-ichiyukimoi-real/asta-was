const statsManager = require('../models/stats');

module.exports = {
    config: {
        name: 'unbanuser',
        aliases: ['unban', 'unblock'],
        version: '1.0.0',
        description: 'Unban a user from the chat',
        usage: 'unbanuser @user',
        examples: ['unbanuser @user'],
        permissions: 2,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const chat = msg.key.remoteJid;
        const isGroup = chat.endsWith('@g.us');
        
        if (!isGroup) {
            return await sock.sendMessage(chat, { text: '❌ This command only works in groups' });
        }

        if (!msg.mentionedJids || msg.mentionedJids.length === 0) {
            return await sock.sendMessage(chat, { text: '❌ Please mention a user to unban' });
        }

        const targetUser = msg.mentionedJids[0];

        try {
            const wasUnbanned = await statsManager.unbanUser(targetUser, chat);

            if (wasUnbanned) {
                const userName = msg.pushName || targetUser.split('@')[0];
                const text = `✅ *User Unbanned*\n\n👤 User: @${userName}\n🔓 Unbanned by: @${msg.key.participant.split('@')[0]}`;
                
                await sock.sendMessage(chat, { 
                    text,
                    mentions: [targetUser, msg.key.participant]
                });

                await statsManager.recordCommand('unbanuser', chat, msg.key.participant, 0, 'success');
            } else {
                await sock.sendMessage(chat, { text: '⚠️ User was not banned' });
            }
        } catch (error) {
            console.error('Error unbanning user:', error);
            await sock.sendMessage(chat, { text: '❌ Error unbanning user' });
            await statsManager.recordCommand('unbanuser', chat, msg.key.participant, 0, 'error');
        }
    }
};
