module.exports = {
    config: {
        name: 'reverse',
        aliases: ['rev'],
        version: '1.0.0',
        description: 'Reverses the text you send',
        permissions: 0,
        category: 'fun'
    },
    onRun: async (sock, msg, args) => {
        const text = args.join(' ');
        if (!text) {
            await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Please provide a message to reverse. Example: !reverse hello world' }, { quoted: msg });
            return;
        }

        const reversed = text.split('').reverse().join('');
        const reply = `🔄 *Text Reversed*

${reversed}

Original: ${text}`;
        await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
    }
};
