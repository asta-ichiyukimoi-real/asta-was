const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { askAsta, buildConversationId } = require('./asta');
const { askQwen, responseToText, getErrorMessage, isNetworkTimeout } = require('./qwen');
const { generateImage } = require('./qwenimage');
const state = require('../utils/stateManager');

const MODELS = {
    flash: 'qwen/qwen3.6-flash',
    fast: 'qwen/qwen3.6-flash',
    plus: 'qwen/qwen3.6-plus',
    max: 'qwen/qwen3.6-max-preview',
    code: 'qwen/qwen3.6-max-preview',
    reasoning: 'qwen/qwen3.7-max',
    reason: 'qwen/qwen3.7-max'
};
const WIKI_TRIGGERS = /^(wiki|wikipedia|who is|who was|where is|when was|tell me about)\b/i;
const LOCAL_TIME_ZONE = process.env.BOT_TIMEZONE || 'Africa/Lagos';
const SEARCH_TRIGGERS = /^(search|web|google|look up|lookup|latest|current|news)\b/i;

function getImageContent(image) {
    if (image.url) return { url: image.url };
    if (image.mime) return { buffer: image.buffer, mimetype: image.mime };
    return image.buffer;
}

function isImageUrl(value) {
    return /^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(value || '');
}

function getConversationId(msg) {
    return buildConversationId(msg);
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

function stripWikiIntent(text) {
    return String(text || '')
        .replace(/^(wiki|wikipedia)\s+/i, '')
        .replace(/^(who is|who was|what is|what are|where is|when was|tell me about)\s+/i, '')
        .trim();
}

function looksLikeWikiRequest(text) {
    const value = text || '';
    if (/\b(it|that|this|there|you|your|what you said|what you saw|the image|the picture|the photo)\b/i.test(value)) {
        return false;
    }

    return WIKI_TRIGGERS.test(value);
}

function looksLikeDateTimeRequest(text) {
    return /\b(today'?s date|date today|what date|current date|what day|day today|current time|time now|what time)\b/i.test(text || '');
}

function stripSearchIntent(text) {
    return String(text || '')
        .replace(/^(search|web|google|look up|lookup|latest|current|news)\s+/i, '')
        .trim();
}

function looksLikeSearchRequest(text) {
    const value = text || '';
    if (looksLikeDateTimeRequest(value)) return false;
    return SEARCH_TRIGGERS.test(value)
        || /\b(latest|current|recent|news|today|this week|this month|now)\b/i.test(value);
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

async function imageMessageToDataUrl(imageMessage) {
    if (!imageMessage) return null;

    const stream = await downloadContentFromMessage(imageMessage, 'image');
    const buffer = await streamToBuffer(stream);
    const mime = imageMessage.mimetype || 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
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

    if (looksLikeDateTimeRequest(fullText)) {
        return {
            type: 'datetime',
            prompt: fullText
        };
    }

    if (looksLikeSearchRequest(fullText)) {
        return {
            type: 'search',
            prompt: fullText,
            query: stripSearchIntent(fullText) || fullText
        };
    }

    if (looksLikeWikiRequest(fullText)) {
        return {
            type: 'wiki',
            prompt: fullText,
            query: stripWikiIntent(fullText) || fullText
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

    if (MODELS[first]) {
        return {
            type: 'qwen',
            model: MODELS[first],
            prompt: args.slice(1).join(' ').trim()
        };
    }

    if (first === 'asta' || first === 'chat') {
        return {
            type: 'asta',
            prompt: args.slice(1).join(' ').trim()
        };
    }

    return {
        type: 'asta',
        prompt: args.join(' ').trim()
    };
}

async function sendText(sock, msg, title, text) {
    await sock.sendMessage(msg.key.remoteJid, {
        text: `*${title}*\n${text.slice(0, 3500)}\n\n_Reply to continue. Send or reply to an image and I will use vision._\n[REPLY_ID:intelligent]`
    }, { quoted: msg });
}

async function buildSmartImagePrompt(msg, prompt) {
    const context = buildContextText(msg);
    const cleaned = stripImageIntent(prompt);

    if (cleaned && !/\b(it|that|this|them|those|the image|the picture|the photo|what you saw)\b/i.test(cleaned)) {
        return cleaned;
    }

    if (!context) {
        return cleaned || prompt || 'a detailed creative image';
    }

    const response = await askQwen([
        'Turn the user request into a detailed image-generation prompt.',
        'Use the recent conversation context to resolve words like "it", "that", or "the image".',
        'Return only the final image prompt, no explanation.',
        '',
        'Recent context:',
        context,
        '',
        `User request: ${prompt || 'send an image'}`
    ].join('\n'), 'qwen/qwen3.6-flash');

    return responseToText(response).trim() || cleaned || prompt;
}

async function fetchWikipediaContext(query) {
    const searchUrl = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=1`;
    const searchResponse = await fetch(searchUrl, {
        headers: { 'User-Agent': 'AstaBot/1.0 (WhatsApp bot)' },
        signal: AbortSignal.timeout(12000)
    });

    if (!searchResponse.ok) {
        throw new Error(`Wikipedia search returned ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const page = searchData.pages?.[0];
    if (!page?.key) return null;

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`;
    const summaryResponse = await fetch(summaryUrl, {
        headers: { 'User-Agent': 'AstaBot/1.0 (WhatsApp bot)' },
        signal: AbortSignal.timeout(12000)
    });

    if (!summaryResponse.ok) {
        throw new Error(`Wikipedia summary returned ${summaryResponse.status}`);
    }

    const summary = await summaryResponse.json();
    return {
        title: summary.title || page.title,
        extract: summary.extract || page.excerpt || '',
        url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}`
    };
}

function flattenDuckDuckGoTopics(items = [], output = []) {
    for (const item of items) {
        if (item.Topics) {
            flattenDuckDuckGoTopics(item.Topics, output);
            continue;
        }

        if (item.Text || item.FirstURL) {
            output.push({
                title: item.Text ? item.Text.split(' - ')[0] : item.FirstURL,
                snippet: item.Text || '',
                url: item.FirstURL || ''
            });
        }
    }

    return output;
}

async function fetchSearchContext(query) {
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'AstaBot/1.0 (WhatsApp bot)' },
        signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
        throw new Error(`Search returned ${response.status}`);
    }

    const data = await response.json();
    const results = [];

    if (data.AbstractText || data.AbstractURL) {
        results.push({
            title: data.Heading || query,
            snippet: data.AbstractText || '',
            url: data.AbstractURL || ''
        });
    }

    flattenDuckDuckGoTopics(data.RelatedTopics || [], results);

    return results
        .filter(item => item.snippet || item.url)
        .slice(0, 5);
}

async function answerWithSearch(msg, request) {
    const results = await fetchSearchContext(request.query);

    if (!results.length) {
        const response = await askQwen([
            'The user asked for current/web information, but no search result was returned.',
            'Answer briefly and say that live search did not return a usable source.',
            '',
            `User question: ${request.prompt}`
        ].join('\n'), 'qwen/qwen3.6-flash');
        return responseToText(response).trim() || 'I could not find a usable web result for that.';
    }

    const sourceText = results.map((item, index) => [
        `${index + 1}. ${item.title || 'Untitled'}`,
        item.snippet,
        item.url
    ].filter(Boolean).join('\n')).join('\n\n');

    const response = await askQwen([
        'Answer the user using only the web search snippets below.',
        'If the snippets do not fully answer the question, say what is missing.',
        'Keep the answer concise for WhatsApp.',
        '',
        `User question: ${request.prompt}`,
        '',
        'Search snippets:',
        sourceText
    ].join('\n'), 'qwen/qwen3.6-flash');

    const answer = responseToText(response).trim() || results[0].snippet;
    const sources = results
        .filter(item => item.url)
        .slice(0, 3)
        .map((item, index) => `${index + 1}. ${item.url}`)
        .join('\n');

    return `${answer}${sources ? `\n\nSources:\n${sources}` : ''}`;
}

async function answerWithWikipedia(msg, request) {
    const wiki = await fetchWikipediaContext(request.query);
    if (!wiki) {
        const response = await askQwen(request.prompt, 'qwen/qwen3.6-flash');
        return responseToText(response).trim() || 'No response returned.';
    }

    const context = buildContextText(msg);
    const response = await askQwen([
        'Answer the user using the Wikipedia context below. If the context is not enough, say so briefly.',
        'Keep the answer natural and concise for WhatsApp.',
        '',
        `Wikipedia title: ${wiki.title}`,
        `Wikipedia summary: ${wiki.extract}`,
        `Wikipedia link: ${wiki.url}`,
        context ? `\nRecent conversation:\n${context}` : '',
        '',
        `User question: ${request.prompt}`
    ].join('\n'), 'qwen/qwen3.6-flash');

    const answer = responseToText(response).trim() || wiki.extract || 'No response returned.';
    return `${answer}\n\nSource: ${wiki.url}`;
}

async function runIntelligent(sock, msg, request) {
    const imageMessage = findImageMessage(msg);
    const imageDataUrl = await imageMessageToDataUrl(imageMessage);

    if (imageDataUrl && request.type !== 'image') {
        const prompt = request.prompt || 'What do you see in this image?';
        const response = await askQwen(prompt, 'qwen/qwen3.6-plus', imageDataUrl);
        const text = responseToText(response).trim() || 'No response returned.';
        remember(msg, `[Image question] ${prompt}`, `[Vision] ${text}`);
        await sendText(sock, msg, 'AI Vision', text);
        return;
    }

    if (request.type === 'image') {
        const imagePrompt = await buildSmartImagePrompt(msg, request.prompt);
        const image = await generateImage(imagePrompt);
        await sock.sendMessage(msg.key.remoteJid, {
            image: getImageContent(image),
            caption: `*AI Image*\n${imagePrompt.slice(0, 500)}\n\n_Reply to continue._\n[REPLY_ID:intelligent]`
        }, { quoted: msg });
        remember(msg, request.prompt || 'send an image', `[Generated image] ${imagePrompt}`);
        return;
    }

    if (request.type === 'vision') {
        const response = await askQwen(request.prompt, 'qwen/qwen3.6-plus', request.imageUrl);
        const text = responseToText(response).trim() || 'No response returned.';
        remember(msg, `[Image URL question] ${request.prompt}`, `[Vision] ${text}`);
        await sendText(sock, msg, 'AI Vision', text);
        return;
    }

    if (request.type === 'qwen') {
        const response = await askQwen(request.prompt, request.model);
        const text = responseToText(response).trim() || 'No response returned.';
        remember(msg, request.prompt, text);
        await sendText(sock, msg, `Qwen (${request.model})`, text);
        return;
    }

    if (request.type === 'datetime') {
        const text = answerDateTime(request.prompt);
        remember(msg, request.prompt, text);
        await sendText(sock, msg, 'AI', text);
        return;
    }

    if (request.type === 'search') {
        const text = await answerWithSearch(msg, request);
        remember(msg, request.prompt, `[Search] ${text}`);
        await sendText(sock, msg, 'AI + Search', text);
        return;
    }

    if (request.type === 'wiki') {
        const text = await answerWithWikipedia(msg, request);
        remember(msg, request.prompt, `[Wikipedia] ${text}`);
        await sendText(sock, msg, 'AI + Wikipedia', text);
        return;
    }

    const conversationId = getConversationId(msg);
    const text = await askAsta(request.prompt, conversationId);
    remember(msg, request.prompt, text);

    await sendText(sock, msg, 'Asta AI', text);
}

async function sendIntelligentError(sock, msg, error) {
    const errorMessage = getErrorMessage(error);
    if (isNetworkTimeout(error, errorMessage)) {
        console.warn(`Intelligent command timeout: ${errorMessage}`);
    } else {
        console.error('Intelligent command error:', error);
    }

    const missingToken = errorMessage.includes('PUTER_AUTH_TOKEN');
    const text = missingToken
        ? 'AI needs a one-time Puter login.\nRun: npm run puter:login\nThen restart the bot and try again.'
        : isNetworkTimeout(error, errorMessage)
            ? 'AI could not connect before the network timed out. Please try again in a moment.'
            : `AI failed: ${errorMessage}`;

    await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
}

module.exports = {
    config: {
        name: 'intelligent',
        aliases: ['asta', 'brain', 'genius'],
        version: '1.0.0',
        description: 'Smart AI command that combines Asta, Qwen chat, vision, and image generation',
        usage: 'ai <message|flash|plus|max|reasoning|draw|vision>',
        examples: [
            'ai explain photosynthesis simply',
            'ai max write a JavaScript sum function',
            'ai reasoning solve this logic puzzle',
            'ai vision https://assets.puter.site/doge.jpeg what do you see?',
            'ai draw a retro Mars travel poster'
        ],
        permissions: 0,
        cooldown: 8,
        category: 'ai'
    },
    onRun: async (sock, msg, args) => {
        const request = parseRequest(args);

        if ((!request.prompt && request.type !== 'image') || (request.type === 'vision' && !request.imageUrl)) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: [
                    'Ask me something or choose a mode:',
                    '.ai explain photosynthesis simply',
                    '.ai max write a JavaScript sum function',
                    '.ai reasoning solve this logic puzzle',
                    '.ai search latest AI news',
                    '.ai vision https://assets.puter.site/doge.jpeg what do you see?',
                    '.ai draw a retro Mars travel poster'
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
