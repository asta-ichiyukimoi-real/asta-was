const state = require('../utils/stateManager');
const { getTargetJids, formatMentions } = require('../utils/targets');

module.exports = {
    config: {
        name: 'warn',
        aliases: ['warning'],
        version: '1.0.0',
        description: 'Warns a user; 3 warnings removes them',
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

        const targets = getTargetJids(msg);
        if (!targets.length) {
            await sock.sendMessage(groupId, {
                text: 'Mention someone or reply to their message.\nExample: !warn @user stop spamming'
            }, { quoted: msg });
            return;
        }

        for (const target of targets) {
            const count = state.addWarning(groupId, target);
            if (count >= 3) {
                await sock.groupParticipantsUpdate(groupId, [target], 'remove');
                state.clearWarnings(groupId, target);
            }
        }

        await sock.sendMessage(groupId, {
            text: `Warned ${formatMentions(targets)}. Users are removed after 3 warnings.`,
            mentions: targets
        }, { quoted: msg });
    }
};
