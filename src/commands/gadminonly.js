const state = require('../utils/stateManager');
const { isSenderGroupAdmin } = require('../utils/commandPermissions');

module.exports = {
    config: {
        name: 'gadminonly',
        aliases: ['groupadminonly'],
        version: '1.0.0',
        description: 'Restrict bot usage in this group to its WhatsApp group admins',
        usage: 'gadminonly <on|off|status>',
        examples: ['gadminonly on', 'gadminonly off'],
        permissions: 2,
        cooldown: 0,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: 'Use .gadminonly in the group where you want to change the setting.'
            }, { quoted: msg });
            return;
        }

        const sender = msg.key.participant || chatId;
        let senderIsGroupAdmin;
        try {
            senderIsGroupAdmin = await isSenderGroupAdmin(sock, chatId, sender);
        } catch (error) {
            console.error(`Could not verify group admin for ${chatId}:`, error);
            await sock.sendMessage(chatId, {
                text: 'I could not verify your group admin status, so the setting was not changed.'
            }, { quoted: msg });
            return;
        }

        if (!senderIsGroupAdmin) {
            await sock.sendMessage(chatId, {
                text: 'Only a WhatsApp group admin can change this group bot-access setting.'
            }, { quoted: msg });
            return;
        }

        const action = String(args[0] || 'status').toLowerCase();
        if (action === 'on' || action === 'off') {
            const enabled = action === 'on';
            state.setGroupAdminOnlyEnabled(chatId, enabled);
            await sock.sendMessage(chatId, {
                text: enabled
                    ? 'Group-admin-only mode is on. Only WhatsApp admins of this group can use the bot here.'
                    : 'Group-admin-only mode is off. Everyone in this group can use the bot, subject to other active restrictions.'
            }, { quoted: msg });
            return;
        }

        if (action === 'status') {
            await sock.sendMessage(chatId, {
                text: `Group-admin-only mode is ${state.isGroupAdminOnlyEnabled(chatId) ? 'on' : 'off'} in this group.`
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(chatId, {
            text: 'Use: .gadminonly <on|off|status>'
        }, { quoted: msg });
    }
};
