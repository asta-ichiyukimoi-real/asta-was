module.exports = {
    config: {
        name: 'unmute',
        aliases: ['open'],
        version: '1.0.0',
        description: 'Unlocks the group so everyone can send messages',
        permissions: 1,
        cooldown: 2,
        category: 'moderation'
    },
    onRun: async (sock, msg, args) => {
        const groupId = msg.key.remoteJid;
        const groupMetadata = await sock.groupMetadata(groupId);
        const botJid = sock.user.id;
            const botParticipant = groupMetadata.participants.find(p => p.id === botJid);
            const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
    if (!isBotAdmin) {
         await sock.sendMessage(groupId, { text: 'I am not an admin'}, { quoted: msg });
      return;
    }
        
        if (!groupId.endsWith('@g.us')) {
            await sock.sendMessage(groupId, { text: 'This command only works in groups.' }, { quoted: msg });
            return;
        }

        await sock.groupSettingUpdate(groupId, 'not_announcement');
        await sock.sendMessage(groupId, { text: 'Group unmuted. Everyone can send messages again.' }, { quoted: msg });
    }
};
