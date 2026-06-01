const fs = require('fs');
const path = require('path');

class ChatCommandHandler {
    constructor() {
        this.chatCommands = new Map();
        this.loadChatCommands();
    }

    loadChatCommands() {
        const commandFiles = fs.readdirSync(path.join(__dirname, '../src/commands')).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            try {
                const command = require(path.join(__dirname, '../src/commands', file));
                if (command.config && command.onChat) {
                    this.chatCommands.set(command.config.name, command);
                    if (command.config.aliases) {
                        command.config.aliases.forEach(alias => {
                            this.chatCommands.set(alias, command);
                        });
                    }
                }
            } catch (error) {
                console.error(`Error loading chat command ${file}:`, error);
            }
        }
        console.log(`Loaded ${this.chatCommands.size} chat commands.`);
    }

    async execute(sock, msg, text) {
        for (const [triggerWord, command] of this.chatCommands) {
            const regex = new RegExp(`\\b${triggerWord}\\b`, 'i');
            if (regex.test(text)) {
                try {
                    await command.onChat(sock, msg, text);
                    return true;
                } catch (error) {
                    console.error(`Error executing chat command ${triggerWord}:`, error);
                }
            }
        }
        return false;
    }
}

module.exports = ChatCommandHandler;
