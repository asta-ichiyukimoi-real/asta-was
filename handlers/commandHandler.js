const fs = require('fs');
const path = require('path');
const config = require('../config');
const state = require('../src/utils/stateManager');
const logger = require('../src/utils/logger');
const ConfigCommandHandler = require('./configCommandHandler');
const commandQueue = require('../src/utils/commandQueue');
const {
    isGroupAdmin: isGroupAdminParticipant,
    isSenderGroupAdmin,
    hasCommandPermission
} = require('../src/utils/commandPermissions');
const { chooseReply } = require('../src/utils/replyCopy');

class CommandHandler {
    constructor(configCommandHandler = new ConfigCommandHandler(config)) {
        this.commands = new Map();
        this.cooldowns = new Map();
        this.configCommandHandler = configCommandHandler;
        this.loadCommands();
    }

    async safeSendMessage(sock, jid, content, options, logType = 'command_send_error') {
        try {
            await sock.sendMessage(jid, content, options);
            return true;
        } catch (error) {
            logger.log(logType, {
                chatId: jid,
                error: error.message,
                code: error.data || error.output?.statusCode
            });
            return false;
        }
    }

    loadCommands() {
        const commandFiles = fs.readdirSync(path.join(__dirname, '../src/commands')).filter(file => file.endsWith('.js'));
        let uniqueCommands = 0;
        for (const file of commandFiles) {
            try {
                const command = require(path.join(__dirname, '../src/commands', file));
                if (command.config && command.onRun) {
                    this.commands.set(command.config.name, command);
                    uniqueCommands++;
                    if (command.config.aliases) {
                        command.config.aliases.forEach(alias => {
                            this.commands.set(alias, command);
                        });
                    }
                } else {
                    console.warn(`Command ${file} is missing config or onRun.`);
                }
            } catch (error) {
                console.error(`Error loading command ${file}:`, error);
            }
        }
        console.log(`Loaded ${uniqueCommands} unique commands with ${this.commands.size} total entries (including aliases).`);
    }

    levenshtein(a, b) {
        const left = String(a || '').toLowerCase();
        const right = String(b || '').toLowerCase();
        const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));

        for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
        for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;

        for (let i = 1; i <= left.length; i += 1) {
            for (let j = 1; j <= right.length; j += 1) {
                const cost = left[i - 1] === right[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                );
            }
        }

        return dp[left.length][right.length];
    }

    suggestCommands(commandName, limit = 3) {
        return [...this.commands.keys()]
            .map(name => ({ name, distance: this.levenshtein(commandName, name) }))
            .filter(item => item.distance <= Math.max(2, Math.ceil(commandName.length / 3)))
            .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
            .slice(0, limit)
            .map(item => item.name);
    }

    async execute(sock, msg, commandName, args) {
        const chatId = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const isOwner = this.configCommandHandler.isOwner(sender, msg);
        const isBotAdmin = this.configCommandHandler.isAdmin(sender);
        const isGroup = chatId.endsWith('@g.us');
        const command = this.commands.get(commandName);

        if (state.isAdminOnlyEnabled() && !isOwner && !isBotAdmin) {
            await this.safeSendMessage(sock, chatId, {
                text: chooseReply([
                    'Only bot admins can use the bot for now. Thank you for understanding.',
                    'The bot is temporarily limited to bot admins. We appreciate your patience.',
                    'For now, only bot admins can use the bot. Thank you for bearing with us.'
                ])
            }, { quoted: msg });
            return;
        }

        if (isGroup && state.isGroupAdminOnlyEnabled(chatId)) {
            let senderIsGroupAdmin = false;
            try {
                senderIsGroupAdmin = await isSenderGroupAdmin(sock, chatId, sender);
            } catch (error) {
                console.error(`Could not verify group admin for ${chatId}:`, error);
                await this.safeSendMessage(sock, chatId, {
                    text: chooseReply([
                        'I could not verify group admin status, so I cannot safely run that command right now.',
                        'I am unable to confirm group admin access at the moment. Please try again shortly.',
                        'I could not verify admin status, so commands are paused here for now. Please try again in a moment.'
                    ])
                }, { quoted: msg });
                return;
            }

            if (!senderIsGroupAdmin) {
                await this.safeSendMessage(sock, chatId, {
                    text: chooseReply([
                        'Only this group’s admins can use the bot here for now.',
                        'Bot access is currently limited to this group’s admins. Thank you for understanding.',
                        'For now, only admins of this group can use the bot here.'
                    ])
                }, { quoted: msg });
                return;
            }
        }

        if (!command) {
            const customCommand = state.getCustomCommand(chatId, commandName);
            if (!customCommand) {
                const suggestions = this.suggestCommands(commandName);
                if (suggestions.length) {
                    const prefix = state.getChatPrefix(chatId, this.configCommandHandler.getPrefix());
                    await this.safeSendMessage(sock, chatId, {
                        text: [
                            `Unknown command: ${prefix}${commandName}`,
                            '',
                            'Did you mean:',
                            ...suggestions.map(name => `- ${prefix}${name}`)
                        ].join('\n')
                    }, { quoted: msg });
                }
                return;
            }

            state.incrementCommandUsage(`custom:${commandName}`);
            logger.log('custom_command', {
                chatId,
                userId: msg.key.participant || msg.key.remoteJid,
                command: commandName
            });
            await this.safeSendMessage(sock, chatId, { text: customCommand.response }, { quoted: msg });
            return;
        }

        // Permission check
        const isBanned = state.hasRole(chatId, sender, 'banned');
        const cooldownSeconds = this.configCommandHandler.getCommandCooldown(command.config);
        const cooldownKey = `${sender}:${command.config.name}`;

        if (isBanned && !isOwner) {
            await this.safeSendMessage(sock, chatId, { text: 'You are banned from using this bot here.' }, { quoted: msg });
            return;
        }

        const permLevel = command.config.permissions ?? 0;
        let isGroupAdmin = false;
        if (permLevel === 2 && msg.key.remoteJid.endsWith('@g.us')) {
            try {
                const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
                isGroupAdmin = isGroupAdminParticipant(groupMetadata.participants, sender);
            } catch (error) {
                console.error('Error checking group admin:', error);
            }
        }

        const category = command.config.category || 'other';
        if (this.configCommandHandler.isCommandDisabledGlobally(command.config.name) && !isOwner) {
            await this.safeSendMessage(sock, chatId, {
                text: `The ${command.config.name} command is disabled globally.`
            }, { quoted: msg });
            return;
        }

        if (permLevel === 2 && this.configCommandHandler.shouldDebugOwnerPermission()) {
            const ownerDebug = this.configCommandHandler.permissionDebug(sender, msg, command.config.name, isOwner);
            console.log('Owner permission debug:', ownerDebug);
            logger.log('owner_permission_debug', ownerDebug);
        }

        if (!hasCommandPermission(permLevel, { isOwner, isBotAdmin, isGroupAdmin })) {
            const message = permLevel === 0
                ? 'This command has an invalid permission level.'
                : permLevel === 1
                    ? 'This command is only for the bot owner or bot admins.'
                    : permLevel === 2
                        ? 'This command is only for the bot owner, bot admins, or group admins.'
                        : 'This command has an unsupported permission level.';
            await this.safeSendMessage(sock, chatId, { text: message }, { quoted: msg });
            return;
        }

        if (!isOwner && state.isCommandDisabled(chatId, command.config.name)) {
            const prefix = state.getChatPrefix(chatId, this.configCommandHandler.getPrefix());
            await this.safeSendMessage(sock, chatId, {
                text: `The ${prefix}${command.config.name} command is disabled in this chat.`
            }, { quoted: msg });
            return;
        }

        if (!isOwner && state.isCategoryDisabled(chatId, category)) {
            await this.safeSendMessage(sock, chatId, {
                text: `The ${category} command category is disabled in this chat.`
            }, { quoted: msg });
            return;
        }

        if (!isOwner && cooldownSeconds > 0) {
            const now = Date.now();
            const availableAt = this.cooldowns.get(cooldownKey) || 0;
            if (availableAt > now) {
                const secondsLeft = Math.ceil((availableAt - now) / 1000);
                await this.safeSendMessage(sock, msg.key.remoteJid, {
                    text: chooseReply([
                        `Please give me ${secondsLeft}s before trying that command again.`,
                        `That command is on a short cooldown. Please try again in ${secondsLeft}s.`,
                        `Just a moment, please. You can use that command again in ${secondsLeft}s.`
                    ])
                }, { quoted: msg });
                return;
            }
            this.cooldowns.set(cooldownKey, now + cooldownSeconds * 1000);
        }

        try {
            state.incrementCommandUsage(command.config.name);
            state.updateHealth({ commandsRun: (state.getState().health.commandsRun || 0) + 1 });
            logger.log('command', {
                chatId,
                userId: sender,
                command: command.config.name,
                args: args.join(' ').slice(0, 250)
            });
            const shouldQueue = command.config.queue || category === 'media';
            if (shouldQueue) {
                await commandQueue.enqueue(`${chatId}:${category}`, () => command.onRun(sock, msg, args));
            } else {
                await command.onRun(sock, msg, args);
            }
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            state.updateHealth({ lastError: error.message });
            logger.log('command_error', {
                chatId,
                userId: sender,
                command: command.config.name,
                error: error.message
            });
            await this.safeSendMessage(sock, msg.key.remoteJid, {
                text: chooseReply([
                    'I could not complete that command just now. Please try again in a moment.',
                    'Something interrupted that command. Please try again shortly.',
                    'I ran into a problem while handling that request. Please try again in a little while.'
                ])
            }, { quoted: msg });
        }
    }
}

module.exports = CommandHandler;
