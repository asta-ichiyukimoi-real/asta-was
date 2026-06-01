const state = require('../utils/stateManager');
const fs = require('fs');
const path = require('path');

const PROTECTED = new Set(['enable', 'disable', 'help', 'menu', 'settings']);

function resolveCommandName(input) {
    const commandFiles = fs.readdirSync(__dirname).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const command = require(path.join(__dirname, file));
            const aliases = command.config?.aliases || [];
            if (command.config?.name === input || aliases.includes(input)) {
                return command.config.name;
            }
        } catch {
            // Ignore broken command files; the main loader will report them.
        }
    }
    return input;
}

module.exports = {
    config: {
        name: 'disable',
        aliases: ['disablecmd'],
        version: '1.0.0',
        description: 'Disables a command in this chat',
        usage: 'disable <command>',
        examples: ['disable sticker'],
        permissions: 1,
        cooldown: 2,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const commandName = args[0]?.toLowerCase();

        if (!commandName) {
            const disabled = state.getDisabledCommands(chatId);
            await sock.sendMessage(chatId, {
                text: disabled.length
                    ? `Disabled commands here:\n${disabled.map(name => `- ${name}`).join('\n')}`
                    : 'No commands are disabled here.\nUse: !disable <command>'
            }, { quoted: msg });
            return;
        }

        const resolvedName = resolveCommandName(commandName);

        if (PROTECTED.has(resolvedName)) {
            await sock.sendMessage(chatId, { text: `You cannot disable !${resolvedName}.` }, { quoted: msg });
            return;
        }

        state.setCommandDisabled(chatId, resolvedName, true);
        await sock.sendMessage(chatId, { text: `Disabled !${resolvedName} in this chat.` }, { quoted: msg });
    }
};
