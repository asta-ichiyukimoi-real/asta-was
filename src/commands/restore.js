const backup = require('../services/backup');

module.exports = {
    config: {
        name: 'restore',
        aliases: ['restorestate'],
        version: '1.0.0',
        description: 'Restores bot-state from a backup file',
        usage: 'restore <backup-file>',
        examples: ['restore bot-state-2026-05-09T10-00-00-000Z.json'],
        permissions: 2,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const fileName = args[0];
        if (!fileName) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Use: !backup list, then !restore <backup-file>'
            }, { quoted: msg });
            return;
        }

        try {
            const currentBackup = backup.restoreBackup(fileName);
            await sock.sendMessage(msg.key.remoteJid, {
                text: `State restored from ${fileName}.\nCurrent state was backed up first as ${require('path').basename(currentBackup)}.\nRestart the bot so all restored settings are fully reloaded.`
            }, { quoted: msg });
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `Restore failed: ${error.message}`
            }, { quoted: msg });
        }
    }
};
