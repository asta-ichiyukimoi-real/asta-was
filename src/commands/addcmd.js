const state = require('../utils/stateManager');
const fs = require('fs');
const path = require('path');
const { chooseReply } = require('../utils/replyCopy');

function isValidName(name) {
    return /^[a-z0-9_-]{2,24}$/.test(name);
}

function reservedCommandNames() {
    const names = new Set();
    const commandFiles = fs.readdirSync(__dirname).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        try {
            const command = require(path.join(__dirname, file));
            if (!command.config) continue;
            names.add(command.config.name);
            (command.config.aliases || []).forEach(alias => names.add(alias));
        } catch {
            // Ignore broken command files; the main loader will report them.
        }
    }

    return names;
}

module.exports = {
    config: {
        name: 'addcmd',
        aliases: ['setcmd'],
        version: '1.0.0',
        description: 'Adds a custom text command for this chat',
        usage: 'addcmd <name> <response>',
        examples: ['addcmd rules Be respectful and no spam.'],
        permissions: 1,
        cooldown: 2,
        category: 'custom'
    },
    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const name = args.shift()?.toLowerCase();
        const response = args.join(' ').trim();

        if (!name || !response) {
            await sock.sendMessage(chatId, {
                text: 'Please use the command in this format:\nUse: !addcmd <name> <response>\nExample: !addcmd rules Be respectful and no spam.'
            }, { quoted: msg });
            return;
        }

        if (!isValidName(name)) {
            await sock.sendMessage(chatId, {
                text: 'Command names must be 2-24 characters and use only letters, numbers, _ or -.'
            }, { quoted: msg });
            return;
        }

        if (reservedCommandNames().has(name)) {
            await sock.sendMessage(chatId, {
                text: `!${name} is already a built-in command or alias. Please choose a different name.`
            }, { quoted: msg });
            return;
        }

        if (response.length > 1500) {
            await sock.sendMessage(chatId, {
                text: chooseReply([
                    'That custom command response is too long. Please shorten it and try again.',
                    'Please shorten the custom command response before saving it.'
                ])
            }, { quoted: msg });
            return;
        }

        state.setCustomCommand(chatId, name, response);
        await sock.sendMessage(chatId, {
            text: `Your custom command has been saved. Use !${name} whenever you are ready to run it.`
        }, { quoted: msg });
    }
};
