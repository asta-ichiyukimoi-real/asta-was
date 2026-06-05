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
4. ${prefix}jid - Show your JID

*Useful*
5. ${prefix}time - Show current time
6. ${prefix}calc 12 * 4 - Calculate math
7. ${prefix}remind 10m drink water - Set reminder

*AI*
8. ${prefix}asta hi - Chat with Asta
9. ${prefix}resetasta - Clear Asta memory

*Fun*
10. ${prefix}joke - Get a programming joke
11. ${prefix}quote - Get inspiration
12. ${prefix}choose rice, pasta - Pick one

*Media*
13. ${prefix}sticker - Make an image sticker
14. ${prefix}media faded - Download mp3 or mp4
15. ${prefix}wallpaper akaza -4 - Send wallpapers
16. ${prefix}pinterest akaza -4 - Search Pinterest images

*Group*
17. ${prefix}groupinfo - Show group details
18. ${prefix}tagall message - Mention everyone

*Moderation*
19. ${prefix}kick @user - Remove a member
20. ${prefix}warn @user - Warn a member
21. ${prefix}antilink on - Block links
22. ${prefix}badword add word - Filter a word
23. ${prefix}mute - Lock the group

*Custom*
24. ${prefix}addcmd rules Be respectful - Add a command
25. ${prefix}listcmd - List custom commands
26. ${prefix}disable sticker - Disable a command here
27. ${prefix}enable sticker - Enable it again

*Platform*
28. ${prefix}setprefix . - Set chat prefix
29. ${prefix}setwelcome Welcome {{name}} - Edit welcome
30. ${prefix}role add mod @user - Add bot mod
31. ${prefix}health - Bot health
32. ${prefix}backup - Backup bot state
33. ${prefix}ownertest - Debug owner permission
34. ${prefix}reload - Reload commands

Reply with one of the commands above to continue.`;

        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
    }
};
