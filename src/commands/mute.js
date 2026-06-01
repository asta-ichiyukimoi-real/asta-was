module.exports = {
    config: {
        name: 'mute',
        aliases: ['close'],
        version: '1.0.0',
        description: 'Locks the group so only admins can send messages',
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

        await sock.groupSettingUpdate(groupId, 'announcement');
        await sock.sendMessage(groupId, { text: 'Group muted. Only admins can send messages now.' }, { quoted: msg });
    }
};