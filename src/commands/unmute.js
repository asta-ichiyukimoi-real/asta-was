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
        if (!groupId.endsWith('@g.us')) {
            await sock.sendMessage(groupId, { text: 'This command only works in groups.' }, { quoted: msg });
            return;
        }

        await sock.groupSettingUpdate(groupId, 'not_announcement');
        await sock.sendMessage(groupId, { text: 'Group unmuted. Everyone can send messages again.' }, { quoted: msg });
    }
};
