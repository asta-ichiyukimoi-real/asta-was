const state = require('../utils/stateManager');
const {
    availableFonts,
    fontLabel,
    getReplyFont,
    normalizeFontName,
    styleText
} = require('../utils/messageStyle');

function refreshConfigHandler() {
    if (global.configCommandHandler?.reload) {
        global.configCommandHandler.reload();
    }
}

module.exports = {
    config: {
        name: 'font',
        aliases: ['replyfont', 'textfont'],
        version: '1.0.0',
        description: 'Change the font style used for bot replies',
        usage: 'font <list|name|off>',
        examples: ['font list', 'font script', 'font mono', 'font off'],
        permissions: 2,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const input = args.join(' ').trim();

        if (!input || input.toLowerCase() === 'list') {
            const current = getReplyFont();
            const lines = availableFonts().map((name) => {
                const sample = styleText('Asta 123', name);
                return `${name} - ${fontLabel(name)} - ${sample}`;
            });

            await sock.sendMessage(chatId, {
                __skipReplyFont: true,
                text: [
                    '*Reply Fonts*',
                    `Current: ${current}`,
                    '',
                    ...lines,
                    '',
                    'Use: .font <name>'
                ].join('\n')
            }, { quoted: msg });
            return;
        }

        const nextFont = normalizeFontName(input);
        if (!availableFonts().includes(nextFont)) {
            await sock.sendMessage(chatId, {
                text: `Unknown font: ${input}\nUse .font list to see available fonts.`
            }, { quoted: msg });
            return;
        }

        state.setRuntimeConfig('messages.replyFont', nextFont);
        refreshConfigHandler();

        await sock.sendMessage(chatId, {
            text: `Reply font set to ${nextFont}.\n${styleText('This is how replies will look now.', nextFont)}`
        }, { quoted: msg });
    }
};
