const state = require('../utils/stateManager');
const config = require('../../config');

module.exports = {
    config: {
        name: 'settings',
        aliases: ['setting'],
        version: '1.1.0',
        description: 'Manage bot settings (owner only)',
        permissions: 2,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const subcommand = args[0]?.toLowerCase();
        const botState = state.getState();

        if (!subcommand) {
            const groupModeration = msg.key.remoteJid.endsWith('@g.us')
                ? state.getGroupModeration(msg.key.remoteJid)
                : null;

            const settingsText = `*Bot Settings*

Welcome: ${botState.welcome.enabled ? 'Enabled' : 'Disabled'}
Farewell: ${botState.farewell.enabled ? 'Enabled' : 'Disabled'}
Auto Reply: ${botState.autoReply.enabled ? 'Enabled' : 'Disabled'}
${groupModeration ? `Anti-Link: ${groupModeration.antiLink ? 'Enabled' : 'Disabled'}
Filtered Words: ${groupModeration.badWords.length}` : ''}

*Commands*
${config.prefix}settings welcome on/off
${config.prefix}settings farewell on/off
${config.prefix}settings autoreply on/off
${config.prefix}antilink on/off
${config.prefix}badword list`;

            await sock.sendMessage(msg.key.remoteJid, { text: settingsText }, { quoted: msg });
            return;
        }

        const value = args[1]?.toLowerCase();
        if (!['on', 'off'].includes(value)) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Use on or off.\nExample: !settings welcome on'
            }, { quoted: msg });
            return;
        }

        const enabled = value === 'on';

        if (subcommand === 'welcome') {
            state.setWelcomeEnabled(enabled);
            await sock.sendMessage(msg.key.remoteJid, { text: `Welcome messages ${value}.` }, { quoted: msg });
        } else if (subcommand === 'farewell') {
            state.setFarewellEnabled(enabled);
            await sock.sendMessage(msg.key.remoteJid, { text: `Farewell messages ${value}.` }, { quoted: msg });
        } else if (subcommand === 'autoreply') {
            state.setAutoReplyEnabled(enabled);
            await sock.sendMessage(msg.key.remoteJid, { text: `Auto-reply ${value}.` }, { quoted: msg });
        } else {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Unknown setting. Use !settings to see available options.'
            }, { quoted: msg });
        }
    }
};
