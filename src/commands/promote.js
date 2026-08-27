const { getTargetJids, formatMentions } = require('../utils/targets');

module.exports = {
    config: {
        name: 'promote',
        aliases: ['admin'],
        version: '1.0.0',
        description: 'Promotes mentioned or replied users to group admin',
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

        const groupMetadata = await sock.groupMetadata(groupId);
        const botJid = sock.user.id;
            const botParticipant = groupMetadata.participants.find(p => p.id === botJid);
            const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
    if (!isBotAdmin) {
         await sock.sendMessage(groupId, { text: 'I am not an admin'}, { quoted: msg });
      return;
    }
        

        const targets = getTargetJids(msg);
        if (!targets.length) {
            await sock.sendMessage(groupId, {
                text: 'Mention someone or reply to their message.\nExample: !promote @user'
            }, { quoted: msg });
            return;
        }

        await sock.groupParticipantsUpdate(groupId, targets, 'promote');
        await sock.sendMessage(groupId, {
            text: `Promoted ${formatMentions(targets)}.`,
            mentions: targets
        }, { quoted: msg });
    }
};
