const config = require('../../config');
const state = require('../utils/stateManager');

module.exports = {
    config: {
        name: 'menu',
        aliases: ['panel'],
        version: '1.0.0',
        description: 'Displays a text-based command menu',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const prefix = state.getChatPrefix(msg.key.remoteJid, config.prefix);
        const text = `*Bot Command Menu*

*General*
1. ${prefix}help - Show commands list
2. ${prefix}stats - View bot usage stats
3. ${prefix}ping - Check bot status

*Useful*
4. ${prefix}time - Show current time
5. ${prefix}calc 12 * 4 - Calculate math
6. ${prefix}remind 10m drink water - Set reminder

*AI*
7. ${prefix}asta hi - Chat with Asta
8. ${prefix}resetasta - Clear Asta memory

*Fun*
9. ${prefix}joke - Get a programming joke
10. ${prefix}quote - Get inspiration
11. ${prefix}choose rice, pasta - Pick one

*Media*
12. ${prefix}sticker - Make an image sticker
13. ${prefix}media faded - Download mp3 or mp4

*Group*
14. ${prefix}groupinfo - Show group details
15. ${prefix}tagall message - Mention everyone

*Moderation*
16. ${prefix}kick @user - Remove a member
17. ${prefix}warn @user - Warn a member
18. ${prefix}antilink on - Block links
19. ${prefix}badword add word - Filter a word
20. ${prefix}mute - Lock the group

*Custom*
21. ${prefix}addcmd rules Be respectful - Add a command
22. ${prefix}listcmd - List custom commands
23. ${prefix}disable sticker - Disable a command here
24. ${prefix}enable sticker - Enable it again

*Platform*
25. ${prefix}setprefix . - Set chat prefix
26. ${prefix}setwelcome Welcome {{name}} - Edit welcome
27. ${prefix}role add mod @user - Add bot mod
28. ${prefix}health - Bot health
29. ${prefix}backup - Backup bot state
30. ${prefix}reload - Reload commands

Reply with one of the commands above to continue.`;

        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
    }
};
