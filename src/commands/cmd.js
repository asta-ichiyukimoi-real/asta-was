const fs = require('fs');
const path = require('path');
const srcc = path.dirname(__filename)
const addFile = (filee, script) => {
    const filePath = path.join(srcc, filee);
    const writeCode = fs.writeFileSync(filePath, script);
    return writeCode;
}

const delFile = (filess) => {
    const delfi = fs.unlinkSync(filess)
}
const commandHandler = global.commandHandler;


module.exports = {
    config: {
        name: 'cmd',
        aliases: ['command'],
        version: '1.0.0',
        description: 'Replies with pong to check bot responsiveness',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const prefix = state.getChatPrefix(chatId, configHandler?.getPrefix?.() || config.prefix);
        const option = args[0]?.toLowerCase();
        const filename = args[1]?.toLowerCase();
        const text = args.slice(1).join(' ').trim();
        const usage = `usage: \n${prefix}cmd add <filename>.js <code>\n${prefix}cmd del <filename>.js`

        try {
        if(!option || !['add', 'del'].includes(option)) {
             await sock.sendMessage(msg.key.remoteJid, { text: usage }, { quoted: msg });
             return;
        }

        if(!fileName.endsWith('.js')) {
            await sock.sendMessage(msg.key.remoteJid, { text: `your file name must end with .js` }, { quoted: msg })
            return;
        }
        if(option === 'add') {
            addFile(filename, text)
            return sock.sendMessage(msg.key.remoteJid, { text: `added ${filename} successfully to commands` }, { quoted: msg })
        } else if(option === 'del') {
            if(!fs.existsSync(filename)) {
                await sock.sendMessage(msg.key.remoteJid, { text: `that file does not exist` }, { quoted: msg })
            } else {
            delfi(filename)
            return sock.sendMessage(msg.key.remoteJid, { text: `successfully deleted ${filename}` }, { quoted: msg })
            }
        }
        } catch (error) {
       await sock.sendMessage(msg.key.remoteJid, { text: `an error occored ${error}` }, { quoted: msg })
        }
    }
};
