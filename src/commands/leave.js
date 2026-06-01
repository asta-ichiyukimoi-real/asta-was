module.exports = {
    config: {
        name: 'leave',
        aliases: ['exit'],
        version: '1.0.0',
        description: 'Makes the bot leave the current group',
        permissions: 2,
        cooldown: 2,
        category: 'moderation'
    },
    onRun: async (sock, msg, args) => {
        const groupId = msg.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            await sock.sendMessage(groupId, { text: 'This command only works in groups.' }, { quoted: msg });
            return;
        }

        await sock.sendMessage(groupId, { text: 'I have left the group.' }, { quoted: msg });
        await sock.groupLeave(groupId);
    }
};