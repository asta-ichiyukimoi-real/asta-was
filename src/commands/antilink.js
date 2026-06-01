const state = require('../utils/stateManager');

module.exports = {
    config: {
        name: 'antilink',
        aliases: ['links'],
        version: '1.0.0',
        description: 'Turns group anti-link moderation on or off',
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

        const option = args[0]?.toLowerCase();
        if (!['on', 'off'].includes(option)) {
            const current = state.getGroupModeration(groupId);
            await sock.sendMessage(groupId, {
                text: `Anti-link is currently ${current.antiLink ? 'on' : 'off'}.\nUse: !antilink on/off`
            }, { quoted: msg });
            return;
        }

        state.setGroupModeration(groupId, { antiLink: option === 'on' });
        await sock.sendMessage(groupId, { text: `Anti-link is now ${option}.` }, { quoted: msg });
    }
};
