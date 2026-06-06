const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '../../bot-state.json');

const DEFAULT_STATE = {
    usage: {
        totalCommands: 0,
        commands: {}
    },
    welcome: {
        enabled: true,
        message: 'Welcome to the group, {{name}}! Please introduce yourself and enjoy the chat.'
    },
    farewell: {
        enabled: true,
        message: 'Goodbye {{name}}! Thanks for being part of the group.'
    },
    autoReply: {
        enabled: true,
        keywords: {
            hello: 'Hey there! Need help? Send !help to see what I can do.',
            hi: 'Hello! Send !help if you want a list of commands.',
            help: 'Need help? Use !help to get the command list.',
            rules: 'Please be respectful and keep the chat friendly.'
        }
    },
    moderation: {
        groups: {}
    },
    asta: {
        conversations: {}
    },
    customCommands: {
        chats: {}
    },
    commandControls: {
        chats: {},
        runtimeConfig: {}
    },
    chatSettings: {
        chats: {}
    },
    reminders: {
        items: {}
    },
    roles: {
        chats: {}
    },
    health: {
        status: 'starting',
        startedAt: null,
        lastConnectedAt: null,
        lastError: null,
        reconnects: 0,
        commandsRun: 0
    },
    logs: {
        recent: []
    }
};

function mergeDefaults(target, defaults) {
    const source = target && typeof target === 'object' ? target : {};
    const output = {};

    Object.keys(defaults).forEach((key) => {
        if (defaults[key] && typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
            output[key] = mergeDefaults(source[key], defaults[key]);
        } else {
            output[key] = source[key] === undefined ? defaults[key] : source[key];
        }
    });

    Object.keys(source).forEach((key) => {
        if (output[key] === undefined) {
            output[key] = source[key];
        }
    });

    return output;
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        console.error('Failed to save bot state:', error);
    }
    return state;
}

function loadState() {
    try {
        if (!fs.existsSync(STATE_PATH)) {
            return saveState(DEFAULT_STATE);
        }

        const raw = fs.readFileSync(STATE_PATH, 'utf8');
        const state = mergeDefaults(JSON.parse(raw), DEFAULT_STATE);
        return state;
    } catch (error) {
        return saveState(DEFAULT_STATE);
    }
}

function getState() {
    return loadState();
}

function incrementCommandUsage(commandName) {
    const state = loadState();
    state.usage.totalCommands += 1;
    state.usage.commands[commandName] = (state.usage.commands[commandName] || 0) + 1;
    return saveState(state);
}

function setWelcomeEnabled(enabled) {
    const state = loadState();
    state.welcome.enabled = Boolean(enabled);
    return saveState(state);
}

function setFarewellEnabled(enabled) {
    const state = loadState();
    state.farewell.enabled = Boolean(enabled);
    return saveState(state);
}

function setAutoReplyEnabled(enabled) {
    const state = loadState();
    state.autoReply.enabled = Boolean(enabled);
    return saveState(state);
}

function defaultGroupModeration() {
    return {
        antiLink: false,
        badWords: [],
        warnings: {}
    };
}

function getGroupModeration(groupId) {
    const state = loadState();
    return {
        ...defaultGroupModeration(),
        ...(state.moderation.groups[groupId] || {})
    };
}

function setGroupModeration(groupId, updates) {
    const state = loadState();
    const current = {
        ...defaultGroupModeration(),
        ...(state.moderation.groups[groupId] || {})
    };
    state.moderation.groups[groupId] = {
        ...current,
        ...updates
    };
    return saveState(state).moderation.groups[groupId];
}

function addWarning(groupId, userId) {
    const state = loadState();
    const current = {
        ...defaultGroupModeration(),
        ...(state.moderation.groups[groupId] || {})
    };
    current.warnings[userId] = (current.warnings[userId] || 0) + 1;
    state.moderation.groups[groupId] = current;
    saveState(state);
    return current.warnings[userId];
}

function clearWarnings(groupId, userId) {
    const state = loadState();
    const current = {
        ...defaultGroupModeration(),
        ...(state.moderation.groups[groupId] || {})
    };

    if (userId) {
        delete current.warnings[userId];
    } else {
        current.warnings = {};
    }

    state.moderation.groups[groupId] = current;
    return saveState(state);
}

function getAstaConversation(conversationId) {
    const state = loadState();
    return state.asta.conversations[conversationId] || {
        resetCount: 0,
        history: []
    };
}

function addAstaMessage(conversationId, role, text) {
    const state = loadState();
    const current = state.asta.conversations[conversationId] || {
        resetCount: 0,
        history: []
    };

    current.history.push({
        role,
        text: String(text).slice(0, 1000),
        at: new Date().toISOString()
    });
    current.history = current.history.slice(-12);
    state.asta.conversations[conversationId] = current;
    return saveState(state).asta.conversations[conversationId];
}

function resetAstaConversation(conversationId) {
    const state = loadState();
    const current = state.asta.conversations[conversationId] || {
        resetCount: 0,
        history: []
    };

    state.asta.conversations[conversationId] = {
        resetCount: current.resetCount + 1,
        history: []
    };
    return saveState(state).asta.conversations[conversationId];
}

function getChatCustomCommands(chatId) {
    const state = loadState();
    return state.customCommands.chats[chatId] || {};
}

function setCustomCommand(chatId, name, response) {
    const state = loadState();
    const commands = state.customCommands.chats[chatId] || {};
    commands[name] = {
        response,
        updatedAt: new Date().toISOString()
    };
    state.customCommands.chats[chatId] = commands;
    return saveState(state).customCommands.chats[chatId][name];
}

function removeCustomCommand(chatId, name) {
    const state = loadState();
    const commands = state.customCommands.chats[chatId] || {};
    delete commands[name];
    state.customCommands.chats[chatId] = commands;
    return saveState(state);
}

function getCustomCommand(chatId, name) {
    const commands = getChatCustomCommands(chatId);
    return commands[name] || null;
}

function getDisabledCommands(chatId) {
    const state = loadState();
    return state.commandControls.chats[chatId]?.disabled || [];
}

function getDisabledCategories(chatId) {
    const state = loadState();
    return state.commandControls.chats[chatId]?.disabledCategories || [];
}

function setCommandDisabled(chatId, commandName, disabled) {
    const state = loadState();
    const controls = state.commandControls.chats[chatId] || { disabled: [] };
    const names = new Set(controls.disabled || []);

    if (disabled) {
        names.add(commandName);
    } else {
        names.delete(commandName);
    }

    controls.disabled = Array.from(names).sort();
    state.commandControls.chats[chatId] = controls;
    return saveState(state).commandControls.chats[chatId].disabled;
}

function isCommandDisabled(chatId, commandName) {
    return getDisabledCommands(chatId).includes(commandName);
}

function setCategoryDisabled(chatId, category, disabled) {
    const state = loadState();
    const controls = state.commandControls.chats[chatId] || { disabled: [], disabledCategories: [] };
    const categories = new Set(controls.disabledCategories || []);

    if (disabled) {
        categories.add(category);
    } else {
        categories.delete(category);
    }

    controls.disabledCategories = Array.from(categories).sort();
    state.commandControls.chats[chatId] = controls;
    return saveState(state).commandControls.chats[chatId].disabledCategories;
}

function isCategoryDisabled(chatId, category) {
    return getDisabledCategories(chatId).includes(category);
}

function getRuntimeConfig() {
    const state = loadState();
    return state.commandControls.runtimeConfig || {};
}

function setRuntimeConfig(path, value) {
    const state = loadState();
    state.commandControls.runtimeConfig = state.commandControls.runtimeConfig || {};
    state.commandControls.runtimeConfig[path] = value;
    return saveState(state).commandControls.runtimeConfig;
}

function deleteRuntimeConfig(path) {
    const state = loadState();
    state.commandControls.runtimeConfig = state.commandControls.runtimeConfig || {};
    delete state.commandControls.runtimeConfig[path];
    return saveState(state).commandControls.runtimeConfig;
}

function defaultChatSettings() {
    return {
        prefix: null,
        welcomeEnabled: null,
        welcomeMessage: null,
        farewellEnabled: null,
        farewellMessage: null,
        autoReplyEnabled: null
    };
}

function getChatSettings(chatId) {
    const state = loadState();
    return {
        ...defaultChatSettings(),
        ...(state.chatSettings.chats[chatId] || {})
    };
}

function setChatSettings(chatId, updates) {
    const state = loadState();
    state.chatSettings.chats[chatId] = {
        ...defaultChatSettings(),
        ...(state.chatSettings.chats[chatId] || {}),
        ...updates
    };
    return saveState(state).chatSettings.chats[chatId];
}

function getChatPrefix(chatId, fallbackPrefix) {
    return getChatSettings(chatId).prefix || fallbackPrefix;
}

function addReminder(reminder) {
    const state = loadState();
    const id = reminder.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    state.reminders.items[id] = {
        ...reminder,
        id,
        createdAt: reminder.createdAt || new Date().toISOString(),
        sent: false
    };
    return saveState(state).reminders.items[id];
}

function getPendingReminders() {
    const state = loadState();
    return Object.values(state.reminders.items).filter(reminder => !reminder.sent);
}

function markReminderSent(id) {
    const state = loadState();
    if (state.reminders.items[id]) {
        state.reminders.items[id].sent = true;
        state.reminders.items[id].sentAt = new Date().toISOString();
    }
    return saveState(state);
}

function removeReminder(id) {
    const state = loadState();
    delete state.reminders.items[id];
    return saveState(state);
}

function getChatRoles(chatId) {
    const state = loadState();
    return state.roles.chats[chatId] || {
        mods: [],
        trusted: [],
        banned: []
    };
}

function setUserRole(chatId, userId, role, enabled) {
    const state = loadState();
    const roles = {
        mods: [],
        trusted: [],
        banned: [],
        ...(state.roles.chats[chatId] || {})
    };
    const roleKeys = {
        mod: 'mods',
        trusted: 'trusted',
        banned: 'banned'
    };
    const key = roleKeys[role];
    if (!roles[key]) throw new Error(`Unknown role: ${role}`);

    const users = new Set(roles[key]);
    if (enabled) users.add(userId);
    else users.delete(userId);

    roles[key] = Array.from(users).sort();
    state.roles.chats[chatId] = roles;
    return saveState(state).roles.chats[chatId];
}

function hasRole(chatId, userId, role) {
    const roles = getChatRoles(chatId);
    const roleKeys = {
        mod: 'mods',
        trusted: 'trusted',
        banned: 'banned'
    };
    return (roles[roleKeys[role]] || []).includes(userId);
}

function updateHealth(updates) {
    const state = loadState();
    state.health = {
        ...state.health,
        ...updates
    };
    return saveState(state).health;
}

function addRecentLog(entry) {
    const state = loadState();
    state.logs.recent.unshift({
        ...entry,
        at: entry.at || new Date().toISOString()
    });
    state.logs.recent = state.logs.recent.slice(0, 100);
    return saveState(state).logs.recent[0];
}

module.exports = {
    getState,
    incrementCommandUsage,
    setWelcomeEnabled,
    setFarewellEnabled,
    setAutoReplyEnabled,
    getGroupModeration,
    setGroupModeration,
    addWarning,
    clearWarnings,
    getAstaConversation,
    addAstaMessage,
    resetAstaConversation,
    getChatCustomCommands,
    setCustomCommand,
    removeCustomCommand,
    getCustomCommand,
    getDisabledCommands,
    getDisabledCategories,
    setCommandDisabled,
    isCommandDisabled,
    setCategoryDisabled,
    isCategoryDisabled,
    getRuntimeConfig,
    setRuntimeConfig,
    deleteRuntimeConfig,
    getChatSettings,
    setChatSettings,
    getChatPrefix,
    addReminder,
    getPendingReminders,
    markReminderSent,
    removeReminder,
    getChatRoles,
    setUserRole,
    hasRole,
    updateHealth,
    addRecentLog
};
