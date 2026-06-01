const state = require('../utils/stateManager');
const logger = require('../utils/logger');

const timers = new Map();
const MAX_TIMEOUT = 2 ** 31 - 1;

function scheduleReminder(sock, reminder) {
    if (timers.has(reminder.id) || reminder.sent) return;

    const runAt = new Date(reminder.runAt).getTime();
    const delay = Math.max(0, runAt - Date.now());

    if (delay > MAX_TIMEOUT) return;

    const timeout = setTimeout(async () => {
        timers.delete(reminder.id);
        const handle = reminder.userId.split('@')[0];
        try {
            await sock.sendMessage(reminder.chatId, {
                text: `*Reminder for @${handle}*\n\n${reminder.text}`,
                mentions: [reminder.userId]
            });
            state.markReminderSent(reminder.id);
            logger.log('reminder_sent', { chatId: reminder.chatId, userId: reminder.userId, reminderId: reminder.id });
        } catch (error) {
            logger.log('reminder_error', {
                chatId: reminder.chatId,
                userId: reminder.userId,
                reminderId: reminder.id,
                error: error.message
            });
        }
    }, delay);

    timers.set(reminder.id, timeout);
}

function startReminderService(sock) {
    state.getPendingReminders().forEach(reminder => scheduleReminder(sock, reminder));

    setInterval(() => {
        state.getPendingReminders().forEach(reminder => scheduleReminder(sock, reminder));
    }, 60 * 1000);
}

function createReminder(sock, reminder) {
    const saved = state.addReminder(reminder);
    scheduleReminder(sock, saved);
    return saved;
}

module.exports = {
    startReminderService,
    createReminder
};
