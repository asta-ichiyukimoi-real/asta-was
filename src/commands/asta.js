const state = require('../utils/stateManager');
const {
    askQwen,
    responseToText,
    getErrorMessage,
    isNetworkTimeout
} = require('./qwen');

const FALLBACK_MODEL = 'qwen/qwen3.6-flash';

function sanitizeId(value) {
    return String(value || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
}

function getSender(msg) {
    return msg.key.participant || msg.key.remoteJid || 'unknown';
}

function buildConversationId(msg) {
    return `${sanitizeId(msg.key.remoteJid)}_${sanitizeId(getSender(msg))}`;
}

function buildPrompt(conversationId, message) {
    const history = state.getAstaConversation(conversationId).history || [];
    const recent = history.slice(-8);

    if (!recent.length) return message;

    const context = recent
        .map(item => `${item.role === 'bot' ? 'Asta' : 'User'}: ${item.text}`)
        .join('\n');

    return `Use this recent conversation context when helpful:\n${context}\n\nUser: ${message}`;
}

async function askAsta(message, conversationId) {
    const prompt = buildPrompt(conversationId, message);

    const astaPrompt = [
        'You are Asta, a helpful WhatsApp bot. Keep replies clear, friendly, natural, and useful.',
        prompt
    ].join('\n\n');

    const response = await askQwen(astaPrompt, FALLBACK_MODEL);
    const text = responseToText(response).trim();

    if (!text) {
        throw new Error('No response from Asta.');
    }

    return text;
}

async function sendAstaReply(sock, msg, message) {
    const conversationId = buildConversationId(msg);
    const text = await askAsta(message, conversationId);

    state.addAstaMessage(conversationId, 'user', message);
    state.addAstaMessage(conversationId, 'bot', text);

    const reply = `*Asta*\n${text}\n\n_Reply to continue. Send or reply to an image and I will use vision._\n[REPLY_ID:intelligent]`;
    await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
}

module.exports = {
    config: {
        name: 'ast',
        aliases: ['chatasta', 'astaai'],
        version: '1.1.0',
        description: 'Chat with Asta with short-term memory',
        usage: 'asta <message>',
        examples: ['asta write a short birthday message', 'asta explain this like I am 12'],
        permissions: 0,
        cooldown: 6,
        category: 'ai'
    },
    buildConversationId,
    askAsta,
    onRun: async (sock, msg, args) => {
        const message = args.join(' ').trim();
        if (!message) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Please send a message to start chatting with Asta.\nExample: !asta hi'
            }, { quoted: msg });
            return;
        }

        try {
            await sendAstaReply(sock, msg, message);
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            if (isNetworkTimeout(error, errorMessage)) {
                console.warn(`Asta command timeout: ${errorMessage}`);
            } else {
                console.error('Asta command error:', error);
            }

            const text = isNetworkTimeout(error, errorMessage)
                ? 'Asta could not connect to the AI service before it timed out. Please try again in a moment.'
                : `There was an error talking to Asta: ${errorMessage}`;

            await sock.sendMessage(msg.key.remoteJid, {
                text
            }, { quoted: msg });
        }
    },
    onReply: async (sock, msg, replyText) => {
        try {
            await sendAstaReply(sock, msg, replyText);
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            if (isNetworkTimeout(error, errorMessage)) {
                console.warn(`Asta reply timeout: ${errorMessage}`);
            } else {
                console.error('Asta reply error:', error);
            }

            const text = isNetworkTimeout(error, errorMessage)
                ? 'Asta could not connect to the AI service before it timed out. Please try again in a moment.'
                : `There was an error continuing the conversation: ${errorMessage}`;

            await sock.sendMessage(msg.key.remoteJid, {
                text
            }, { quoted: msg });
        }
    }
};
