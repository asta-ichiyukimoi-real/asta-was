const statsManager = require('../models/stats');

module.exports = {
    config: {
        name: 'unmuteuser',
        aliases: [ 'unsilence'],
        version: '1.0.0',
        description: 'Unmute a user in the chat',
        usage: 'unmuteuser @user',
        examples: ['unmuteuser @user'],
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
            return await sock.sendMessage(chat, { text: 'Please mention the user you would like to unmute.' });
        }

        const targetUser = msg.mentionedJids[0];

        try {
            const wasMuted = await statsManager.unmuteUser(targetUser, chat);

            if (wasMuted) {
                const userName = msg.pushName || targetUser.split('@')[0];
                const text = `🔊 *User Unmuted*\n\n👤 User: @${userName}\n🔓 Unmuted by: @${msg.key.participant.split('@')[0]}`;
                
                await sock.sendMessage(chat, { 
                    text,
                    mentions: [targetUser, msg.key.participant]
                });

                await statsManager.recordCommand('unmuteuser', chat, msg.key.participant, 0, 'success');
            } else {
                await sock.sendMessage(chat, { text: 'That user is not currently muted in this group.' });
            }
        } catch (error) {
            console.error('Error unmuting user:', error);
            await sock.sendMessage(chat, { text: 'I could not unmute that user just now. Please try again.' });
            await statsManager.recordCommand('unmuteuser', chat, msg.key.participant, 0, 'error');
        }
    }
};
