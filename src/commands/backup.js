const path = require('path');
const backup = require('../services/backup');

module.exports = {
    config: {
        name: 'backup',
        aliases: ['backups'],
        version: '1.0.0',
        description: 'Creates or lists bot-state backups',
        usage: 'backup [list]',
        examples: ['backup', 'backup list'],
        permissions: 2,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        if (args[0]?.toLowerCase() === 'list') {
            const files = backup.listBackups().slice(0, 10);
            await sock.sendMessage(msg.key.remoteJid, {
                text: files.length ? `Recent backups:\n${files.map(file => `- ${file}`).join('\n')}` : 'No backups found.'
            }, { quoted: msg });
            return;
        }

        const file = backup.createBackup();
        await sock.sendMessage(msg.key.remoteJid, {
            text: `Backup created:\n${path.basename(file)}`
        }, { quoted: msg });
    }
};
