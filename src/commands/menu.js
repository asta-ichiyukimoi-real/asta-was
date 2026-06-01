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

*Group*
13. ${prefix}groupinfo - Show group details
14. ${prefix}tagall message - Mention everyone

*Moderation*
15. ${prefix}kick @user - Remove a member
16. ${prefix}warn @user - Warn a member
17. ${prefix}antilink on - Block links
18. ${prefix}badword add word - Filter a word
19. ${prefix}mute - Lock the group

*Custom*
20. ${prefix}addcmd rules Be respectful - Add a command
21. ${prefix}listcmd - List custom commands
22. ${prefix}disable sticker - Disable a command here
23. ${prefix}enable sticker - Enable it again

*Platform*
24. ${prefix}setprefix . - Set chat prefix
25. ${prefix}setwelcome Welcome {{name}} - Edit welcome
26. ${prefix}role add mod @user - Add bot mod
27. ${prefix}health - Bot health
28. ${prefix}backup - Backup bot state
29. ${prefix}reload - Reload commands

Reply with one of the commands above to continue.`;

        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
    }
};
