const vm = require('vm');
const util = require('util');
const config = require('../../config');
const logger = require('../utils/logger');

function getDevConfig() {
    const handler = global.configCommandHandler;

    return {
        enabled: handler?.get?.('developer.evalEnabled', config.developer?.evalEnabled) ?? false,
        timeoutMs: handler?.get?.('developer.evalTimeoutMs', config.developer?.evalTimeoutMs) || 5000,
        maxOutput: handler?.get?.('developer.evalMaxOutput', config.developer?.evalMaxOutput) || 3500
    };
}

function formatValue(value, maxOutput) {
    const output = typeof value === 'string'
        ? value
        : util.inspect(value, {
            depth: 4,
            breakLength: 120
        });

    return output.length > maxOutput
        ? `${output.slice(0, maxOutput)}\n...output trimmed`
        : output;
}

function unwrapMessage(message) {
    let current = message || {};

    for (let i = 0; i < 10; i += 1) {
        const next =
            current.ephemeralMessage?.message ||
            current.viewOnceMessage?.message ||
            current.viewOnceMessageV2?.message ||
            current.viewOnceMessageV2Extension?.message ||
            current.documentWithCaptionMessage?.message;

        if (!next) break;

        current = next;
    }

    return current;
}

function getContextInfo(message) {
    const current = unwrapMessage(message);

    return (
        current.extendedTextMessage?.contextInfo ||
        current.imageMessage?.contextInfo ||
        current.videoMessage?.contextInfo ||
        current.audioMessage?.contextInfo ||
        current.documentMessage?.contextInfo ||
        current.stickerMessage?.contextInfo ||
        current.buttonsResponseMessage?.contextInfo ||
        current.listResponseMessage?.contextInfo ||
        current.templateButtonReplyMessage?.contextInfo ||
        current.interactiveResponseMessage?.contextInfo ||
        null
    );
}

function getQuotedMessage(msg) {
    const context = getContextInfo(msg);

    if (!context?.quotedMessage) {
        return null;
    }

    return unwrapMessage(context.quotedMessage);
}

function getMessageText(message) {
    const current = unwrapMessage(message);

    return (
        current.conversation ||
        current.extendedTextMessage?.text ||
        current.imageMessage?.caption ||
        current.videoMessage?.caption ||
        current.audioMessage?.caption ||
        current.documentMessage?.caption ||
        ''
    );
}

function getMessageType(message) {
    const current = unwrapMessage(message);

    if (current.imageMessage) return 'image';
    if (current.videoMessage) return 'video';
    if (current.audioMessage) return 'audio';
    if (current.documentMessage) return 'document';
    if (current.stickerMessage) return 'sticker';

    if (
        current.conversation ||
        current.extendedTextMessage
    ) {
        return 'text';
    }

    if (
        current.contactMessage ||
        current.contactsArrayMessage
    ) {
        return 'contact';
    }

    if (
        current.locationMessage ||
        current.liveLocationMessage
    ) {
        return 'location';
    }

    if (
        current.pollCreationMessage ||
        current.pollCreationMessageV3
    ) {
        return 'poll';
    }

    return 'unknown';
}

function getMediaMessage(message) {
    const current = unwrapMessage(message);

    return (
        current.imageMessage ||
        current.videoMessage ||
        current.audioMessage ||
        current.documentMessage ||
        current.stickerMessage ||
        null
    );
}

async function downloadQuotedMedia(sock, msg) {
    const quoted = getQuotedMessage(msg);

    if (!quoted) {
        throw new Error('No quoted message found.');
    }

    const type = getMessageType(quoted);

    if (!['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
        throw new Error('The quoted message does not contain downloadable media.');
    }

    const mediaMessage = getMediaMessage(quoted);

    if (!mediaMessage) {
        throw new Error('No media found in the quoted message.');
    }

    try {
        const {
            downloadContentFromMessage
        } = require('@whiskeysockets/baileys');

        const stream = await downloadContentFromMessage(
            mediaMessage,
            type
        );

        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
    } catch (error) {
        throw new Error(
            `Media download failed: ${error.message || error}`
        );
    }
}

function createMediaHelpers(sock, msg) {
    const quoted = getQuotedMessage(msg);
    const type = getMessageType(quoted);

    return {
        quoted,

        message: unwrapMessage(quoted),

        media: getMediaMessage(quoted),

        text: getMessageText(quoted),

        type,

        isText: type === 'text',
        isImage: type === 'image',
        isVideo: type === 'video',
        isAudio: type === 'audio',
        isDocument: type === 'document',
        isSticker: type === 'sticker',

        hasMedia: Boolean(getMediaMessage(quoted)),

        hasQuotedMessage: Boolean(quoted),

        download: () => downloadQuotedMedia(sock, msg)
    };
}

module.exports = {
    config: {
        name: 'eval',
        aliases: ['js'],
        version: '2.2.0',
        description: 'Evaluate JavaScript inside a limited VM context',
        usage: 'eval <javascript>',
        examples: [
            'eval Object.keys(commands).length',
            'eval sock.sendMessage(msg.key.remoteJid, { text: "hello" })',
            'eval media.type',
            'eval media.text',
            'eval await media.download()'
        ],
        permissions: 2,
        cooldown: 0,
        category: 'developer'
    },

    onRun: async (sock, msg, args) => {
        const code = args.join(' ').trim();
        const devConfig = getDevConfig();

        if (!devConfig.enabled) {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: [
                        'Eval command is disabled.',
                        'Enable it with:',
                        '.config set developer.evalEnabled true'
                    ].join('\n')
                },
                { quoted: msg }
            );
            return;
        }

        if (!code) {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: 'Use: .eval <javascript>'
                },
                { quoted: msg }
            );
            return;
        }

        logger.log('eval_command', {
            userId: msg.key.participant || msg.key.remoteJid,
            chatId: msg.key.remoteJid,
            code: code.slice(0, 500)
        });

        try {
            const media = createMediaHelpers(sock, msg);

            const context = {
                sock,
                msg,
                config,

                commands: global.commandHandler?.commands,
                chatCommands: global.chatCommandHandler?.chatCommands,
                replyCommands: global.replyCommandHandler?.replyCommands,

                media,

                uptime: process.uptime(),
                memory: process.memoryUsage(),

                Math,
                Date,
                JSON,
                Object,
                Array,
                String,
                Number,
                Boolean,
                RegExp,
                Map,
                Set,
                WeakMap,
                WeakSet,

                Promise,
                Buffer,

                setTimeout,
                clearTimeout,
                setInterval,
                clearInterval,

                parseInt,
                parseFloat,
                isNaN,
                isFinite,

                encodeURI,
                decodeURI,
                encodeURIComponent,
                decodeURIComponent
            };

            const wrappedCode = `
                (async () => {
                    return (${code});
                })()
            `;

            const result = vm.runInNewContext(
                wrappedCode,
                context,
                {
                    timeout: devConfig.timeoutMs
                }
            );

            const resolved = await result;

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: `*Eval Result*\n${formatValue(
                        resolved,
                        devConfig.maxOutput
                    )}`
                },
                { quoted: msg }
            );
        } catch (error) {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: `Eval failed: ${error.message || error}`
                },
                { quoted: msg }
            );
        }
    }
};