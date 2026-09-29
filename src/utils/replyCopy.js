const DEFAULT_REPLY_VARIANTS = {
    autoReply: {
        hello: [
            'Hello! It is good to hear from you. If you need a hand, send {{prefix}}help to browse the commands.',
            'Hi there! I am here if you need anything. You can send {{prefix}}help to see what I can do.',
            'Hello, and welcome! Whenever you are ready, {{prefix}}help has a guide to the available commands.'
        ],
        hi: [
            'Hi! I hope your day is going well. Send {{prefix}}help if you would like to explore the bot.',
            'Hello there! I am ready to help. Use {{prefix}}help to browse the available commands.',
            'Hey! It is nice to hear from you. You can send {{prefix}}help whenever you need a hand.'
        ],
        help: [
            'I am happy to help. Send {{prefix}}help for commands anyone can use, or {{prefix}}adminhelp if you are a bot admin.',
            'Of course. The {{prefix}}help command lists public commands; bot admins can use {{prefix}}adminhelp for the full list.',
            'You can browse public commands with {{prefix}}help. If you are a bot admin, {{prefix}}adminhelp shows the complete list.'
        ],
        rules: [
            'Please treat one another with respect, keep the conversation constructive, and help make this a welcoming group.',
            'Let us keep the group friendly and considerate: respect others, stay constructive, and give everyone room to participate.',
            'A gentle reminder to be kind, respectful, and thoughtful toward everyone in the group.'
        ]
    },
    welcome: [
        'Welcome to the group, {{name}}! We are glad you are here. Please introduce yourself and feel free to ask if you need help.',
        'A warm welcome to {{name}}! We are happy to have you with us. Settle in, and let us know if we can help.',
        'Welcome, {{name}}! It is lovely to have you in {{group}}. We hope you feel at home here.'
    ],
    farewell: [
        'Goodbye, {{name}}. Thank you for being part of the group; you will always be welcome back.',
        'Take care, {{name}}! We appreciate the time you spent with us and wish you all the best.',
        'Farewell, {{name}}. It was good having you here, and we wish you well in what comes next.'
    ]
};

const ASSISTANT_TONE_GUIDANCE = [
    'Respond in a professional, warm, emotionally considerate, and natural voice.',
    'Acknowledge feelings when relevant, but do not overstate emotion or claim human experiences.',
    'Be accurate, helpful, and clear; state uncertainty honestly and avoid repetitive greetings or sign-offs.'
].join(' ');

const LEGACY_DEFAULTS = {
    autoReply: {
        hello: 'Hey there! Need help? Send !help to see what I can do.',
        hi: 'Hello! Send !help if you want a list of commands.',
        help: 'Need help? Use !help to get the command list.',
        rules: [
            'Please be respectful and keep the chat friendly.',
            'Please be respectful and keep the chat friendly. 😊'
        ]
    },
    welcome: 'Welcome to the group, {{name}}! Please introduce yourself and enjoy the chat.',
    farewell: 'Goodbye {{name}}! Thanks for being part of the group.'
};

function chooseReply(responses, random = Math.random) {
    if (typeof responses === 'string') return responses;
    if (!Array.isArray(responses)) return '';

    const choices = responses.filter(response => typeof response === 'string' && response.trim());
    if (!choices.length) return '';

    const randomValue = Number(random());
    const index = Number.isFinite(randomValue)
        ? Math.min(choices.length - 1, Math.max(0, Math.floor(randomValue * choices.length)))
        : 0;
    return choices[index];
}

function chooseConfiguredReply(value, defaults, legacyDefault, random = Math.random) {
    if (Array.isArray(value)) return chooseReply(value, random);
    const legacyDefaults = Array.isArray(legacyDefault) ? legacyDefault : [legacyDefault];
    if (typeof value === 'string' && legacyDefaults.includes(value)) {
        return chooseReply(defaults, random);
    }
    return typeof value === 'string' ? value : '';
}

function chooseAutoReply(keyword, value, prefix = '.', random = Math.random) {
    const variants = DEFAULT_REPLY_VARIANTS.autoReply[keyword];
    const legacyDefault = LEGACY_DEFAULTS.autoReply[keyword];
    return chooseConfiguredReply(value, variants, legacyDefault, random).replace(/\{\{prefix\}\}/g, prefix);
}

function chooseWelcomeReply(value, random = Math.random) {
    return chooseConfiguredReply(value, DEFAULT_REPLY_VARIANTS.welcome, LEGACY_DEFAULTS.welcome, random);
}

function chooseFarewellReply(value, random = Math.random) {
    return chooseConfiguredReply(value, DEFAULT_REPLY_VARIANTS.farewell, LEGACY_DEFAULTS.farewell, random);
}

module.exports = {
    chooseReply,
    chooseAutoReply,
    chooseWelcomeReply,
    chooseFarewellReply,
    DEFAULT_REPLY_VARIANTS,
    ASSISTANT_TONE_GUIDANCE
};
