const { exec } = require('child_process');
const config = require('../../config');
const logger = require('../utils/logger');

function getSetting(path, fallback) {
    return global.configCommandHandler?.get?.(path, fallback) ?? fallback;
}

module.exports = {
    config: {
        name: 'restart',
        aliases: ['reboot'],
        version: '1.0.0',
        description: 'Restart the bot process',
        usage: 'restart',
        examples: ['restart'],
        permissions: 2,
        cooldown: 0,
        category: 'developer'
    },
    onRun: async (sock, msg) => {
        const restartCommand = getSetting('developer.restartCommand', config.developer?.restartCommand || '');
        const exitCode = Number(getSetting('developer.restartExitCode', config.developer?.restartExitCode ?? 0)) || 0;

        logger.log('restart_requested', {
            userId: msg.key.participant || msg.key.remoteJid,
            chatId: msg.key.remoteJid,
            restartCommand: restartCommand || null
        });

        await sock.sendMessage(msg.key.remoteJid, {
            text: restartCommand
                ? `Restart command started:\n${restartCommand}`
                : 'Restarting bot process now. Make sure your process manager starts it again.'
        }, { quoted: msg });

        setTimeout(() => {
            if (restartCommand) {
                exec(restartCommand, {
                    cwd: process.cwd(),
                    windowsHide: true
                }, (error) => {
                    if (error) {
                        logger.log('restart_command_error', { error: error.message });
                        process.exit(exitCode);
                        return;
                    }
                    process.exit(exitCode);
                });
                return;
            }

            process.exit(exitCode);
        }, 1000);
    }
};
