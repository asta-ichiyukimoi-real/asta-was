const state = require('../utils/stateManager');

module.exports = {
    config: {
        name: 'setfarewell',
        aliases: ['farewellconfig'],
        version: '1.0.0',
        description: 'Sets or toggles the farewell message for this group',
        usage: 'setfarewell <on|off|reset|message>',
        examples: ['setfarewell Bye {{name}}', 'setfarewell off'],
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
                text: `Farewell is ${settings.farewellEnabled === false ? 'off' : 'on'}.\nMessage: ${settings.farewellMessage || 'global default'}`
            }, { quoted: msg });
            return;
        }

        if (value === 'on' || value === 'off') {
            state.setChatSettings(groupId, { farewellEnabled: value === 'on' });
            await sock.sendMessage(groupId, { text: `Farewell messages turned ${value}.` }, { quoted: msg });
            return;
        }

        if (value === 'reset') {
            state.setChatSettings(groupId, { farewellMessage: null, farewellEnabled: null });
            await sock.sendMessage(groupId, { text: 'Farewell message reset to global default.' }, { quoted: msg });
            return;
        }

        state.setChatSettings(groupId, { farewellMessage: value, farewellEnabled: true });
        await sock.sendMessage(groupId, { text: 'Farewell message updated.' }, { quoted: msg });
    }
};
