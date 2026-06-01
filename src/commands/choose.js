module.exports = {
    config: {
        name: 'choose',
        aliases: ['pick'],
        version: '1.0.0',
        description: 'Randomly picks from options separated by commas',
        permissions: 0,
        category: 'fun'
    },
    onRun: async (sock, msg, args) => {
        const input = args.join(' ');
        const options = input
            .split(',')
            .map(option => option.trim())
            .filter(Boolean);

        if (options.length < 2) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Give me at least two options separated by commas.\nExample: !choose rice, pasta, pizza'
            }, { quoted: msg });
            return;
        }

        const choice = options[Math.floor(Math.random() * options.length)];
        await sock.sendMessage(msg.key.remoteJid, {
            text: `I choose: *${choice}*`
        }, { quoted: msg });
    }
};
