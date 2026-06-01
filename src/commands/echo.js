module.exports = {
    config: {
        name: 'echo',
        aliases: ['repeat'],
        version: '1.0.0',
        description: 'Echoes the provided text',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const text = args.join(' ');
        if (text) {
            const reply = `🔊 *Echo Mode Activated*

${text}

> Sent back exactly as requested.`;
            await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Please provide some text after the command to echo it back.' }, { quoted: msg });
        }
    }
};