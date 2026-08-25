const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const API_URL =
    'https://omegatech-api.dixonomega.tech/api/tools/Top4top-uploader';

const UPLOAD_TIMEOUT_MS = 120000;

function unwrapMessage(message) {
    let current = message || {};

    for (let i = 0; i < 8; i++) {
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


function getQuotedMessage(msg) {
    const message = unwrapMessage(msg.message);

    const context =
        message.extendedTextMessage?.contextInfo ||
        message.imageMessage?.contextInfo ||
        message.videoMessage?.contextInfo ||
        message.documentMessage?.contextInfo ||
        message.audioMessage?.contextInfo ||
        null;

    if (!context?.quotedMessage) {
        return null;
    }

    return {
        key: {
            remoteJid:
                msg.key.remoteJid,

            fromMe:
                Boolean(
                    context.participant ===
                    msg.key.remoteJid
                ),

            id:
                context.stanzaId,

            participant:
                context.participant
        },

        message:
            context.quotedMessage
    };
}


function getMediaMessage(message) {
    let current =
        unwrapMessage(
            message?.message
        );

    if (!current) {
        return null;
    }

    if (
        current.imageMessage ||
        current.videoMessage ||
        current.audioMessage ||
        current.documentMessage ||
        current.stickerMessage
    ) {
        return current;
    }

    return null;
}


function getMediaType(message) {
    const media =
        getMediaMessage(message);

    if (!media) {
        return null;
    }

    if (media.imageMessage) {
        return {
            type: 'image',
            message: media.imageMessage,
            extension: 'jpg',
            mimetype:
                media.imageMessage.mimetype ||
                'image/jpeg'
        };
    }

    if (media.videoMessage) {
        return {
            type: 'video',
            message: media.videoMessage,
            extension: 'mp4',
            mimetype:
                media.videoMessage.mimetype ||
                'video/mp4'
        };
    }

    if (media.audioMessage) {
        return {
            type: 'audio',
            message: media.audioMessage,
            extension: 'mp3',
            mimetype:
                media.audioMessage.mimetype ||
                'audio/mpeg'
        };
    }

    if (media.documentMessage) {
        const filename =
            media.documentMessage.fileName ||
            'document';

        const extension =
            filename.includes('.')
                ? filename.split('.').pop()
                : 'bin';

        return {
            type: 'document',
            message:
                media.documentMessage,
            extension,
            mimetype:
                media.documentMessage.mimetype ||
                'application/octet-stream',
            filename
        };
    }

    if (media.stickerMessage) {
        return {
            type: 'sticker',
            message:
                media.stickerMessage,
            extension: 'webp',
            mimetype:
                media.stickerMessage.mimetype ||
                'image/webp'
        };
    }

    return null;
}


async function downloadQuotedMedia(
    sock,
    msg,
    quoted
) {
    const media =
        getMediaType(quoted);

    if (!media) {
        throw new Error(
            'The quoted message does not contain supported media.'
        );
    }

    const wrappedMessage = {
        key: quoted.key,
        message: quoted.message
    };

    const buffer =
        await downloadMediaMessage(
            wrappedMessage,
            'buffer',
            {},
            {
                logger:
                    console,
                reuploadRequest:
                    sock.updateMediaMessage
            }
        );

    if (!buffer || !buffer.length) {
        throw new Error(
            'WhatsApp returned an empty media file.'
        );
    }

    return {
        buffer,
        ...media
    };
}

async function uploadToTop4Top(
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

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => controller.abort(),
            UPLOAD_TIMEOUT_MS
        );

    try {
        const response =
            await fetch(
                API_URL,
                {
                    method: 'POST',

                    body: form,

                    headers: {
                        Accept:
                            'application/json'
                    },

                    signal:
                        controller.signal
                }
            );

        const raw =
            await response.text();

        console.log(
            'Top4Top status:',
            response.status
        );

        console.log(
            'Top4Top response:',
            raw.slice(0, 2000)
        );

        if (!response.ok) {
            throw new Error(
                `Top4Top API returned HTTP ${response.status}`
            );
        }

        if (!raw.trim()) {
            throw new Error(
                'Top4Top API returned an empty response.'
            );
        }

        let data;

        try {
            data =
                JSON.parse(raw);
        } catch {
            throw new Error(
                'Top4Top API returned invalid JSON.'
            );
        }

        if (
            !data.success ||
            !data.data
        ) {
            throw new Error(
                data.message ||
                'Top4Top upload failed.'
            );
        }

        const files =
            data.data.files;

        if (
            !Array.isArray(files) ||
            !files.length
        ) {
            throw new Error(
                'Top4Top did not return an uploaded file.'
            );
        }

        const uploaded =
            files.find(
                file =>
                    file?.success &&
                    file?.url
            );

        if (!uploaded) {
            throw new Error(
                'Top4Top upload was unsuccessful.'
            );
        }

        return uploaded;

    } catch (error) {
        if (
            error.name ===
            'AbortError'
        ) {
            throw new Error(
                'Top4Top upload timed out.'
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}


function createFilename(
    media,
    quoted
) {
    if (media.filename) {
        return media.filename;
    }

    const timestamp =
        Date.now();

    return `asta-${timestamp}.${media.extension}`;
}

async function sendResult(
    sock,
    msg,
    uploaded
) {
    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text: [
                '✅ *Upload successful!*',
                '',
                `🔗 ${uploaded.url}`,
                '',
                uploaded.filename
                    ? `📁 ${uploaded.filename}`
                    : ''
            ]
                .filter(Boolean)
                .join('\n')
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

        version: '1.0.0',

        description:
            'Upload replied media to Top4Top and return its URL',

        usage:
            'tourl (reply to an image/media)',

        examples: [
            'tourl',
            'to-url',
            'url'
        ],

        permissions: 0,

        cooldown: 10,

        category: 'tools'
    },

    onRun: async (
        sock,
        msg
    ) => {
        const jid =
            msg.key.remoteJid;

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
                            'Reply to an image or media with:',
                            '',
                            '`.tourl`',
                            '',
                            'Example:',
                            'Reply to an image → `.tourl`'
                        ].join('\n')
                    },
                    {
                        quoted: msg
                    }
                );

                return;
            }

            const media =
                getMediaType(
                    quoted
                );

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
                        '⏳ Uploading media...'
                },
                {
                    quoted: msg
                }
            );

            const downloaded =
                await downloadQuotedMedia(
                    sock,
                    msg,
                    quoted
                );


            const filename =
                createFilename(
                    downloaded,
                    quoted
                );


            const uploaded =
                await uploadToTop4Top(
                    downloaded.buffer,
                    filename,
                    downloaded.mimetype
                );

            await sendResult(
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