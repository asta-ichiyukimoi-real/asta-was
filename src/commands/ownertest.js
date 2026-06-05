const config = require('../../config');

module.exports = {
    config: {
        name: 'ownertest',
        aliases: ['otest', 'ownerdebug'],
        version: '1.0.0',
        description: 'Debug owner-only permission matching',
        usage: 'ownertest',
        examples: ['ownertest'],
        permissions: 2,
        category: 'admin'
    },
    onRun: async (sock, msg) => {
        const sender = msg.key.participant || msg.key.remoteJid;

        await sock.sendMessage(msg.key.remoteJid, {
            text: [
                '*Owner permission passed*',
                '',
                `Expected owner: ${config.owner}`,
                `Got sender: ${sender}`,
                `Chat JID: ${msg.key.remoteJid}`,
                `Participant: ${msg.key.participant || 'none'}`,
                `From me: ${Boolean(msg.key.fromMe)}`
            ].join('\n')
        }, { quoted: msg });
    }
};
