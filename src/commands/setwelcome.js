const state = require('../utils/stateManager');

module.exports = {
    config: {
        name: 'setwelcome',
        aliases: ['welcomeconfig'],
        version: '1.0.0',
        description: 'Sets or toggles the welcome message for this group',
        usage: 'setwelcome <on|off|reset|message>',
        examples: ['setwelcome Welcome {{name}} to {{group}}', 'setwelcome off'],
        permissions: 1,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const groupId = msg.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            await sock.sendMessage(groupId, { text: 'This command only works in groups.' }, { quoted: msg });
            return;
        }

        const value = args.join(' ').trim();
        if (!value) {
            const settings = state.getChatSettings(groupId);
            await sock.sendMessage(groupId, {
                text: `Welcome is ${settings.welcomeEnabled === false ? 'off' : 'on'}.\nMessage: ${settings.welcomeMessage || 'global default'}`
            }, { quoted: msg });
            return;
        }

        if (value === 'on' || value === 'off') {
            state.setChatSettings(groupId, { welcomeEnabled: value === 'on' });
            await sock.sendMessage(groupId, { text: `Welcome messages turned ${value}.` }, { quoted: msg });
            return;
        }

        if (value === 'reset') {
            state.setChatSettings(groupId, { welcomeMessage: null, welcomeEnabled: null });
            await sock.sendMessage(groupId, { text: 'Welcome message reset to global default.' }, { quoted: msg });
            return;
        }

        state.setChatSettings(groupId, { welcomeMessage: value, welcomeEnabled: true });
        await sock.sendMessage(groupId, { text: 'Welcome message updated.' }, { quoted: msg });
    }
};
