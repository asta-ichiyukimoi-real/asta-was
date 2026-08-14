const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');
const state = require('../utils/stateManager');
const { friendlyApiError, getErrorMessage, isTimeout } = require('../utils/apiClient');
const contextResolver = require('../utils/contextResolver');

const AI_CHAT_URL = 'https://omegatech-api.dixonomega.tech/api/ai/Chatbot';
const VISION_URL = 'https://omegatech-api.dixonomega.tech/api/ai/Gpt-4-mini';
const IMAGE_URL = 'https://omegatech-api.dixonomega.tech/api/ai/Aicli';
const CATBOX_UPLOAD_URL = 'https://catbox.moe/user/api.php';
const LOCAL_TIME_ZONE = process.env.BOT_TIMEZONE || config.ai?.timezone || config.bot?.timezone || 'Africa/Lagos';
const MAX__IMAGES = config.ai?.maxImages || config.media?.MaxImages || 8;
const AI_REQUEST_TIMEOUT_MS = config.ai?.requestTimeoutMs || 45000;
const AI_VISION_TIMEOUT_MS = config.ai?.visionTimeoutMs || 60000;
const AI_CONTEXT_MESSAGES = config.ai?.contextMessages || 8;
const PRONOUN_REFERENCE_PATTERN = contextResolver.PRONOUN_REFERENCE_PATTERN;

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
    const recent = getRecentMemory(msg).slice(-AI_CONTEXT_MESSAGES);
    if (!recent.length) return '';

    return recent
        .map(item => `${item.role === 'bot' ? 'Assistant' : 'User'}: ${item.text}`)
        .join('\n');
}

function looksLikeImageGenerationRequest(text) {
    return /\b(draw|generate|create|make|send|show|give|need|want|get|find)\b.*\b(images?|pictures?|photos?|arts?|posters?|wallpapers?|illustrations?|pins?)\b/i.test(text || '')
        || /\b(show me|make me|draw me)\b/i.test(text || '')
        || /^\s*\d{0,2}\s*(images?|pictures?|photos?|wallpapers?|pins?)\b/i.test(text || '');
}

function stripImageIntent(text) {
    return String(text || '')
        .replace(/^(please\s+)?(?:can|could|would|will)\s+you\s+/i, '')
        .replace(/^(please\s+)?(?:i\s+)?(show me|make me|draw me|draw|generate|create|make|send|show|give|need|want|get|find)\s+(?:me\s+)?/i, '')
        .replace(/^(?:(?:an?|the)\s+)?(?:images?|pictures?|photos?|arts?|posters?|wallpapers?|illustrations?|pins?)\s+(?:of|for|about)\s+/i, '')
        .trim();
}

function normalizeCommandArgs(args) {
    const commandAliases = new Set(['ai', 'asta', 'brain', 'genius', 'intelligent']);
    const normalized = [...args];
    const first = String(normalized[0] || '').toLowerCase().replace(/^[^\w]+/, '');

    if (commandAliases.has(first)) {
        normalized.shift();
    }

    return normalized;
}

function parseImageCount(text) {
    const value = String(text || '');
    const match = value.match(/\b(?:send|show|give|need|want|make|get)?\s*(\d{1,2})\s*(?:images?|pictures?|photos?|wallpapers?|pins?)\b/i)
        || value.match(/\b(?:images?|pictures?|photos?|wallpapers?|pins?)\s*(?:x|:)?\s*(\d{1,2})\b/i);
    const count = match ? Number(match[1]) : 1;

    if (!Number.isInteger(count) || count < 1) return 1;
    return Math.min(count, MAX__IMAGES);
}

function stripImageCount(text) {
    return String(text || '')
        .replace(/\b(?:send|show|give|need|want|make|get)?\s*\d{1,2}\s*(?:images?|pictures?|photos?|wallpapers?|pins?)\s*(?:of|for|about)?\s*/i, '')
        .replace(/\b(?:images?|pictures?|photos?|wallpapers?|pins?)\s*(?:x|:)?\s*\d{1,2}\b/i, '')
        .trim();
}

function cleanImagePrompt(text) {
    const withoutCount = stripImageCount(text);
    const cleaned = stripImageIntent(withoutCount)
        .replace(/^(?:an?|the|some)\s+/i, '')
        .replace(/^and\s+(?:an?|the|some)?\s*/i, '')
        .replace(/^(?:images?|pictures?|photos?|arts?|posters?|wallpapers?|illustrations?|pins?)\s+(?:of|for|about)\s+/i, '')
        .replace(/^(of|for|about)\s+/i, '')
        .trim();

    return cleaned || withoutCount.replace(/^(of|for|about)\s+/i, '').trim() || String(text || '').trim();
}

function isImageUrl(value) {
    return /^https?:\/\/\S+/i.test(value || '');
}

function looksLikeDateTimeRequest(text) {
    return /\b(today'?s date|date today|what date|current date|what day|day today|current time|time now|what time)\b/i.test(text || '');
}

function looksLikeCapabilityRequest(text) {
    return /\b(what can you do|your features|your abilities|what are you able to do|what do you do)\b/i.test(text || '');
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

function answerCapabilities() {
    return [
        'I can chat with you and keep track of the conversation, so follow-up words like him, her, it, and that can refer to what we were already discussing.',
        'I can answer questions about images when you send one, reply to one, or give me an image URL.',
        'I can send  images from natural requests like "send 3 images of Goku in Super Saiyan mode".',
        'I can research current topics, explain things, answer date/time questions, and continue from replies.'
    ].join('\n');
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
    args = normalizeCommandArgs(args);
    const first = (args[0] || '').toLowerCase();
    const second = args[1] || '';
    const fullText = args.join(' ').trim();

    if (['memory', 'mem', 'context'].includes(first)) {
        return {
            type: 'memory',
            action: (second || 'show').toLowerCase(),
            prompt: fullText || 'memory'
        };
    }

    if (['draw', 'image', 'images', 'picture', 'pictures', 'photo', 'photos', 'pin', 'pins', 'generate', 'img'].includes(first)) {
        const prompt = args.slice(1).join(' ').trim();
        return {
            type: 'image',
            prompt: cleanImagePrompt(prompt),
            count: parseImageCount(prompt)
        };
    }

    if (looksLikeImageGenerationRequest(fullText)) {
        return {
            type: 'image',
            prompt: cleanImagePrompt(fullText),
            count: parseImageCount(fullText)
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

    if (looksLikeCapabilityRequest(fullText)) {
        return {
            type: 'capabilities',
            prompt: fullText
        };
    }

    return {
        type: 'chat',
        prompt: fullText
    };
}

function isNetworkTimeout(error, message) {
    return isTimeout(error) || /timeout|fetch failed|connect/i.test(message || '');
}

async function fetchJson(url, timeoutMs = 45000) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            Accept: 'application/json'
        },
        signal: AbortSignal.timeout(timeoutMs)
    });
    const body = await response.text();
    let data = null;

    try {
        data = body ? JSON.parse(body) : null;
    } catch {
        throw new Error(`AI API returned invalid JSON with status ${response.status}: ${body.slice(0, 300) || 'empty body'}`);
    }

    if (!data || typeof data !== 'object') {
        throw new Error(`AI API returned empty JSON with status ${response.status}: ${body.slice(0, 300) || 'empty body'}`);
    }

    if (!response.ok || data.success === false || data.status === false) {
        throw new Error(data.message || data.error || `AI API responded with status ${response.status}`);
    }

    return data;
}

function pickText(source, fields) {
    if (!source || typeof source !== 'object') return '';

    for (const field of fields) {
        const value = source[field];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }

    return '';
}

function extractChatReply(data) {
    return pickText(data, ['reply', 'answer', 'result', 'response', 'text'])
        || pickText(data?.data, ['reply', 'answer', 'result', 'response', 'text', 'message'])
        || pickText(data?.result, ['reply', 'answer', 'response', 'text', 'message'])
        || pickText(data?.output, ['reply', 'answer', 'response', 'text', 'message']);
}

function describeResponseShape(data) {
    if (data === null) return 'null';
    if (data === undefined) return 'undefined';
    if (typeof data !== 'object') return typeof data;

    const keys = Object.keys(data).slice(0, 12).join(', ') || 'none';
    const nested = ['data', 'result', 'output']
        .filter(key => data[key] && typeof data[key] === 'object')
        .map(key => `${key}: ${Object.keys(data[key]).slice(0, 8).join(', ') || 'none'}`)
        .join('; ');

    return nested ? `${keys}; ${nested}` : keys;
}

function extractVisionReply(data) {
    return pickText(data, ['answer', 'reply', 'result', 'response', 'text', 'message'])
        || pickText(data?.data, ['answer', 'reply', 'result', 'response', 'text', 'message'])
        || pickText(data?.result, ['answer', 'reply', 'response', 'text', 'message'])
        || pickText(data?.output, ['answer', 'reply', 'response', 'text', 'message']);
}

async function askOmegaChat(message, sessionId, fallbackMessage = '') {
    const url = `${AI_CHAT_URL}?action=chat&message=${encodeURIComponent(message)}&sessionId=${encodeURIComponent(sessionId)}&needSearch=true`;
    const data = await fetchJson(url, AI_REQUEST_TIMEOUT_MS);
    const text = extractChatReply(data);

    if (!text) {
        const fallback = String(fallbackMessage || '').trim();
        if (fallback && fallback !== message) {
            return askOmegaChat(fallback, sessionId);
        }

        throw new Error(`No answer returned from AI. Response fields: ${describeResponseShape(data)}`);
    }

    return String(text).trim();
}

async function askOmegaVision(message, imageUrl, sessionId) {
    const visionSessionId = imageUrl || sessionId;
    const url = `${VISION_URL}?message=${encodeURIComponent(message)}&imageUrl=${encodeURIComponent(imageUrl)}&model=1&sessionId=${encodeURIComponent(visionSessionId)}`;
    const data = await fetchJson(url, AI_VISION_TIMEOUT_MS);
    const text = extractVisionReply(data);

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
        signal: AbortSignal.timeout(AI_VISION_TIMEOUT_MS)
    });

    const text = (await response.text()).trim();
    if (!response.ok || !/^https?:\/\//i.test(text)) {
        throw new Error(`Image upload failed: ${text || response.status}`);
    }

    return text;
}

async function searchImages(query, count = 1) {
    const limit = Math.min(Math.max(Number(count) || 1, 1), MAX__IMAGES);
    const baseUrl = `${IMAGE_URL}?action=image&model=flux&query=${encodeURIComponent(query)}`;
    
    const images = [];
    for(let i = 0; i < limit; i++) {
        const res = await fetch(`${baseUrl}&seed=${Date.now() + i}`, { 
            redirect: 'follow',
            signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS)
        });
        if(!res.ok) throw new Error(`API failed: ${res.status}`);
        images.push(res.url); // final redirected image url
    }
    return images;
}

async function sendText(sock, msg, title, text) {
    await sock.sendMessage(msg.key.remoteJid, {
        text: `*${title}*\n${text.slice(0, 3500)}\n\n_Reply to continue. Send or reply to an image and I will use vision._\n[REPLY_ID:intelligent]`
    }, { quoted: msg });
}

async function sendPresence(sock, msg, type) {
    try {
        await sock.sendPresenceUpdate(type, msg.key.remoteJid);
    } catch {
        // Presence is nice to have, but not required for command success.
    }
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

function cleanSubjectCandidate(value) {
    return String(value || '')
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/\b(btw|by the way|send|show|give|get|find|make|draw|generate|create|need|want|image|images|picture|pictures|photo|photos|wallpaper|wallpapers|pin|pins|please|can|could|would|will|you|me|about|of|for|is|are|was|were|the|a|an|do|does|did|know|heard|hear)\b/gi, ' ')
        .replace(/[^\w\s'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractSubjectFromText(text) {
    const value = String(text || '').trim();
    const patterns = [
        /\bwho\s+is\s+(.+?)(?:[?.!]|$)/i,
        /\bwhat\s+is\s+(.+?)(?:[?.!]|$)/i,
        /\bdo\s+you\s+know\s+(.+?)(?:[?.!]|$)/i,
        /\bhave\s+you\s+heard\s+of\s+(.+?)(?:[?.!]|$)/i,
        /\bi\s+know\s+(.+?)(?:[?.!]|$)/i,
        /\btell\s+me\s+about\s+(.+?)(?:[?.!]|$)/i,
        /\bexplain\s+(.+?)(?:[?.!]|$)/i,
        /\babout\s+(.+?)(?:[?.!]|$)/i
    ];

    for (const pattern of patterns) {
        const match = value.match(pattern);
        const subject = cleanSubjectCandidate(match?.[1]);
        if (subject) return subject;
    }

    const capitalized = value.match(/\b[A-Z][a-zA-Z0-9'-]{2,}(?:\s+[A-Z][a-zA-Z0-9'-]{2,}){0,3}\b/g);
    if (capitalized?.length) {
        return capitalized[capitalized.length - 1];
    }

    return '';
}

function getLastReferencedSubject(msg) {
    return contextResolver.getLastReferencedSubject(getRecentMemory(msg));
}

function normalizeImageSearchQuery(query) {
    return contextResolver.normalizeImageSearchQuery(query);
}

function resolveImagePronouns(prompt, subject) {
    return contextResolver.resolvePronouns(prompt, subject);
}

function buildImagePrompt(msg, prompt) {
    const cleaned = cleanImagePrompt(prompt);
    const context = buildContextText(msg);

    if (cleaned && !PRONOUN_REFERENCE_PATTERN.test(cleaned)) {
        return normalizeImageSearchQuery(cleaned);
    }

    const referencedSubject = getLastReferencedSubject(msg);
    if (referencedSubject) {
        return normalizeImageSearchQuery(resolveImagePronouns(cleaned || prompt, referencedSubject));
    }

    if (!context) {
        return cleaned || prompt || 'anime wallpaper';
    }

    return [
        cleaned || prompt || 'Find images based on the recent conversation.',
        '',
        'Recent conversation context:',
        context
    ].join('\n').slice(0, 1800);
}

async function runIntelligent(sock, msg, request) {
    const imageMessage = findImageMessage(msg);
    const imageData = await imageMessageToBuffer(imageMessage);
    const sessionId = getConversationId(msg);

    await sendPresence(sock, msg, request.type === 'image' ? 'uploading' : 'composing');

    if (request.type === 'memory') {
        const conversationId = getConversationId(msg);
        const memory = getRecentMemory(msg);

        if (['clear', 'reset', 'delete'].includes(request.action)) {
            state.resetAstaConversation(conversationId);
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'AI memory for this chat/user has been cleared.'
            }, { quoted: msg });
            return;
        }

        if (['export', 'json'].includes(request.action)) {
            await sock.sendMessage(msg.key.remoteJid, {
                document: Buffer.from(JSON.stringify(memory, null, 2)),
                fileName: `asta-memory-${Date.now()}.json`,
                mimetype: 'application/json',
                caption: `AI memory export (${memory.length} messages)`
            }, { quoted: msg });
            return;
        }

        const lines = memory.slice(-10).map((item, index) => {
            const role = item.role === 'bot' ? 'Asta' : 'You';
            return `${index + 1}. ${role}: ${String(item.text || '').slice(0, 250)}`;
        });

        await sock.sendMessage(msg.key.remoteJid, {
            text: lines.length
                ? `*AI Memory (${memory.length})*\n${lines.join('\n\n')}\n\nUse .ai memory clear or .ai memory export.`
                : 'AI memory is empty here.'
        }, { quoted: msg });
        return;
    }

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
        const images = await searchImages(imagePrompt, request.count || 1);

        for (let i = 0; i < images.length; i += 1) {
            await sock.sendMessage(msg.key.remoteJid, {
                image: { url: images[i] },
                caption: `*Image${images.length > 1 ? ` ${i + 1}/${images.length}` : ''}*\n${imagePrompt.slice(0, 500)}${i === images.length - 1 ? '\n\n_Reply to continue._\n[REPLY_ID:intelligent]' : ''}`
            }, { quoted: i === 0 ? msg : undefined });
        }

        remember(msg, request.prompt || 'send an image', `[ images] ${imagePrompt} (${images.length})`);
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

    if (request.type === 'capabilities') {
        const text = answerCapabilities();
        remember(msg, request.prompt, text);
        await sendText(sock, msg, 'AI', text);
        return;
    }



    const prompt = buildPromptWithMemory(msg, request.prompt);
    const text = await askOmegaChat(prompt, sessionId, request.prompt);
    remember(msg, request.prompt, text);
    await sendText(sock, msg, 'AI', text);
    await sendPresence(sock, msg, 'paused');
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
        : friendlyApiError(error, 'AI API');

    await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
}

module.exports = {
    config: {
        name: 'intelligent',
        aliases: ['ai', 'asta', 'brain', 'genius'],
        version: '1.2.0',
        description: 'Smart AI command using Omegatech chat, vision, and  images',
        usage: 'ai <message|draw|vision>',
        examples: [
            'ai what is today date',
            'ai explain photosynthesis simply',
            'ai vision https://i.pinimg.com/236x/f5/6a/87/f56a87d1d56b3e44233eae545a5f8651.jpg what is here?',
            'ai send 2 images of akaza',
            'ai memory',
            'ai memory clear'
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
                    '.ai vision <imageUrl> what is here?',
                    '.ai send 2 images of akaza',
                    '.ai memory'
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
