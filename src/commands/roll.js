module.exports = {
    config: {
        name: 'roll',
        aliases: ['dice'],
        version: '1.0.0',
        description: 'Rolls dice using XdY notation',
        permissions: 0,
        category: 'fun'
    },
    onRun: async (sock, msg, args) => {
        const input = args[0] || '1d6';
        const match = input.match(/^(\d+)d(\d+)$/i);
        if (!match) {
            await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Use dice format like 1d6 or 2d10. Example: !roll 3d8' }, { quoted: msg });
            return;
        }

        const count = Math.min(Math.max(parseInt(match[1], 10), 1), 10);
        const sides = Math.min(Math.max(parseInt(match[2], 10), 2), 100);
        const rolls = [];
        for (let i = 0; i < count; i += 1) {
            rolls.push(Math.floor(Math.random() * sides) + 1);
        }
        const total = rolls.reduce((sum, value) => sum + value, 0);
        const reply = `🎲 *Dice Roll*

Roll: ${input}
Result: ${rolls.join(' + ')} = ${total}

*Fun tip:* try ${require('../../config').prefix}roll 2d20`;
        await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
    }
};
