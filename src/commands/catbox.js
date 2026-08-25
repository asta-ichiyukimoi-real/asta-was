module.exports = {
    config: {
        name: 'imgurl',
        aliases: ['imageurl', 'tourl', 'uploadimg', 'upimg', 'upimg2', 'catbox'],
        version: '2.0.0',
        description: 'Uploads an image and returns a direct URL',
        usage: 'imgurl',
        examples: ['imgurl', 'reply to an image with .imgurl'],
        permissions: 0,
        category: 'utility'
    },

    onRun: async (sock, msg) => {
        await sock.sendMessage(msg.key.remoteJid, {
            text: [
                '*Image To URL*',
                '',
                'This command needs an upload provider before it can create public image links.',
                '',
                'Recommended usage after setup:',
                '1. Send an image with `.imgurl` as the caption.',
                '2. Or reply to an image with `.imgurl`.',
                '3. The bot uploads it and sends back the URL.'
            ].join('\n')
        }, { quoted: msg });
    }
};
