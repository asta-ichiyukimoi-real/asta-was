const { askQwen, responseToText, getErrorMessage, isNetworkTimeout } = require('./qwen');

module.exports = {
    config: {
        name: 'smart',
        aliases: ['smartsearch', 'sm'],
        version: '1.1.0',
        description: 'Get a smart AI answer',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const query = args.join(' ').trim();
        if (!query) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Please provide a query. Example: .smart today\'s date'
            }, { quoted: msg });
            return;
        }

        try {
            const response = await askQwen(query, 'qwen/qwen3.6-flash');
            const answer = responseToText(response).trim() || 'No answer was returned.';

            await sock.sendMessage(msg.key.remoteJid, {
                text: `*Smart Answer for:* ${query}\n\n${answer}`
            }, { quoted: msg });
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            if (isNetworkTimeout(error, errorMessage)) {
                console.warn(`Smart command timeout: ${errorMessage}`);
            } else {
                console.error('Smart command error:', error);
            }

            const text = isNetworkTimeout(error, errorMessage)
                ? 'Smart could not connect to the AI service before it timed out. Please try again in a moment.'
                : `Smart failed: ${errorMessage}`;

            await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
        }
    }
};
