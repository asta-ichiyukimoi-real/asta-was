const statsManager = require('../models/stats');

module.exports = {
    config: {
        name: 'muteuser',
        aliases: ['mute', 'silence'],
        version: '1.0.0',
        description: 'Mute a user in the chat (prevent them from using commands)',
        usage: 'muteuser @user [minutes] [reason]',
        examples: ['muteuser @user 60 spam', 'muteuser @user spam'],
        permissions: 2,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const chat = msg.key.remoteJid;
        const isGroup = chat.endsWith('@g.us');
        const groupMetadata = await sock.groupMetadata(groupId);
        const botJid = sock.user.id;
            const botParticipant = groupMetadata.participants.find(p => p.id === botJid);
            const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
    if (!isBotAdmin) {
         await sock.sendMessage(groupId, { text: 'I am not an admin'}, { quoted: msg });
      return;
    }
        
        
        if (!isGroup) {
            return await sock.sendMessage(chat, { text: '❌ This command only works in groups' });
        }

        if (!msg.mentionedJids || msg.mentionedJids.length === 0) {
            return await sock.sendMessage(chat, { text: '❌ Please mention a user to mute' });
        }

        const targetUser = msg.mentionedJids[0];
        let durationMinutes = null;
        let reason = 'No reason provided';

        // Check if first arg is a number (duration)
        if (args.length > 1 && !isNaN(args[1])) {
            durationMinutes = parseInt(args[1]);
            reason = args.slice(2).join(' ') || reason;
        } else {
            reason = args.slice(1).join(' ') || reason;
        }

        const mutedBy = msg.key.participant;

        try {
            await statsManager.muteUser(targetUser, chat, durationMinutes, reason, mutedBy);

            const userName = msg.pushName || targetUser.split('@')[0];
            const durationText = durationMinutes ? ` for ${durationMinutes} minutes` : ' permanently';
            const text = `🔇 *User Muted*\n\n👤 User: @${userName}\n⏱️ Duration: ${durationText}\n📝 Reason: ${reason}\n🔨 Muted by: @${mutedBy.split('@')[0]}`;
            
            await sock.sendMessage(chat, { 
                text,
                mentions: [targetUser, mutedBy]
            });

            await statsManager.recordCommand('muteuser', chat, mutedBy, 0, 'success');
        } catch (error) {
            console.error('Error muting user:', error);
            await sock.sendMessage(chat, { text: '❌ Error muting user' });
            await statsManager.recordCommand('muteuser', chat, msg.key.participant, 0, 'error');
        }
    }
};
