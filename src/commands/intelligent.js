const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const state = require('../utils/stateManager');

const AI_CHAT_URL = 'https://omegatech-api.dixonomega.tech/api/ai/Qwen-Claude-Haiku';
const AI_RESEARCH_URL = 'https://omegatech-api.dixonomega.tech/api/ai/Ai-research';
const VISION_URL = 'https://omegatech-api.dixonomega.tech/api/ai/Gpt-4-mini';
const IMAGE_URL = 'https://omegatech-api.dixonomega.tech/api/ai/magicstudio';
const CATBOX_UPLOAD_URL = 'https://catbox.moe/user/api.php';
const LOCAL_TIME_ZONE = process.env.BOT_TIMEZONE || 'Africa/Lagos';

function sanitizeId(value) {
    return String(value || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
}

function getSender(msg) {
    return msg.key.participant || msg.key.remoteJid || 'unknown';
}

function getConversationId(msg) {
    return `${sanitizeId(msg.key.remoteJid)}_${sanitizeId(getSender(msg))}`;
}

function remember(msg, userText, botText) {
    const conversationId = getConversationId(msg);
    if (userText) state.addAstaMessage(conversationId, 'user', userText);
    if (botText) state.addAstaMessage(conversationId, 'bot', botText);
}

function getRecentMemory(msg) {
    const conversation = state.getAstaConversation(getConversationId(msg));
    return conversation.history || [];
}

function buildContextText(msg) {
    const recent = getRecentMemory(msg).slice(-8);
    if (!recent.length) return '';

    return recent
        .map(item => `${item.role === 'bot' ? 'Assistant' : 'User'}: ${item.text}`)
        .join('\n');
}

function looksLikeImageGenerationRequest(text) {
    return /\b(draw|generate|create|make|send)\b.*\b(image|picture|photo|art|poster|wallpaper|illustration)\b/i.test(text || '')
        || /\b(show me|make me|draw me)\b/i.test(text || '');
}

function stripImageIntent(text) {
    return String(text || '')
        .replace(/^(please\s+)?(draw|generate|create|make|send|show me|make me|draw me)\s+/i, '')
        .replace(/^(an?|the)\s+(image|picture|photo|art|poster|wallpaper|illustration)\s+(of|for|about)\s+/i, '')
        .trim();
}

function isImageUrl(value) {
    return /^https?:\/\/\S+/i.test(value || '');
}

function looksLikeDateTimeRequest(text) {
    return /\b(today'?s date|date today|what date|current date|what day|day today|current time|time now|what time)\b/i.test(text || '');
}

function looksLikeResearchRequest(text) {
    return /\b(research|details|detailed|deep|latest|current|recent|news|search|web|google|source|sources|facts|fact-check|explain in detail)\b/i.test(text || '');
}

function stripResearchIntent(text) {
    return String(text || '')
        .replace(/^(research|details|detail|detailed|deep|search|web|google)\s+/i, '')
        .trim();
}

function answerDateTime(text) {
    const now = new Date();
    const wantsTime = /\b(time|clock)\b/i.test(text || '');
    const wantsDay = /\b(day)\b/i.test(text || '');
    const date = new Intl.DateTimeFormat('en-US', {
        timeZone: LOCAL_TIME_ZONE,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(now);
    const time = new Intl.DateTimeFormat('en-US', {
        timeZone: LOCAL_TIME_ZONE,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(now);

    if (wantsTime && !wantsDay) {
        return `The current time is ${time} (${LOCAL_TIME_ZONE}).`;
    }

    return `Today is ${date}${wantsTime ? `, and the time is ${time}` : ''}.`;
}

function unwrapMessage(message) {
    let current = message || {};

    for (let i = 0; i < 5; i += 1) {
        const next = current.ephemeralMessage?.message
            || current.viewOnceMessage?.message
            || current.viewOnceMessageV2?.message
            || current.viewOnceMessageV2Extension?.message
            || current.documentWithCaptionMessage?.message;

        if (!next) break;
        current = next;
    }

    return current;
}

function getContextInfo(msg) {
    const message = unwrapMessage(msg.message);
    return message.extendedTextMessage?.contextInfo
        || message.imageMessage?.contextInfo
        || message.videoMessage?.contextInfo
        || message.documentMessage?.contextInfo
        || null;
}

function findImageMessage(msg) {
    const message = unwrapMessage(msg.message);
    if (message.imageMessage) return message.imageMessage;

    const quoted = getContextInfo(msg)?.quotedMessage;
    const quotedMessage = unwrapMessage(quoted);
    return quotedMessage.imageMessage || null;
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function imageMessageToBuffer(imageMessage) {
    if (!imageMessage) return null;

    const stream = await downloadContentFromMessage(imageMessage, 'image');
    const buffer = await streamToBuffer(stream);
    const mime = imageMessage.mimetype || 'image/jpeg';
    return { buffer, mime };
}

function parseRequest(args) {
    const first = (args[0] || '').toLowerCase();
    const second = args[1] || '';
    const fullText = args.join(' ').trim();

    if (['draw', 'image', 'generate', 'img'].includes(first)) {
        return {
            type: 'image',
            prompt: args.slice(1).join(' ').trim()
        };
    }

    if (looksLikeImageGenerationRequest(fullText)) {
        return {
            type: 'image',
            prompt: stripImageIntent(fullText) || fullText
        };
    }

    if (['vision', 'analyze', 'see'].includes(first)) {
        return {
            type: 'vision',
            imageUrl: second,
            prompt: args.slice(2).join(' ').trim() || 'What do you see in this image?'
        };
    }

    if (isImageUrl(first)) {
        return {
            type: 'vision',
            imageUrl: args[0],
            prompt: args.slice(1).join(' ').trim() || 'What do you see in this image?'
        };
    }

    if (looksLikeDateTimeRequest(fullText)) {
        return {
            type: 'datetime',
            prompt: fullText
        };
    }

    if (looksLikeResearchRequest(fullText)) {
        return {
            type: 'research',
            prompt: fullText,
            query: stripResearchIntent(fullText) || fullText
        };
    }

    return {
        type: 'chat',
        prompt: fullText
    };
}

function getErrorMessage(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.cause?.message) return error.cause.message;
    return String(error);
}

function isNetworkTimeout(error, message) {
    return error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'
        || error?.name === 'TimeoutError'
        || error?.name === 'AbortError'
        || /timeout|fetch failed|connect/i.test(message);
}

async function fetchJson(url, timeoutMs = 45000) {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'AstaBot/1.0 (WhatsApp bot)' },
        signal: AbortSignal.timeout(timeoutMs)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.success === false) {
        throw new Error(data?.message || data?.error || `API responded with status ${response.status}`);
    }

    return data;
}

async function askOmegaResearch(message) {
    const url = `${AI_RESEARCH_URL}?message=${encodeURIComponent(message)}`;
    const data = await fetchJson(url, 60000);
    const text = data.result || data.answer || data.message;

    if (!text) {
        throw new Error('No answer returned from AI.');
    }

    return String(text).trim();
}

async function askOmegaChat(message, sessionId) {
    const systemPrompt = [
        'You are Asta, a helpful WhatsApp AI assistant.',
        'Reply naturally and clearly. Be brief unless the user asks for detail.',
        'Do not include sources unless the user asks.'
    ].join(' ');
    const url = `${AI_CHAT_URL}?message=${encodeURIComponent(message)}&model=qwen&sessionId=${encodeURIComponent(sessionId)}&systemPrompt=${encodeURIComponent(systemPrompt)}`;
    const data = await fetchJson(url, 45000);
    const text = data.answer || data.result || data.response || data.message;

    if (!text) {
        throw new Error('No answer returned from AI.');
    }

    return String(text).trim();
}

async function askOmegaVision(message, imageUrl, sessionId) {
    const url = `${VISION_URL}?message=${encodeURIComponent(message)}&imageUrl=${encodeURIComponent(imageUrl)}&model=1&sessionId=${encodeURIComponent(sessionId)}`;
    const data = await fetchJson(url, 60000);
    const text = data.answer || data.result || data.message;

    if (!text) {
        throw new Error('No vision answer returned from AI.');
    }

    return String(text).trim();
}

function extensionFromMime(mime) {
    if (/png/i.test(mime)) return 'png';
    if (/webp/i.test(mime)) return 'webp';
    return 'jpg';
}

function dataUriToImage(dataUri) {
    const match = String(dataUri || '').match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;

    return {
        buffer: Buffer.from(match[2], 'base64'),
        mime: match[1]
    };
}

function base64ToImage(value) {
    const text = String(value || '').trim();
    if (text.length < 500 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;

    return {
        buffer: Buffer.from(text, 'base64'),
        mime: 'image/jpeg'
    };
}

async function uploadImageForVision(image) {
    if (!image?.buffer) {
        throw new Error('No image data to upload.');
    }

    const form = new FormData();
    const fileName = `vision-${Date.now()}.${extensionFromMime(image.mime || 'image/jpeg')}`;
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', new Blob([image.buffer], { type: image.mime || 'image/jpeg' }), fileName);

    const response = await fetch(CATBOX_UPLOAD_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(60000)
    });

    const text = (await response.text()).trim();
    if (!response.ok || !/^https?:\/\//i.test(text)) {
        throw new Error(`Image upload failed: ${text || response.status}`);
    }

    return text;
}

async function generateOmegaImage(prompt) {
    const url = `${IMAGE_URL}?prompt=${encodeURIComponent(prompt)}`;
    const response = await fetch(url, {
        headers: { 'User-Agent': 'AstaBot/1.0 (WhatsApp bot)' },
        signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
        throw new Error(`Image API responded with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const data = await response.json();
        const imageUrl = data.url || data.image || data.imageUrl || data.result;
        if (/^https?:\/\//i.test(imageUrl || '')) return { url: imageUrl };
        if (String(imageUrl || '').startsWith('data:')) return dataUriToImage(imageUrl);
        if (imageUrl) {
            const image = base64ToImage(imageUrl);
            if (image) return image;
        }
        throw new Error(data.message || 'Image API did not return an image.');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, mime: contentType || 'image/jpeg' };
}

async function sendText(sock, msg, title, text) {
    await sock.sendMessage(msg.key.remoteJid, {
        text: `*${title}*\n${text.slice(0, 3500)}\n\n_Reply to continue. Send or reply to an image and I will use vision._\n[REPLY_ID:intelligent]`
    }, { quoted: msg });
}

function buildPromptWithMemory(msg, prompt) {
    const context = buildContextText(msg);
    if (!context) return prompt;

    return [
        'Use this recent conversation context when helpful. Do not mention the context unless it matters.',
        context,
        '',
        `User: ${prompt}`
    ].join('\n');
}

function buildImagePrompt(msg, prompt) {
    const cleaned = stripImageIntent(prompt);
    const context = buildContextText(msg);

    if (cleaned && !/\b(it|that|this|them|those|the image|the picture|the photo|what you saw)\b/i.test(cleaned)) {
        return cleaned;
    }

    if (!context) {
        return cleaned || prompt || 'a detailed creative image';
    }

    return [
        cleaned || prompt || 'Create an image based on the recent conversation.',
        '',
        'Recent conversation context:',
        context
    ].join('\n').slice(0, 1800);
}

async function runIntelligent(sock, msg, request) {
    const imageMessage = findImageMessage(msg);
    const imageData = await imageMessageToBuffer(imageMessage);
    const sessionId = getConversationId(msg);

    if (imageData && request.type !== 'image') {
        const prompt = request.prompt || 'What do you see in this image?';
        const uploadedImageUrl = await uploadImageForVision(imageData);
        const text = await askOmegaVision(buildPromptWithMemory(msg, prompt), uploadedImageUrl, sessionId);
        remember(msg, `[Image question] ${prompt}`, `[Vision] ${text}`);
        await sendText(sock, msg, 'AI Vision', text);
        return;
    }

    if (request.type === 'image') {
        const imagePrompt = buildImagePrompt(msg, request.prompt);
        const image = await generateOmegaImage(imagePrompt);
        if (!image.url && !Buffer.isBuffer(image.buffer)) {
            throw new Error('Image API returned an unreadable image.');
        }

        const imageMessage = image.url
            ? { image: { url: image.url } }
            : { image: image.buffer, mimetype: image.mime || 'image/jpeg' };

        await sock.sendMessage(msg.key.remoteJid, {
            ...imageMessage,
            caption: `*AI Image*\n${imagePrompt.slice(0, 500)}\n\n_Reply to continue._\n[REPLY_ID:intelligent]`
        }, { quoted: msg });
        remember(msg, request.prompt || 'send an image', `[Generated image] ${imagePrompt}`);
        return;
    }

    if (request.type === 'vision') {
        if (!request.imageUrl) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Send an image URL after vision, or reply to an image with your question.'
            }, { quoted: msg });
            return;
        }

        const text = await askOmegaVision(buildPromptWithMemory(msg, request.prompt), request.imageUrl, sessionId);
        remember(msg, `[Image URL question] ${request.prompt}`, `[Vision] ${text}`);
        await sendText(sock, msg, 'AI Vision', text);
        return;
    }

    if (request.type === 'datetime') {
        const text = answerDateTime(request.prompt);
        remember(msg, request.prompt, text);
        await sendText(sock, msg, 'AI', text);
        return;
    }

    if (request.type === 'research') {
        const prompt = buildPromptWithMemory(msg, request.query || request.prompt);
        const text = await askOmegaResearch(prompt);
        remember(msg, request.prompt, text);
        await sendText(sock, msg, 'AI Research', text);
        return;
    }

    const prompt = buildPromptWithMemory(msg, request.prompt);
    const text = await askOmegaChat(prompt, sessionId);
    remember(msg, request.prompt, text);
    await sendText(sock, msg, 'AI', text);
}

async function sendIntelligentError(sock, msg, error) {
    const errorMessage = getErrorMessage(error);
    if (isNetworkTimeout(error, errorMessage)) {
        console.warn(`Intelligent command timeout: ${errorMessage}`);
    } else {
        console.error('Intelligent command error:', error);
    }

    const text = isNetworkTimeout(error, errorMessage)
        ? 'AI could not connect before the network timed out. Please try again in a moment.'
        : `AI failed: ${errorMessage}`;

    await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
}

module.exports = {
    config: {
        name: 'intelligent',
        aliases: ['ai', 'asta', 'brain', 'genius'],
        version: '1.2.0',
        description: 'Smart AI command using Omegatech chat, vision, and image generation',
        usage: 'ai <message|draw|vision>',
        examples: [
            'ai what is today date',
            'ai explain photosynthesis simply',
            'ai research latest AI news',
            'ai vision https://i.pinimg.com/236x/f5/6a/87/f56a87d1d56b3e44233eae545a5f8651.jpg what is here?',
            'ai draw anime boy'
        ],
        permissions: 0,
        cooldown: 8,
        category: 'ai'
    },
    onRun: async (sock, msg, args) => {
        const request = parseRequest(args);

        if (!request.prompt && request.type !== 'image' && !findImageMessage(msg)) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: [
                    'Ask me something:',
                    '.ai what is today date',
                    '.ai explain photosynthesis simply',
                    '.ai research latest AI news',
                    '.ai vision <imageUrl> what is here?',
                    '.ai draw anime boy'
                ].join('\n')
            }, { quoted: msg });
            return;
        }

        try {
            await runIntelligent(sock, msg, request);
        } catch (error) {
            await sendIntelligentError(sock, msg, error);
        }
    },
    onReply: async (sock, msg, replyText) => {
        const request = parseRequest((replyText || '').trim().split(/ +/).filter(Boolean));

        if (!request.prompt && request.type !== 'image' && !findImageMessage(msg)) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Reply with a message, or send/reply to an image with your question.'
            }, { quoted: msg });
            return;
        }

        try {
            await runIntelligent(sock, msg, request);
        } catch (error) {
            await sendIntelligentError(sock, msg, error);
        }
    }
};
