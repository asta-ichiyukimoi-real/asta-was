const axios = require('axios');
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const BASE = 'https://omegatech-api.dixonomega.tech/api/Novel/novel';
const TTS_BASE = 'https://omegatech-api.dixonomega.tech/api/ai/text2speech-v3';
const CHUNK_SIZE = 800; // chars per TTS request

module.exports = {
    config: {
        name: 'novel',
        aliases: ['novel'],
        version: '1.3.0',
        description: 'Search, read and listen to novels from Omegatech',
        permissions: 0,
        category: 'reading'
    },

    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const subCmd = args[0]?.toLowerCase();

        if (!subCmd) {
            return await sock.sendMessage(chatId, {
                text: `📖 *Novel Command Usage*\n\n` +
                      `*.novel search <name>*\n` +
                      `Search novels\n` +
                      `*.novel chapters <novelId>*\n` +
                      `List chapters\n` +
                      `*.novel read <chapterId>*\n` +
                      `Read by chapterId\n` +
                      `*.novel read <novelId> <chapterNum>*\n` +
                      `Read by chapter number\n` +
                      `*.novel listen <chapterId> [voice] *\n` +
                      `*.novel listen <novelId> <chapterNum> [voice] *\n` +
                      `Get audio for full chapter. Splits into parts automatically.\n` +
                      `*Voices:* man1, woman1, man2, woman2\n` +
                      `*Lang:* English, Spanish, etc. Default: English\n` +
                      `*Example:*\n.novel listen 6253301237656553008 1 woman1 English`
            }, { quoted: msg });
        }

        try {
            // 1. Search novels
            if (subCmd === 'search') {
                const query = args.slice(1).join(' ');
                if (!query) return await sock.sendMessage(chatId, { text: '❌ Give me a novel name to search.' }, { quoted: msg });

                await sock.sendMessage(chatId, { text: `🔍 Searching *${query}*...` }, { quoted: msg });

                const { data } = await axios.get(`${BASE}?action=search&query=${encodeURIComponent(query)}`, { timeout: 15000 });
                if (!data.success ||!data.results.length) return await sock.sendMessage(chatId, { text: '😕 No results found.' }, { quoted: msg });

                let text = `*📖 Search Results for:* ${data.query}\n*Total:* ${data.total}\n\n`;
                data.results.slice(0, 10).forEach((n, i) => {
                    text += `*${i + 1}.* ${n.title}\n`;
                    text += `ID: \`${n.novelId}\`\n`;
                    text += `Author: ${n.author || 'Unknown'} | ⭐ ${n.score}\n`;
                    text += `Chapters: ${n.totalChapters} | Views: ${n.totalViews}\n`;
                    text += `Genres: ${n.genres.join(', ')}\n\n`;
                });
                text += `Use: *.novel chapters <novelId>* to see chapters`;

                await sock.sendMessage(chatId, { text }, { quoted: msg });
            }

            // 2. List chapters
            else if (subCmd === 'chapters') {
                const novelId = args[1];
                if (!novelId) return await sock.sendMessage(chatId, { text: '❌ Give me a novelId.' }, { quoted: msg });

                await sock.sendMessage(chatId, { text: '📚 Loading chapters...' }, { quoted: msg });

                const { data } = await axios.get(`${BASE}?action=chapters&novelId=${novelId}`, { timeout: 15000 });
                if (!data.success) return await sock.sendMessage(chatId, { text: '⚠️ Failed to load chapters.' }, { quoted: msg });

                let text = `*📖 Chapters*\n*Total:* ${data.total}\n\n`;
                data.chapters.slice(0, 30).forEach(ch => {
                    text += `*${ch.seq}.* ${ch.chapterName}\n`;
                    text += `ID: \`${ch.chapterId}\` | ${ch.totalWords} words\n`;
                });
                if (data.total > 30) text += `_Showing 1-30 of ${data.total}_\n\n`;
                text += `Read: *.novel read ${novelId} 1*\n`;
                text += `Listen: *.novel listen ${novelId} 1 woman1 English*`;

                await sock.sendMessage(chatId, { text }, { quoted: msg });
            }

            // 3. Read chapter
            else if (subCmd === 'read') {
                const param1 = args[1];
                const param2 = args[2];

                if (!param1) return await sock.sendMessage(chatId, { text: '❌ Give me a chapterId or novelId.' }, { quoted: msg });

                let chapterId = param1;

                if (param2 &&!isNaN(param2)) {
                    await sock.sendMessage(chatId, { text: '📚 Getting chapter list...' }, { quoted: msg });
                    const chapList = await axios.get(`${BASE}?action=chapters&novelId=${param1}`, { timeout: 15000 });
                    if (!chapList.data.success) return await sock.sendMessage(chatId, { text: '⚠️ Novel not found.' }, { quoted: msg });

                    const chap = chapList.data.chapters.find(c => c.seq == param2);
                    if (!chap) return await sock.sendMessage(chatId, { text: `⚠️ Chapter ${param2} not found.` }, { quoted: msg });
                    chapterId = chap.chapterId;
                }

                await sock.sendMessage(chatId, { text: '📖 Fetching chapter...' }, { quoted: msg });

                const { data } = await axios.get(`${BASE}?action=chapter&chapterId=${chapterId}`, { timeout: 20000 });
                if (!data.success ||!data.content) return await sock.sendMessage(chatId, { text: '⚠️ Chapter not found.' }, { quoted: msg });

                let text = `*${data.chapterName}*\n`;
                text += `*${data.totalWords} words*\n\n`;
                text += `${data.content}\n\n`;
                text += `_Listen with:.novel listen ${chapterId} woman1 English_`;

                const parts = text.match(/[\s\S]{1,4000}/g);
                for (let i = 0; i < parts.length; i++) {
                    await sock.sendMessage(chatId, { text: parts[i] }, { quoted: i === 0? msg : undefined });
                    await new Promise(r => setTimeout(r, 800));
                }
            }

            // 4. Listen - TTS with auto-splitting
            else if (subCmd === 'listen') {
                let chapterId = args[1];
                let voice = args[2] || 'woman1';
                let language = args[3] || 'English';

                if (!chapterId) return await sock.sendMessage(chatId, { text: '❌ Give me a chapterId or novelId.\nUsage:.novel listen <chapterId> [voice] \nOr.novel listen <novelId> <chapterNum> [voice] ' }, { quoted: msg });

                // Shortcut:.novel listen <novelId> <chapterNum> <voice> <lang>
                if (args[2] &&!isNaN(args[2])) {
                    const novelId = args[1];
                    const chapterNum = args[2];
                    voice = args[3] || 'woman1';
                    language = args[4] || 'English';

                    await sock.sendMessage(chatId, { text: '📚 Getting chapter list...' }, { quoted: msg });
                    const chapList = await axios.get(`${BASE}?action=chapters&novelId=${novelId}`, { timeout: 15000 });
                    if (!chapList.data.success) return await sock.sendMessage(chatId, { text: '⚠️ Novel not found.' }, { quoted: msg });

                    const chap = chapList.data.chapters.find(c => c.seq == chapterNum);
                    if (!chap) return await sock.sendMessage(chatId, { text: `⚠️ Chapter ${chapterNum} not found.` }, { quoted: msg });
                    chapterId = chap.chapterId;
                }

                await sock.sendMessage(chatId, { text: '🎧 Fetching chapter and splitting into parts...' }, { quoted: msg });

                // Get chapter content
                const { data: chapData } = await axios.get(`${BASE}?action=chapter&chapterId=${chapterId}`, { timeout: 20000 });
                if (!chapData.success ||!chapData.content) return await sock.sendMessage(chatId, { text: '⚠️ Chapter not found.' }, { quoted: msg });

                // Split text into chunks
                const cleanText = chapData.content
               .replace(/[""]/g, '"')
               .replace(/['']/g, "'")
               .replace(/\n+/g, ' ')
               .trim();

                const chunks = [];
                for (let i = 0; i < cleanText.length; i += CHUNK_SIZE) {
                    chunks.push(cleanText.slice(i, i + CHUNK_SIZE));
                }

                if (chunks.length === 0) return await sock.sendMessage(chatId, { text: '⚠️ No content to speak.' }, { quoted: msg });

                await sock.sendMessage(chatId, {
                    text: `🎧 *${chapData.chapterName}*\n${chunks.length} part${chunks.length > 1? 's' : ''} | Voice: ${voice} | Lang: ${language}\n\nGenerating audio, this may take a bit...`
                }, { quoted: msg });

                // Generate audio for each chunk
                for (let i = 0; i < chunks.length; i++) {
                    try {
                        await sock.sendMessage(chatId, { text: `🎙️ Generating part ${i + 1}/${chunks.length}...` });

                        const { data: ttsData } = await axios.get(
                            `${TTS_BASE}?text=${encodeURIComponent(chunks[i])}&voice=${voice}&language=${encodeURIComponent(language)}`,
                            { timeout: 45000 }
                        );

                        if (!ttsData.success ||!ttsData.audio) {
                            await sock.sendMessage(chatId, { text: `⚠️ Part ${i + 1} failed.` });
                            continue;
                        }

                        await sock.sendMessage(chatId, {
                            text: `*Part ${i + 1}/${chunks.length}*\n${ttsData.audio}`
                        });

                        // Small delay to avoid rate limits
                        await new Promise(r => setTimeout(r, 1500));

                    } catch (err) {
                        console.error(`TTS chunk ${i + 1} error:`, err.message);
                        await sock.sendMessage(chatId, { text: `⚠️ Part ${i + 1} failed: ${err.response?.status || 'Error'}` });
                    }
                }

                await sock.sendMessage(chatId, { text: `✅ Done! All ${chunks.length} parts sent.` });
            }

            // Download chapter as TXT
            else if (subCmd === "download") {
                const param1 = args[1];
                const param2 = args[2];

                if (!param1) {
                    return await sock.sendMessage(chatId, {
                        text: "❌ Give me a chapterId or novelId."
                    }, { quoted: msg });
                }

                let chapterId = param1;

                if (param2 && !isNaN(param2)) {
                    const chapList = await axios.get(
                        `${BASE}?action=chapters&novelId=${param1}`,
                        { timeout: 15000 }
                    );

                    if (!chapList.data.success) {
                        return await sock.sendMessage(chatId, {
                            text: "⚠️ Novel not found."
                        }, { quoted: msg });
                    }

                    const chap = chapList.data.chapters.find(
                        c => c.seq == param2
                    );

                    if (!chap) {
                        return await sock.sendMessage(chatId, {
                            text: `⚠️ Chapter ${param2} not found.`
                        }, { quoted: msg });
                    }

                    chapterId = chap.chapterId;
                }

                await sock.sendMessage(chatId, {
                    text: "📥 Generating file..."
                }, { quoted: msg });

                const { data } = await axios.get(
                    `${BASE}?action=chapter&chapterId=${chapterId}`,
                    { timeout: 20000 }
                );

                if (!data.success || !data.content) {
                    return await sock.sendMessage(chatId, {
                        text: "⚠️ Chapter not found."
                    }, { quoted: msg });
                }

                const safeName = data.chapterName
                    .replace(/[<>:"/\\|?*]/g, "_");

                const filePath = path.join(
                    __dirname,
                    `${safeName}.txt`
                );

                fs.writeFileSync(
                    filePath,
                    `${data.chapterName}\n\n${data.content}`,
                    "utf8"
                );

                await sock.sendMessage(chatId, {
                    document: fs.readFileSync(filePath),
                    mimetype: "text/plain",
                    fileName: `${safeName}.txt`
                }, { quoted: msg });

                fs.unlinkSync(filePath);
            }
            // Download entire novel as ZIP
            else if (subCmd === "zip") {

                const novelId = args[1];

                if (!novelId) {
                    return await sock.sendMessage(chatId, {
                        text: "❌ Give me a novelId."
                    }, { quoted: msg });
                }

                await sock.sendMessage(chatId, {
                    text: "📚 Loading chapters..."
                }, { quoted: msg });

                const { data: chapterList } = await axios.get(
                    `${BASE}?action=chapters&novelId=${novelId}`,
                    { timeout: 20000 }
                );

                if (!chapterList.success) {
                    return await sock.sendMessage(chatId, {
                        text: "⚠️ Failed to load chapters."
                    }, { quoted: msg });
                }

                const tempDir = path.join(
                    __dirname,
                    `novel_${Date.now()}`
                );

                fs.mkdirSync(tempDir);

                const maxChapters = 100;

                const chapters = chapterList.chapters.slice(
                    0,
                    maxChapters
                );

                for (let i = 0; i < chapters.length; i++) {

                    await sock.sendMessage(chatId, {
                        text: `📖 Fetching chapter ${i + 1}/${chapters.length}`
                    });

                    try {

                        const { data: chapter } = await axios.get(
                            `${BASE}?action=chapter&chapterId=${chapters[i].chapterId}`,
                            { timeout: 20000 }
                        );

                        if (!chapter.success) continue;

                        const fileName =
                            `${chapters[i].seq}.txt`;

                        fs.writeFileSync(
                            path.join(tempDir, fileName),
                            `${chapter.chapterName}\n\n${chapter.content}`,
                            "utf8"
                        );

                    } catch {}
                }

                const zipPath = path.join(
                    __dirname,
                    `${novelId}.zip`
                );

                const output = fs.createWriteStream(zipPath);

                const archive = archiver("zip", {
                    zlib: { level: 9 }
                });

                archive.pipe(output);

                archive.directory(tempDir, false);

                await archive.finalize();

                await new Promise(resolve => {
                    output.on("close", resolve);
                });

                await sock.sendMessage(chatId, {
                    document: fs.readFileSync(zipPath),
                    mimetype: "application/zip",
                    fileName: `${novelId}.zip`
                }, { quoted: msg });

                fs.rmSync(tempDir, {
                    recursive: true,
                    force: true
                });

                fs.unlinkSync(zipPath);
            }
            else {
                await sock.sendMessage(chatId, { text: '❌ Unknown subcommand. Use: search, chapters, read, listen' }, { quoted: msg });
            }

        } catch (err) {
            console.error('Novel command error:', err.response?.status, err.message);
            await sock.sendMessage(chatId, { text: `⚠️ Error: ${err.response?.status || 'Request failed'}` }, { quoted: msg });
        }
    }
};