module.exports = {
    config: {
        name: 'test',
        aliases: ['reply-test'],
        version: '1.0.0',
        description: 'Test command - reply to bot messages to test the system',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const reply = `🧪 *Test Command* [REPLY_ID:test]

Reply to this message with any text to test the reply system!

You can reply with:
• Any text
• Questions
• Feedback`;

        await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
    },
    onReply: async (sock, msg, replyText) => {
        const response = `✅ *Reply Received*

You replied with: "${replyText}"

This proves the reply system is working! 🎉`;

        await sock.sendMessage(msg.key.remoteJid, { text: response }, { quoted: msg });
    }
};
