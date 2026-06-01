module.exports = {
    config: {
        name: 'delete',
        aliases: ['del'],
        version: '1.0.0',
        description: 'Deletes a replied message',
        permissions: 1,
        cooldown: 2,
        category: 'moderation'
    },
    onRun: async (sock, msg, args) => {
        const groupId = msg.key.remoteJid;
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const stanzaId = contextInfo?.stanzaId;
        const participant = contextInfo?.participant;

        if (!stanzaId) {
            await sock.sendMessage(groupId, {
                text: 'Reply to the message you want me to delete.'
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(groupId, {
            delete: {
                remoteJid: groupId,
                fromMe: false,
                id: stanzaId,
                participant
            }
        });
    }
};
