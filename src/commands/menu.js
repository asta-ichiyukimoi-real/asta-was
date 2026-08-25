const config = require('../../config');
const state = require('../utils/stateManager');
const { sendStyledMessage } = require('../utils/messageStyle');

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
        const prefix = state.getChatPrefix(msg.key.remoteJid, global.configCommandHandler?.getPrefix?.() || config.prefix);
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
18. ${prefix}imgurl - Upload an image and get its URL

*Group*
19. ${prefix}groupinfo - Show group details
20. ${prefix}tagall message - Mention everyone

*Moderation*
21. ${prefix}kick @user - Remove a member
22. ${prefix}warn @user - Warn a member
23. ${prefix}antilink on - Block links
24. ${prefix}badword add word - Filter a word
25. ${prefix}mute - Lock the group

*Custom*
26. ${prefix}addcmd rules Be respectful - Add a command
27. ${prefix}listcmd - List custom commands
28. ${prefix}disable sticker - Disable a command here
29. ${prefix}enable sticker - Enable it again

*Platform*
30. ${prefix}setprefix . - Set chat prefix
31. ${prefix}setwelcome Welcome {{name}} - Edit welcome
32. ${prefix}role add mod @user - Add bot mod
33. ${prefix}health - Bot health
34. ${prefix}config get media.wallpaperMaxImages - Runtime config
35. ${prefix}features media off - Toggle categories
36. ${prefix}backup - Backup bot state
37. ${prefix}ownertest - Debug owner permission
38. ${prefix}reload - Reload commands
39. ${prefix}update check - Check GitHub updates

*Developer*
40. ${prefix}logs 20 - Show recent logs
41. ${prefix}shell git status --short - Run shell command
42. ${prefix}file list src/commands - Manage files
43. ${prefix}analytics - Bot metrics
44. ${prefix}apistatus - Check API health
45. ${prefix}env - Check allowed env vars
46. ${prefix}eval commands.size - Evaluate JS
47. ${prefix}restart - Restart bot

Reply with one of the commands above to continue.`;

        await sendStyledMessage(sock, msg.key.remoteJid, text, {
            quoted: msg,
            commandName: 'menu'
        });
    }
};
