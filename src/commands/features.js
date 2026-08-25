const config = require('../../config');
const state = require('../utils/stateManager');
const { sendStyledMessage } = require('../utils/messageStyle');

function knownCategories() {
    const configured = global.configCommandHandler?.get?.('commands.categories', config.commands?.categories);
    return configured || ['general', 'utility', 'ai', 'media', 'group', 'moderation', 'admin', 'developer', 'fun'];
}

module.exports = {
    config: {
        name: 'features',
        aliases: ['feature', 'modules'],
        version: '1.0.0',
        description: 'Enable or disable command categories in this chat',
        usage: 'features [category on/off]',
        examples: ['features', 'features media off', 'features ai on'],
        permissions: 1,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const category = args[0]?.toLowerCase();
        const value = args[1]?.toLowerCase();
        const categories = knownCategories();

        if (!category) {
            const disabled = state.getDisabledCategories(chatId);
            const lines = categories.map(name => `${name}: ${disabled.includes(name) ? 'off' : 'on'}`);
            await sendStyledMessage(sock, chatId, `*Features Here*\n${lines.join('\n')}\n\nUse: .features media off`, {
                quoted: msg,
                commandName: 'features'
            });
            return;
        }

        if (!categories.includes(category)) {
            await sock.sendMessage(chatId, {
                text: `Unknown category. Available: ${categories.join(', ')}`
            }, { quoted: msg });
            return;
        }

        if (!['on', 'off'].includes(value)) {
            await sock.sendMessage(chatId, {
                text: 'Use: .features <category> on/off'
            }, { quoted: msg });
            return;
        }

        const disabled = value === 'off';
        const disabledCategories = state.setCategoryDisabled(chatId, category, disabled);

        await sock.sendMessage(chatId, {
            text: `${category} commands are now ${disabled ? 'off' : 'on'} here.\nDisabled: ${disabledCategories.join(', ') || 'none'}`
        }, { quoted: msg });
    }
};
