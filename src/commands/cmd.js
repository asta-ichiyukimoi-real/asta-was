const fs = require('fs');
const path = require('path');
const state = require('../utils/stateManager');
const config = require('../../config');
const srcc = path.join(__dirname, '../commands');

const addFile = (filee, script) => {
    const filePath = path.join(srcc, filee);
    const writeCode = fs.writeFileSync(filePath, script);
    return writeCode;
}

const delFile = (filess) => {
    const delfi = fs.unlinkSync(filess)
}

const validation = (nameFile) => {
    if (!nameFile.includes('config.name')) return 'command does not include nname';
    if (!nameFile.includes('config.name')) return 'add permisiion to your command';
}

const checkCode = (codee) => {
    
} 

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
        try{
const chatId = msg.key.remoteJid;
const commandHandler = global.commandHandler;
const configHandler = global.configCommandHandler;
const prefix = state.getChatPrefix(chatId, configHandler?.getPrefix?.() || config.prefix);
const option = args[0]?.toLowerCase();
const filename = args[1]?.toLowerCase();
const text = args.slice(2).join(' ').trim();
const usage = `usage: \n${prefix}cmd add <filename>.js <code>\n${prefix}cmd del <filename>.js`
    if(!option || !['add', 'del'].includes(option)) {
            await sock.sendMessage(msg.key.remoteJid, { text: usage }, { quoted: msg });
            return;
    }

    if(!filename.endsWith('.js')) {
        await sock.sendMessage(msg.key.remoteJid, { text: `your file name must end with .js` }, { quoted: msg })
        return;
    }
    if(option === 'add') {
        if(!text) {
            await sock.sendMessage(msg.key.remoteJid, { text: `you must provide code to add` }, { quoted: msg })
            return;
        }
        addFile(filename, text)
        await sock.sendMessage(msg.key.remoteJid, { text: `added ${filename} successfully to commands` }, { quoted: msg })
        if (commandHandler?.loadCommands) {
                commandHandler.loadCommands();
            }
    } else if(option === 'del') {
        if(!fs.existsSync(filename)) {
            await sock.sendMessage(msg.key.remoteJid, { text: `that file does not exist` }, { quoted: msg })
        } else {
        delfi(filename)
        await sock.sendMessage(msg.key.remoteJid, { text: `successfully deleted ${filename}` }, { quoted: msg })
        if (commandHandler?.loadCommands) {
                commandHandler.loadCommands();
            }
        }
    }
        } catch (error) {
       await sock.sendMessage(msg.key.remoteJid, { text: `an error occored ${error}` }, { quoted: msg })
        }
    }
};
