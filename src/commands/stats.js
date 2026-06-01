const state = require('../utils/stateManager');

module.exports = {
    config: {
        name: 'stats',
        aliases: ['usage'],
        version: '1.0.0',
        description: 'Shows bot usage statistics',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const botState = state.getState();
        const { usage } = botState;
        
        let statText = `📊 *Bot Statistics*

Total Commands Executed: ${usage.totalCommands}

*Top Commands*`;

        const sorted = Object.entries(usage.commands)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (sorted.length === 0) {
            statText += '\nNo commands executed yet.';
        } else {
            sorted.forEach(([cmd, count], idx) => {
                statText += `\n${idx + 1}. ${cmd}: ${count}`;
            });
        }

        statText += `\n\n_Use !help to see available commands._`;

        await sock.sendMessage(msg.key.remoteJid, { text: statText }, { quoted: msg });
    }
};
