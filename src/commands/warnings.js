const state = require('../utils/stateManager');
const { getTargetJids } = require('../utils/targets');

module.exports = {
    config: {
        name: 'warnings',
        aliases: ['warns'],
        version: '1.0.0',
        description: 'Shows warning counts for this group',
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

        if (args[0]?.toLowerCase() === 'clear') {
            const targets = getTargetJids(msg);
            targets.length ? targets.forEach(target => state.clearWarnings(groupId, target)) : state.clearWarnings(groupId);
            await sock.sendMessage(groupId, { text: 'Warnings cleared.' }, { quoted: msg });
            return;
        }

        const warnings = state.getGroupModeration(groupId).warnings || {};
        const entries = Object.entries(warnings).filter(([, count]) => count > 0);
        if (!entries.length) {
            await sock.sendMessage(groupId, { text: 'No warnings in this group.' }, { quoted: msg });
            return;
        }

        const mentions = entries.map(([jid]) => jid);
        const lines = entries.map(([jid, count]) => `@${jid.split('@')[0]}: ${count}/3`);
        await sock.sendMessage(groupId, {
            text: `*Warnings*\n\n${lines.join('\n')}`,
            mentions
        }, { quoted: msg });
    }
};
