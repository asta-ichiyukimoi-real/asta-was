const config = require('../../config');

function maskValue(value) {
    if (!value) return 'not set';
    if (value.length <= 4) return 'set';
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function getAllowList() {
    return global.configCommandHandler?.get?.('developer.envAllowList', config.developer?.envAllowList)
        || config.developer?.envAllowList
        || [];
}

module.exports = {
    config: {
        name: 'env',
        aliases: ['envs', 'environment'],
        version: '1.0.0',
        description: 'Shows allowed environment variable status',
        usage: 'env [name]',
        examples: ['env', 'env PORT'],
        permissions: 2,
        cooldown: 0,
        category: 'developer'
    },
    onRun: async (sock, msg, args) => {
        const allowList = getAllowList();
        const requested = args[0];

        if (requested && !allowList.includes(requested)) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `That env key is not in developer.envAllowList.\nAllowed: ${allowList.join(', ') || 'none'}`
            }, { quoted: msg });
            return;
        }

        const keys = requested ? [requested] : allowList;
        const lines = keys.map(key => `${key}: ${maskValue(process.env[key])}`);

        await sock.sendMessage(msg.key.remoteJid, {
            text: `*Environment*\n${lines.length ? lines.join('\n') : 'No env keys allowed in config.'}`
        }, { quoted: msg });
    }
};
