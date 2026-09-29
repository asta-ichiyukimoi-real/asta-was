const state = require('../utils/stateManager');

module.exports = {
    config: {
        name: 'antilink',
        aliases: ['links'],
        version: '1.0.0',
        description: 'Deletes links in this group and removes users after 3 warnings',
        usage: 'antilink <on|off>',
        examples: ['antilink on', 'antilink off'],
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

        const option = args[0]?.toLowerCase();
        if (!['on', 'off'].includes(option)) {
            const current = state.getGroupModeration(groupId);
            await sock.sendMessage(groupId, {
                text: `Anti-link is currently ${current.antiLink ? 'on' : 'off'}.\nUse: .antilink on/off`
            }, { quoted: msg });
            return;
        }

        state.setGroupModeration(groupId, { antiLink: option === 'on' });
        await sock.sendMessage(groupId, {
            text: option === 'on'
                ? 'Anti-link is on. Links from regular members will be deleted, and the sender will be warned. The third warning removes them from the group.'
                : 'Anti-link is off.'
        }, { quoted: msg });
    }
};
