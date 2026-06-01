module.exports = {
    config: {
        name: 'joke',
        aliases: ['funny'],
        version: '1.0.0',
        description: 'Tells a random joke',
        permissions: 0,
        category: 'fun'
    },
    onRun: async (sock, msg, args) => {
        const jokes = [
            'Why don’t programmers like nature? Too many bugs. 🐛',
            'I told my computer I needed a break, and it said: “No problem — I’ll go to sleep.” 😴',
            'Why did the developer go broke? Because he used up all his cache. 💾',
            'Why do Java developers wear glasses? Because they don’t C#. 🤓',
            'How do you comfort a JavaScript bug? You console it. 🧩'
        ];
        const joke = jokes[Math.floor(Math.random() * jokes.length)];
        const reply = `😂 *Random Joke*

${joke}

_Type ${require('../../config').prefix}joke again for another one._`;
        await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
    }
};
