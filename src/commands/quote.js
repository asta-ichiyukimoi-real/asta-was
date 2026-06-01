module.exports = {
    config: {
        name: 'quote',
        aliases: ['inspire'],
        version: '1.0.0',
        description: 'Shares an inspiring quote',
        permissions: 0,
        category: 'fun'
    },
    onRun: async (sock, msg, args) => {
        const quotes = [
            '“The best way to get started is to quit talking and begin doing.” — Walt Disney',
            '“Success is not final, failure is not fatal: it is the courage to continue that counts.” — Winston Churchill',
            '“Dream big and dare to fail.” — Norman Vaughan',
            '“The only limit to our realization of tomorrow is our doubts of today.” — Franklin D. Roosevelt',
            '“Do what you can with all you have, wherever you are.” — Theodore Roosevelt'
        ];
        const quote = quotes[Math.floor(Math.random() * quotes.length)];
        const reply = `✨ *Inspiration Drop*

${quote}

_Type ${require('../../config').prefix}quote again for a fresh boost._`;
        await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
    }
};
