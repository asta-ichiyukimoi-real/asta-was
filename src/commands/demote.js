const { getTargetJids, formatMentions } = require('../utils/targets');

module.exports = {
    config: {
        name: 'demote',
        aliases: ['unadmin'],
        version: '1.0.0',
        description: 'Demotes mentioned or replied group admins',
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
                text: 'Mention someone or reply to their message.\nExample: !demote @user'
            }, { quoted: msg });
            return;
        }

        await sock.groupParticipantsUpdate(groupId, targets, 'demote');
        await sock.sendMessage(groupId, {
            text: `Demoted ${formatMentions(targets)}.`,
            mentions: targets
        }, { quoted: msg });
    }
};
