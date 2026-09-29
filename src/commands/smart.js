const { askQwen, responseToText, getErrorMessage, isNetworkTimeout } = require('./qwen');
const { ASSISTANT_TONE_GUIDANCE, chooseReply } = require('../utils/replyCopy');

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
            const response = await askQwen(`${ASSISTANT_TONE_GUIDANCE}\n\nUser request: ${query}`, 'qwen/qwen3.6-flash');
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
                ? chooseReply([
                    'I could not reach the AI service just now. Please try again in a moment.',
                    'The connection timed out before I could prepare a reply. Please try again shortly.',
                    'I am having trouble connecting right now. Please resend your request in a little while.'
                ])
                : 'I could not complete that request just now. Please try again in a moment.';

            await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
        }
    }
};
