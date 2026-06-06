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
17. ${prefix}find akaza - Choose media search type

*Group*
18. ${prefix}groupinfo - Show group details
19. ${prefix}tagall message - Mention everyone

*Moderation*
20. ${prefix}kick @user - Remove a member
21. ${prefix}warn @user - Warn a member
22. ${prefix}antilink on - Block links
23. ${prefix}badword add word - Filter a word
24. ${prefix}mute - Lock the group

*Custom*
25. ${prefix}addcmd rules Be respectful - Add a command
26. ${prefix}listcmd - List custom commands
27. ${prefix}disable sticker - Disable a command here
28. ${prefix}enable sticker - Enable it again

*Platform*
29. ${prefix}setprefix . - Set chat prefix
30. ${prefix}setwelcome Welcome {{name}} - Edit welcome
31. ${prefix}role add mod @user - Add bot mod
32. ${prefix}health - Bot health
33. ${prefix}config get media.wallpaperMaxImages - Runtime config
34. ${prefix}backup - Backup bot state
35. ${prefix}ownertest - Debug owner permission
36. ${prefix}reload - Reload commands

*Developer*
37. ${prefix}logs 20 - Show recent logs
38. ${prefix}shell git status --short - Run shell command

Reply with one of the commands above to continue.`;

        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
    }
};
