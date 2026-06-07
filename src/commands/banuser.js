const statsManager = require('../models/stats');

module.exports = {
    config: {
        name: 'banuser',
        aliases: ['ban', 'block'],
        version: '1.0.0',
        description: 'Ban a user from the chat',
        usage: 'banuser @user [reason]',
        examples: ['banuser @user spam', 'banuser @john'],
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
            return await sock.sendMessage(chat, { text: '❌ Please mention a user to ban' });
        }

        const targetUser = msg.mentionedJids[0];
        const reason = args.slice(1).join(' ') || 'No reason provided';
        const bannedBy = msg.key.participant;

        try {
            // Ban the user
            await statsManager.banUser(targetUser, chat, reason, bannedBy, false);

            // Try to remove from group if it's a WhatsApp group
            try {
                await sock.groupParticipantsUpdate(chat, [targetUser], 'remove');
            } catch (error) {
                console.error('Could not remove user from group:', error);
            }

            const userName = msg.pushName || targetUser.split('@')[0];
            const text = `🚫 *User Banned*\n\n👤 User: @${userName}\n📝 Reason: ${reason}\n🔨 Banned by: @${bannedBy.split('@')[0]}`;
            
            await sock.sendMessage(chat, { 
                text,
                mentions: [targetUser, bannedBy]
            });

            await statsManager.recordCommand('banuser', chat, msg.key.participant, 0, 'success');
        } catch (error) {
            console.error('Error banning user:', error);
            await sock.sendMessage(chat, { text: '❌ Error banning user' });
            await statsManager.recordCommand('banuser', chat, msg.key.participant, 0, 'error');
        }
    }
};
