const fs = require('fs');
const path = require('path');
const config = require('../../config');
const state = require('../utils/stateManager');

function loadCommands() {
    return fs.readdirSync(__dirname)
        .filter(file => file.endsWith('.js'))
        .map(file => {
            try {
                return require(path.join(__dirname, file));
            } catch {
                return null;
            }
        })
        .filter(cmd => cmd && cmd.config && cmd.config.name)
        .sort((a, b) => a.config.name.localeCompare(b.config.name));
}

function findCommand(commands, name) {
    return commands.find(command => {
        const aliases = command.config.aliases || [];
        return command.config.name === name || aliases.includes(name);
    });
}

function permissionLabel(level) {
    if (level === 2) return '👑 Owner only';
    if (level === 1) return '🔐 Admin only';
    return '👥 Everyone';
}

function getCategoryEmoji(category) {
    const emojiMap = {
        'general': '📋',
        'admin': '⚙️',
        'media': '🖼️',
        'utility': '🛠️',
        'fun': '🎮',
        'owner': '👑',
        'search': '🔍',
        'ai': '🤖',
        'other': '📚'
    };
    return emojiMap[category] || '📦';
}

module.exports = {
    config: {
        name: 'help',
        aliases: ['commands', 'h', 'menu'],
        version: '2.0.0',
        description: 'Shows available bot commands with detailed information',
        usage: 'help [command_name]',
        examples: ['help', 'help sticker', 'help addcmd'],
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const commands = loadCommands();
        const requested = args[0]?.toLowerCase();
        const chatId = msg.key.remoteJid;
        const configHandler = global.configCommandHandler;
        const prefix = state.getChatPrefix(chatId, configHandler?.getPrefix?.() || config.prefix);

        // DETAILED COMMAND VIEW
        if (requested) {
            const command = findCommand(commands, requested);
            const customCommand = state.getCustomCommand(chatId, requested);

            if (!command && !customCommand) {
                const errorMsg = `╔════════════════════════╗
║        ❌ NOT FOUND       ║
╚════════════════════════╝

Command *${prefix}${requested}* doesn't exist.

💡 *Tip:* Type ${prefix}help to see all available commands.`;
                await sock.sendMessage(chatId, { text: errorMsg }, { quoted: msg });
                return;
            }

            if (customCommand) {
                const customMsg = `╔════════════════════════╗
║      ⚙️ CUSTOM COMMAND    ║
╚════════════════════════╝

*${prefix}${requested}*

📝 Custom command for this chat.

*Response:*
${customCommand.response}`;
                await sock.sendMessage(chatId, { text: customMsg }, { quoted: msg });
                return;
            }

            const aliases = command.config.aliases || [];
            const examples = command.config.examples || [];
            const usage = command.config.usage || command.config.name;
            const category = command.config.category || 'other';
            const disabled = state.isCommandDisabled(chatId, command.config.name);
            const categoryDisabled = state.isCategoryDisabled(chatId, category);
            const cooldown = configHandler?.getCommandCooldown?.(command.config) ?? command.config.cooldown ?? config.commandCooldown ?? 3;
            
            let statusEmoji = '✅ Enabled';
            if (disabled || categoryDisabled) {
                statusEmoji = '❌ Disabled';
                if (categoryDisabled) statusEmoji += ` (${category} category off)`;
            }

            const detail = `╔════════════════════════╗
║      📖 COMMAND INFO     ║
╚════════════════════════╝

*${prefix}${command.config.name}*

${command.config.description}

━━━━━━━━━━━━━━━━━━━━━━━━

📌 *Category:* ${getCategoryEmoji(category)} ${category}
🔑 *Permission:* ${permissionLabel(command.config.permissions || 0)}
⏱️ *Cooldown:* ${cooldown}s
${aliases.length ? `🏷️ *Aliases:* ${aliases.map(a => `${prefix}${a}`).join(', ')}` : ''}
✨ *Status:* ${statusEmoji}

━━━━━━━━━━━━━━━━━━━━━━━━

📚 *Usage:* 
${prefix}${usage}

${examples.length ? `💡 *Examples:*\n${examples.map(ex => `• ${prefix}${ex}`).join('\n')}` : ''}`;

            await sock.sendMessage(chatId, { text: detail.trim() }, { quoted: msg });
            return;
        }

        // MAIN HELP MENU
        const grouped = commands.reduce((acc, cmd) => {
            const category = cmd.config.category || 'other';
            acc[category] = acc[category] || [];
            acc[category].push(cmd);
            return acc;
        }, {});

        let helpMessage = `╔══════════════════════════╗
║     🤖 COMMAND CENTER    ║
╚══════════════════════════╝

👋 Welcome to Asta Bot!

Use *${prefix}<command>* to run a command.
Type *${prefix}help <command>* for detailed info.

━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        // List categories with emoji
        const categories = Object.keys(grouped).sort();
        categories.forEach(category => {
            const categoryDisabled = state.isCategoryDisabled(chatId, category);
            const emoji = getCategoryEmoji(category);
            const count = grouped[category].length;
            const status = categoryDisabled ? ' ⛔' : '';
            helpMessage += `\n\n${emoji} *${category.charAt(0).toUpperCase() + category.slice(1)}* (${count})${status}`;
            
            grouped[category].forEach(command => {
                const disabled = state.isCommandDisabled(chatId, command.config.name) || categoryDisabled;
                const cmdEmoji = disabled ? '🚫' : '✓';
                helpMessage += `\n  ${cmdEmoji} ${prefix}${command.config.name}`;
            });
        });

        // Custom commands
        const customCommands = Object.keys(state.getChatCustomCommands(chatId)).sort();
        if (customCommands.length) {
            helpMessage += `\n\n⚙️ *Custom Commands* (${customCommands.length})`;
            customCommands.forEach(name => {
                helpMessage += `\n  ⚡ ${prefix}${name}`;
            });
        }

        helpMessage += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 *Total:* ${commands.length} built-in + ${customCommands.length} custom commands`;

        await sock.sendMessage(chatId, { text: helpMessage }, { quoted: msg });
    }
};
