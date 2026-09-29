const helpCommand = require('./help');

module.exports = {
    config: {
        name: 'adminhelp',
        aliases: ['fullhelp'],
        version: '1.0.0',
        description: 'Shows the full command list, including restricted commands',
        usage: 'adminhelp [command_name]',
        examples: ['adminhelp', 'adminhelp adminid'],
        permissions: 1,
        cooldown: 0,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => helpCommand.onRun(sock, msg, args, true)
};
