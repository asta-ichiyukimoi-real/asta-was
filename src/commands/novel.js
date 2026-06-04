const axios = require('axios');
const AdmZip = require('adm-zip');

const BASE = 'https://omegatech-api.dixonomega.tech/api/Novel/novel';
const TTS_BASE = 'https://omegatech-api.dixonomega.tech/api/ai/text2speech-v3';
const CHUNK_SIZE = 800; // chars per TTS request
const MAX_ZIP_CHAPTERS = 150;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function safeFileName(value, fallback = 'chapter') {
    return String(value || fallback)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || fallback;
}

function formatChapterText(chapter) {
    return [
        chapter.chapterName || 'Untitled Chapter',
        `${chapter.totalWords || 0} words`,
        '',
        chapter.content || ''
    ].join('\n');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatChapterHtml(chapter) {
    const title = chapter.chapterName || 'Untitled Chapter';
    const words = chapter.totalWords || 0;
    const content = escapeHtml(chapter.content || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .split(/\n{2,}/)
        .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
        .join('\n');

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
        body {
            margin: 0;
            background: #f5f1e8;
            color: #221f1a;
            font-family: Georgia, "Times New Roman", serif;
            line-height: 1.75;
        }
        main {
            max-width: 760px;
            margin: 0 auto;
            padding: 40px 20px 64px;
        }
        h1 {
            font-size: 2rem;
            line-height: 1.25;
            margin: 0 0 8px;
        }
        .meta {
            color: #6f675c;
            font-family: Arial, sans-serif;
            font-size: 0.95rem;
            margin-bottom: 32px;
        }
        p {
            font-size: 1.15rem;
            margin: 0 0 1.2em;
        }
    </style>
</head>
<body>
    <main>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">${words} words</div>
        ${content}
    </main>
</body>
</html>`;
}

function parseChapterRange(rangeText, maxChapter) {
    const value = String(rangeText || '').trim();
    const match = value.match(/^(\d+)(?:-(\d*)?)?$/);

    if (!match) {
        throw new Error('Use a chapter range like 1-10, 100-200, 5, or 1-.');
    }

    const start = Number(match[1]);
    const end = match[2] === undefined
        ? start
        : match[2] === ''
            ? maxChapter
            : Number(match[2]);

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        throw new Error('That chapter range is not valid.');
    }

    if (end > maxChapter) {
        throw new Error(`This novel only has ${maxChapter} chapters.`);
    }

    const count = end - start + 1;
    if (count > MAX_ZIP_CHAPTERS) {
        throw new Error(`Please request ${MAX_ZIP_CHAPTERS} chapters or fewer at once.`);
    }

    return { start, end, count, label: `${start}-${end}` };
}

async function fetchChapters(novelId) {
    const { data } = await axios.get(`${BASE}?action=chapters&novelId=${encodeURIComponent(novelId)}`, { timeout: 15000 });
    if (!data.success || !Array.isArray(data.chapters)) {
        throw new Error('Novel not found or chapters could not be loaded.');
    }
    return data;
}

async function fetchChapter(chapterId) {
    const { data } = await axios.get(`${BASE}?action=chapter&chapterId=${encodeURIComponent(chapterId)}`, { timeout: 20000 });
    if (!data.success || !data.content) {
        throw new Error('Chapter not found.');
    }
    return data;
}

async function resolveChapterId(novelId, chapterNum) {
    if (!chapterNum) return novelId;

    const chapterList = await fetchChapters(novelId);
    const chapter = chapterList.chapters.find(item => Number(item.seq) === Number(chapterNum));
    if (!chapter) {
        throw new Error(`Chapter ${chapterNum} not found.`);
    }

    return chapter.chapterId;
}

async function sendChapterDocument(sock, chatId, msg, chapter) {
    const fileName = `${safeFileName(chapter.chapterName, 'chapter')}.html`;
    const buffer = Buffer.from(formatChapterHtml(chapter), 'utf8');

    await sock.sendMessage(chatId, {
        document: buffer,
        fileName,
        mimetype: 'text/html'
    }, { quoted: msg });
}

async function buildNovelZip(novelId, rangeText, onProgress) {
    const chapterList = await fetchChapters(novelId);
    const maxChapter = chapterList.chapters.reduce((highest, item) => Math.max(highest, Number(item.seq) || 0), 0);
    const range = parseChapterRange(rangeText, maxChapter);
    const selected = chapterList.chapters
        .filter(item => Number(item.seq) >= range.start && Number(item.seq) <= range.end)
        .sort((a, b) => Number(a.seq) - Number(b.seq));

    if (!selected.length) {
        throw new Error('No chapters found in that range.');
    }

    const zip = new AdmZip();
    for (let i = 0; i < selected.length; i += 1) {
        const item = selected[i];
        const chapter = await fetchChapter(item.chapterId);
        const seq = String(item.seq).padStart(4, '0');
        const name = `${seq} - ${safeFileName(chapter.chapterName || item.chapterName, `chapter-${seq}`)}.html`;

        zip.addFile(name, Buffer.from(formatChapterHtml(chapter), 'utf8'));

        if (onProgress && ((i + 1) % 10 === 0 || i + 1 === selected.length)) {
            await onProgress(i + 1, selected.length);
        }

        await wait(250);
    }

    return {
        buffer: zip.toBuffer(),
        count: selected.length,
        range,
        fileName: `novel-${safeFileName(novelId)}-chapters-${range.label}.zip`
    };
}

module.exports = {
    config: {
        name: 'novel',
        aliases: ['novel'],
        version: '1.4.0',
        description: 'Search, read, download, zip, and listen to novels from Omegatech',
        permissions: 0,
        category: 'reading'
    },

    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const subCmd = args[0]?.toLowerCase();

        if (!subCmd) {
            return await sock.sendMessage(chatId, {
                text: [
                    '*Novel Command Usage*',
                    '',
                    '*.novel search <name>*',
                    'Search novels',
                    '*.novel chapters <novelId>*',
                    'List chapters',
                    '*.novel read <chapterId>*',
                    '*.novel read <novelId> <chapterNum>*',
                    'Read a chapter in chat',
                    '*.novel download <chapterId>*',
                    '*.novel download <novelId> <chapterNum>*',
                    'Send a chapter as a Chrome-readable .html file',
                    '*.novel zip <novelId> <range>*',
                    'Send many chapters as a zip. Examples: 1-10, 100-200, 5, 1-',
                    '*.novel listen <chapterId> [voice] [language]*',
                    '*.novel listen <novelId> <chapterNum> [voice] [language]*',
                    '',
                    'Voices: man1, woman1, man2, woman2',
                    'Example: .novel zip 4143540734094361712 1-20'
                ].join('\n')
            }, { quoted: msg });
        }

        try {
            if (subCmd === 'search') {
                const query = args.slice(1).join(' ');
                if (!query) return await sock.sendMessage(chatId, { text: 'Give me a novel name to search.' }, { quoted: msg });

                await sock.sendMessage(chatId, { text: `Searching *${query}*...` }, { quoted: msg });

                const { data } = await axios.get(`${BASE}?action=search&query=${encodeURIComponent(query)}`, { timeout: 15000 });
                if (!data.success || !Array.isArray(data.results) || !data.results.length) {
                    return await sock.sendMessage(chatId, { text: 'No results found.' }, { quoted: msg });
                }

                let text = `*Search Results for:* ${data.query || query}\n*Total:* ${data.total || data.results.length}\n\n`;
                data.results.slice(0, 10).forEach((novel, index) => {
                    text += `*${index + 1}.* ${novel.title}\n`;
                    text += `ID: \`${novel.novelId}\`\n`;
                    text += `Author: ${novel.author || 'Unknown'} | Score: ${novel.score || 'N/A'}\n`;
                    text += `Chapters: ${novel.totalChapters || 'N/A'} | Views: ${novel.totalViews || 'N/A'}\n`;
                    text += `Genres: ${Array.isArray(novel.genres) ? novel.genres.join(', ') : 'N/A'}\n\n`;
                });
                text += 'Use: *.novel chapters <novelId>* to see chapters';

                await sock.sendMessage(chatId, { text }, { quoted: msg });
            } else if (subCmd === 'chapters') {
                const novelId = args[1];
                if (!novelId) return await sock.sendMessage(chatId, { text: 'Give me a novelId.' }, { quoted: msg });

                await sock.sendMessage(chatId, { text: 'Loading chapters...' }, { quoted: msg });

                const data = await fetchChapters(novelId);
                let text = `*Chapters*\n*Total:* ${data.total || data.chapters.length}\n\n`;
                data.chapters.slice(0, 30).forEach(chapter => {
                    text += `*${chapter.seq}.* ${chapter.chapterName}\n`;
                    text += `ID: \`${chapter.chapterId}\` | ${chapter.totalWords || 0} words\n`;
                });
                if ((data.total || data.chapters.length) > 30) text += `_Showing 1-30 of ${data.total || data.chapters.length}_\n\n`;
                text += `Read: *.novel read ${novelId} 1*\n`;
                text += `Download: *.novel download ${novelId} 1*\n`;
                text += `Zip: *.novel zip ${novelId} 1-20*`;

                await sock.sendMessage(chatId, { text }, { quoted: msg });
            } else if (subCmd === 'read') {
                const param1 = args[1];
                const param2 = args[2];

                if (!param1) return await sock.sendMessage(chatId, { text: 'Give me a chapterId or novelId.' }, { quoted: msg });

                if (param2 && !isNaN(param2)) {
                    await sock.sendMessage(chatId, { text: 'Getting chapter list...' }, { quoted: msg });
                }

                const chapterId = await resolveChapterId(param1, param2 && !isNaN(param2) ? param2 : null);
                await sock.sendMessage(chatId, { text: 'Fetching chapter...' }, { quoted: msg });

                const data = await fetchChapter(chapterId);
                let text = `*${data.chapterName}*\n`;
                text += `*${data.totalWords || 0} words*\n\n`;
                text += `${data.content}\n\n`;
                text += `_Download with: .novel download ${chapterId}_`;

                const parts = text.match(/[\s\S]{1,4000}/g) || [];
                for (let i = 0; i < parts.length; i += 1) {
                    await sock.sendMessage(chatId, { text: parts[i] }, { quoted: i === 0 ? msg : undefined });
                    await wait(800);
                }
            } else if (subCmd === 'download') {
                const param1 = args[1];
                const param2 = args[2];

                if (!param1) {
                    return await sock.sendMessage(chatId, {
                        text: 'Use: .novel download <chapterId>\nOr: .novel download <novelId> <chapterNum>'
                    }, { quoted: msg });
                }

                if (param2 && !isNaN(param2)) {
                    await sock.sendMessage(chatId, { text: 'Getting chapter list...' }, { quoted: msg });
                }

                const chapterId = await resolveChapterId(param1, param2 && !isNaN(param2) ? param2 : null);
                await sock.sendMessage(chatId, { text: 'Preparing chapter file...' }, { quoted: msg });

                const chapter = await fetchChapter(chapterId);
                await sendChapterDocument(sock, chatId, msg, chapter);
            } else if (subCmd === 'zip') {
                const novelId = args[1];
                const rangeText = args[2];

                if (!novelId || !rangeText) {
                    return await sock.sendMessage(chatId, {
                        text: 'Use: .novel zip <novelId> <range>\nExamples: .novel zip 4143540734094361712 1-20\n.novel zip 4143540734094361712 100-200'
                    }, { quoted: msg });
                }

                await sock.sendMessage(chatId, { text: `Preparing zip for chapters ${rangeText}. This may take a while...` }, { quoted: msg });

                let lastProgressAt = 0;
                const zipData = await buildNovelZip(novelId, rangeText, async (done, total) => {
                    const now = Date.now();
                    if (now - lastProgressAt < 5000 && done !== total) return;
                    lastProgressAt = now;
                    await sock.sendMessage(chatId, { text: `Added ${done}/${total} chapters to zip...` });
                });

                await sock.sendMessage(chatId, {
                    document: zipData.buffer,
                    fileName: zipData.fileName,
                    mimetype: 'application/zip',
                    caption: `Novel chapters ${zipData.range.label} (${zipData.count} files)`
                }, { quoted: msg });
            } else if (subCmd === 'listen') {
                let chapterId = args[1];
                let voice = args[2] || 'woman1';
                let language = args[3] || 'English';

                if (!chapterId) {
                    return await sock.sendMessage(chatId, {
                        text: 'Give me a chapterId or novelId.\nUsage: .novel listen <chapterId> [voice] [language]\nOr: .novel listen <novelId> <chapterNum> [voice] [language]'
                    }, { quoted: msg });
                }

                if (args[2] && !isNaN(args[2])) {
                    const novelId = args[1];
                    const chapterNum = args[2];
                    voice = args[3] || 'woman1';
                    language = args[4] || 'English';

                    await sock.sendMessage(chatId, { text: 'Getting chapter list...' }, { quoted: msg });
                    chapterId = await resolveChapterId(novelId, chapterNum);
                }

                await sock.sendMessage(chatId, { text: 'Fetching chapter and splitting into parts...' }, { quoted: msg });

                const chapData = await fetchChapter(chapterId);
                const cleanText = chapData.content
                    .replace(/[""]/g, '"')
                    .replace(/['']/g, "'")
                    .replace(/\n+/g, ' ')
                    .trim();

                const chunks = [];
                for (let i = 0; i < cleanText.length; i += CHUNK_SIZE) {
                    chunks.push(cleanText.slice(i, i + CHUNK_SIZE));
                }

                if (chunks.length === 0) return await sock.sendMessage(chatId, { text: 'No content to speak.' }, { quoted: msg });

                await sock.sendMessage(chatId, {
                    text: `*${chapData.chapterName}*\n${chunks.length} part${chunks.length > 1 ? 's' : ''} | Voice: ${voice} | Lang: ${language}\n\nGenerating audio, this may take a bit...`
                }, { quoted: msg });

                for (let i = 0; i < chunks.length; i += 1) {
                    try {
                        await sock.sendMessage(chatId, { text: `Generating part ${i + 1}/${chunks.length}...` });

                        const { data: ttsData } = await axios.get(
                            `${TTS_BASE}?text=${encodeURIComponent(chunks[i])}&voice=${encodeURIComponent(voice)}&language=${encodeURIComponent(language)}`,
                            { timeout: 45000 }
                        );

                        if (!ttsData.success || !ttsData.audio) {
                            await sock.sendMessage(chatId, { text: `Part ${i + 1} failed.` });
                            continue;
                        }

                        await sock.sendMessage(chatId, {
                            audio: { url: ttsData.audio },
                            mimetype: 'audio/mpeg',
                            ptt: false
                        });

                        await wait(1500);
                    } catch (err) {
                        console.error(`TTS chunk ${i + 1} error:`, err.message);
                        await sock.sendMessage(chatId, { text: `Part ${i + 1} failed: ${err.response?.status || 'Error'}` });
                    }
                }

                await sock.sendMessage(chatId, { text: `Done. All ${chunks.length} parts sent.` });
            } else {
                await sock.sendMessage(chatId, { text: 'Unknown subcommand. Use: search, chapters, read, download, zip, listen' }, { quoted: msg });
            }
        } catch (err) {
            console.error('Novel command error:', err.response?.status, err.message);
            await sock.sendMessage(chatId, { text: `Error: ${err.message || err.response?.status || 'Request failed'}` }, { quoted: msg });
        }
    }
};
