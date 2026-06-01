const fs = require('fs');
const path = require('path');

const DEFAULT_MODEL = 'qwen/qwen3.6-flash';
const PUTER_API_ORIGIN = process.env.PUTER_API_ORIGIN || 'https://api.puter.com';
const TOKEN_FILE = path.join(__dirname, '../../data/puter-token.txt');
const MODEL_ALIASES = {
    flash: 'qwen/qwen3.6-flash',
    fast: 'qwen/qwen3.6-flash',
    plus: 'qwen/qwen3.6-plus',
    max: 'qwen/qwen3.6-max-preview',
    code: 'qwen/qwen3.6-max-preview',
    preview: 'qwen/qwen3.6-max-preview',
    reasoning: 'qwen/qwen3.7-max',
    reason: 'qwen/qwen3.7-max',
    max37: 'qwen/qwen3.7-max',
    '3.7': 'qwen/qwen3.7-max'
};

function getAuthToken() {
    const envToken = process.env.PUTER_AUTH_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InYyIn0.eyJ0IjoiZ3VpIiwidiI6IjIiLCJ1IjoiRXNvRFdpTmZSakNaako2Y1MzOExHQT09Iiwic3UiOiJFc29EV2lOZlJqQ1pqSjZjUzM4TEdBPT0iLCJ1dSI6InJTNUZEdG1vVE5haHhTcGpJLzMyQmc9PSIsImFpIjoiclM1RkR0bW9UTmFoeFNwakkvMzJCZz09IiwiaWF0IjoxNzgwMzQ5NzY4fQ.71B5QFI7UUoxm3TFKiKeyMb_k7fqTXFwq2mQP6xFA2Y';
    if (envToken) return envToken.trim();

    if (fs.existsSync(TOKEN_FILE)) {
        return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    }

    return '';
}

function requireAuthToken() {
    const token = getAuthToken();
    if (!token) {
        throw new Error('PUTER_AUTH_TOKEN is not set');
    }

    return token;
}

function responseToText(response) {
    if (!response) return '';
    if (typeof response === 'string') return response;

    const content = response.message?.content
        || response.choices?.[0]?.message?.content
        || response.choices?.[0]?.text
        || response.text
        || response.response
        || response.answer;

    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map((item) => {
                if (typeof item === 'string') return item;
                return item.text || item.content || '';
            })
            .filter(Boolean)
            .join('\n');
    }

    return String(response);
}

function parseArgs(args) {
    const first = (args[0] || '').toLowerCase();
    if (first === 'image' || first === 'vision' || first === 'analyze') {
        const imageUrl = args[1] || '';
        const maybeModel = (args[2] || '').toLowerCase();
        const hasModel = Boolean(MODEL_ALIASES[maybeModel]);

        return {
            mode: 'vision',
            model: hasModel ? MODEL_ALIASES[maybeModel] : 'qwen/qwen3.6-plus',
            imageUrl,
            prompt: args.slice(hasModel ? 3 : 2).join(' ').trim() || 'What do you see in this image?'
        };
    }

    if (MODEL_ALIASES[first]) {
        return {
            mode: 'chat',
            model: MODEL_ALIASES[first],
            prompt: args.slice(1).join(' ').trim()
        };
    }

    return {
        mode: 'chat',
        model: DEFAULT_MODEL,
        prompt: args.join(' ').trim()
    };
}

function getErrorMessage(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.cause?.message) return error.cause.message;

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function isNetworkTimeout(error, message) {
    return error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'
        || error?.name === 'TimeoutError'
        || error?.name === 'AbortError'
        || /timeout|fetch failed|connect/i.test(message);
}

async function callPuterDriver(driverInterface, driver, method, args, timeoutMs = 30000) {
    const authToken = requireAuthToken();
    const response = await fetch(`${PUTER_API_ORIGIN}/drivers/call`, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;actually=json'
        },
        body: JSON.stringify({
            interface: driverInterface,
            driver,
            method,
            args,
            auth_token: authToken
        }),
        signal: AbortSignal.timeout(timeoutMs)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || `Puter API returned ${response.status}`);
    }

    if (data.success === false) {
        throw new Error(data.error?.message || data.error?.code || 'Puter API returned an error');
    }

    return data.result !== undefined ? data.result : data;
}

async function askQwen(prompt, model, imageUrl) {
    const message = imageUrl
        ? {
            content: [
                prompt,
                { image_url: { url: imageUrl } }
            ]
        }
        : { content: prompt };

    return callPuterDriver(
        'puter-chat-completion',
        'ai-chat',
        'complete',
        {
            messages: [message],
            model,
            ...(imageUrl ? { vision: true } : {})
        }
    );
}

module.exports = {
    config: {
        name: 'qwen',
        aliases: ['puter', 'aiq'],
        version: '1.0.0',
        description: 'Test Qwen models through Puter.js',
        usage: 'qwen [flash|plus|max|reasoning] <message>',
        examples: [
            'qwen tell me a fun fact',
            'qwen max write a sum function in JS',
            'qwen reasoning explain quantum computing',
            'qwen image https://assets.puter.site/doge.jpeg what do you see?'
        ],
        permissions: 0,
        cooldown: 8,
        category: 'ai'
    },
    onRun: async (sock, msg, args) => {
        const { mode, model, prompt, imageUrl } = parseArgs(args);

        if (!prompt || (mode === 'vision' && !imageUrl)) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: [
                    'Send a prompt.',
                    'Examples:',
                    '.qwen flash summarize CDN benefits',
                    '.qwen max write a JS sum function',
                    '.qwen reasoning explain quantum computing',
                    '.qwen image https://assets.puter.site/doge.jpeg what do you see?'
                ].join('\n')
            }, { quoted: msg });
            return;
        }

        try {
            const response = await askQwen(prompt, model, imageUrl);
            const answer = responseToText(response).trim() || 'No response returned.';

            await sock.sendMessage(msg.key.remoteJid, {
                text: `*Qwen (${model})*\n${answer.slice(0, 3500)}`
            }, { quoted: msg });
        } catch (error) {
            console.error('Qwen command error:', error);

            const errorMessage = getErrorMessage(error);
            const missingToken = errorMessage.includes('PUTER_AUTH_TOKEN');
            const text = missingToken
                ? 'Puter.js needs a one-time login for Node.\nRun: npm run puter:login\nThen restart the bot and try .qwen again.'
                : isNetworkTimeout(error, errorMessage)
                    ? 'Qwen could not connect to Puter before the network timed out. Please try again in a moment.'
                    : `Qwen test failed: ${errorMessage}`;

            await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
        }
    },
    askQwen,
    responseToText,
    getErrorMessage,
    isNetworkTimeout
};
