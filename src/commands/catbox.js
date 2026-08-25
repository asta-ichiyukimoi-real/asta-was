const {
    downloadMediaMessage
} = require('@whiskeysockets/baileys');

const API_URL =
    'https://omegatech-api.dixonomega.tech/api/tools/shz-uploader?action=upload&expire=90d';

const UPLOAD_TIMEOUT_MS = 120000;

function unwrapMessage(message) {
    let current = message || {};

    for (let i = 0; i < 10; i++) {
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

function getMessageContent(msg) {
    return unwrapMessage(msg?.message);
}

function getContextInfo(msg) {
    const message = getMessageContent(msg);

    return (
        message.extendedTextMessage?.contextInfo ||
        message.imageMessage?.contextInfo ||
        message.videoMessage?.contextInfo ||
        message.documentMessage?.contextInfo ||
        message.audioMessage?.contextInfo ||
        message.stickerMessage?.contextInfo ||
        null
    );
}

function getQuotedMessage(msg) {
    const context = getContextInfo(msg);

    if (!context?.quotedMessage) {
        return null;
    }

    return {
        key: {
            remoteJid: msg.key.remoteJid,
            id: context.stanzaId,
            participant: context.participant,
            fromMe: false
        },
        message: context.quotedMessage
    };
}

function getMediaInfo(message) {
    const content = unwrapMessage(
        message?.message || message
    );

    if (!content) return null;

    if (content.imageMessage) {
        const media = content.imageMessage;

        return {
            type: 'image',
            message: media,
            mimetype: media.mimetype || 'image/jpeg',
            extension: 'jpg',
            filename: `image-${Date.now()}.jpg`
        };
    }

    if (content.videoMessage) {
        const media = content.videoMessage;

        return {
            type: 'video',
            message: media,
            mimetype: media.mimetype || 'video/mp4',
            extension: 'mp4',
            filename: `video-${Date.now()}.mp4`
        };
    }

    if (content.audioMessage) {
        const media = content.audioMessage;

        return {
            type: 'audio',
            message: media,
            mimetype: media.mimetype || 'audio/mpeg',
            extension: 'mp3',
            filename: `audio-${Date.now()}.mp3`
        };
    }

    if (content.documentMessage) {
        const media = content.documentMessage;
        const filename =
            media.fileName ||
            `document-${Date.now()}`;

        const extension =
            filename.includes('.')
                ? filename.split('.').pop()
                : 'bin';

        return {
            type: 'document',
            message: media,
            mimetype:
                media.mimetype ||
                'application/octet-stream',
            extension,
            filename
        };
    }

    if (content.stickerMessage) {
        const media = content.stickerMessage;

        return {
            type: 'sticker',
            message: media,
            mimetype: media.mimetype || 'image/webp',
            extension: 'webp',
            filename: `sticker-${Date.now()}.webp`
        };
    }

    return null;
}

async function downloadQuotedMedia(sock, quoted) {
    const media = getMediaInfo(quoted);

    if (!media) {
        throw new Error(
            'No supported media was found in the quoted message.'
        );
    }

    const messageToDownload = {
        key: quoted.key,
        message: quoted.message
    };

    const buffer = await downloadMediaMessage(
        messageToDownload,
        'buffer',
        {},
        {
            logger: console,
            reuploadRequest: sock.updateMediaMessage
        }
    );

    if (!buffer) {
        throw new Error(
            'WhatsApp returned no media data.'
        );
    }

    if (!Buffer.isBuffer(buffer)) {
        throw new Error(
            'Downloaded media is not a Buffer.'
        );
    }

    if (!buffer.length) {
        throw new Error(
            'Downloaded media is empty.'
        );
    }

    return {
        buffer,
        ...media
    };
}

async function uploadToShz(
    buffer,
    filename,
    mimetype
) {
    const form = new FormData();

    const blob = new Blob(
        [buffer],
        {
            type: mimetype
        }
    );

    form.append(
        'file',
        blob,
        filename
    );

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        UPLOAD_TIMEOUT_MS
    );

    try {
        const response = await fetch(
            API_URL,
            {
                method: 'POST',
                body: form,
                headers: {
                    Accept: 'application/json'
                },
                signal: controller.signal
            }
        );

        const raw = await response.text();

        console.log(
            'SHZ status:',
            response.status
        );

        console.log(
            'SHZ response:',
            raw.slice(0, 2000)
        );

        if (!response.ok) {
            throw new Error(
                `SHZ API returned HTTP ${response.status}`
            );
        }

        if (!raw.trim()) {
            throw new Error(
                'SHZ API returned an empty response.'
            );
        }

        let data;

        try {
            data = JSON.parse(raw);
        } catch {
            throw new Error(
                'SHZ API returned invalid JSON.'
            );
        }

        if (!data?.success) {
            throw new Error(
                data?.error ||
                data?.message ||
                'SHZ upload failed.'
            );
        }

        const files =
            data?.data?.files;

        if (
            !Array.isArray(files) ||
            !files.length
        ) {
            throw new Error(
                'SHZ did not return an uploaded file.'
            );
        }

        const uploaded = files.find(
            file =>
                file?.status &&
                (
                    file?.normalUrl ||
                    file?.rawUrl
                )
        );

        if (!uploaded) {
            throw new Error(
                'SHZ upload was unsuccessful.'
            );
        }

        return uploaded;

    } catch (error) {
        if (
            error.name === 'AbortError'
        ) {
            throw new Error(
                'SHZ upload timed out.'
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

async function sendUrl(
    sock,
    msg,
    uploaded
) {
    const url =
        uploaded.normalUrl ||
        uploaded.rawUrl;

    const lines = [
        '✅ *Upload successful!*',
        '',
        `🔗 ${url}`
    ];

    if (uploaded.rawUrl &&
        uploaded.rawUrl !== url) {
        lines.push(
            '',
            `🔗 Raw: ${uploaded.rawUrl}`
        );
    }

    if (uploaded.expire) {
        lines.push(
            '',
            `⏳ Expires: ${uploaded.expire}`
        );
    }

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text: lines.join('\n')
        },
        {
            quoted: msg
        }
    );
}

module.exports = {
    config: {
        name: 'tourl',

        aliases: [
            'to-url',
            'url',
            'imgurl',
            'imageurl'
        ],

        version: '1.2.0',

        description:
            'Upload replied media to SHZ and return its URL',

        usage:
            'tourl',

        examples: [
            'Reply to an image with .tourl',
            'Reply to a video with .tourl',
            'Reply to a document with .tourl'
        ],

        permissions: 0,

        cooldown: 10,

        category: 'tools'
    },

    onRun: async (sock, msg) => {
        const jid = msg.key.remoteJid;

        try {
            const quoted =
                getQuotedMessage(msg);

            if (!quoted) {
                await sock.sendMessage(
                    jid,
                    {
                        text: [
                            '🖼️ *To URL*',
                            '',
                            'Reply to an image, video, sticker or document with:',
                            '',
                            '`.tourl`'
                        ].join('\n')
                    },
                    {
                        quoted: msg
                    }
                );

                return;
            }

            const media =
                getMediaInfo(quoted);

            if (!media) {
                await sock.sendMessage(
                    jid,
                    {
                        text:
                            '❌ The message you replied to does not contain supported media.'
                    },
                    {
                        quoted: msg
                    }
                );

                return;
            }

            await sock.sendMessage(
                jid,
                {
                    text:
                        `⏳ Uploading ${media.type}...`
                },
                {
                    quoted: msg
                }
            );

            const downloaded =
                await downloadQuotedMedia(
                    sock,
                    quoted
                );

            const uploaded =
                await uploadToShz(
                    downloaded.buffer,
                    downloaded.filename,
                    downloaded.mimetype
                );

            await sendUrl(
                sock,
                msg,
                uploaded
            );

        } catch (error) {
            console.error(
                'ToURL command error:',
                error
            );

            await sock.sendMessage(
                jid,
                {
                    text: [
                        '❌ *Upload failed*',
                        '',
                        error.message ||
                            'Something went wrong while uploading the media.'
                    ].join('\n')
                },
                {
                    quoted: msg
                }
            );
        }
    }
};