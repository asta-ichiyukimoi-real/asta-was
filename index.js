const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const CommandHandler = require('./handlers/commandHandler');
const ChatCommandHandler = require('./handlers/chatCommandHandler');
const ReplyCommandHandler = require('./handlers/replyCommandHandler');
const health = require('./src/services/health');
const dashboard = require('./src/services/dashboard');
const reminders = require('./src/services/reminders');
const stateManager = require('./src/utils/stateManager');
const logger = require('./src/utils/logger');

const style = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m'
};

const APP_NAME = 'Asta Bot';
const APP_VERSION = '1.0.0';
const STARTED_AT = Date.now();
const STARTED_AT_SECONDS = Math.floor(STARTED_AT / 1000);

function installConsoleNoiseFilter() {
    if (console.__astaNoiseFilterInstalled) {
        return;
    }

    const ignoredMessages = new Set([
        'Closing open session in favor of incoming prekey bundle',
        'Closing session:',
        'Decrypted message with closed session.'
    ]);

    ['info', 'warn'].forEach((method) => {
        const original = console[method].bind(console);
        console[method] = (...args) => {
            if (typeof args[0] === 'string' && ignoredMessages.has(args[0])) {
                return;
            }

            original(...args);
        };
    });

    console.__astaNoiseFilterInstalled = true;
}

function installProcessErrorHandlers() {
    if (process.__astaErrorHandlersInstalled) {
        return;
    }

    function formatAsyncError(error) {
        if (!error) return 'Unknown async error';
        if (typeof error === 'string') return error;
        if (error.message) return error.message;
        if (error.type) return `${error.constructor?.name || 'Event'}: ${error.type}`;
        return error.constructor?.name || String(error);
    }

    process.on('unhandledRejection', (error) => {
        const message = formatAsyncError(error);
        logger.log('unhandled_rejection', {
            error: message,
            code: error?.data || error?.output?.statusCode
        });
        stateManager.updateHealth({ lastError: message });
        console.log(`${style.red}Handled async error:${style.reset} ${message}`);
    });

    process.__astaErrorHandlersInstalled = true;
}

function clearScreen() {
    process.stdout.write('\x1Bc');
}

function renderPanel(title, lines) {
    const maxLineLength = Math.max(title.length, ...lines.map(line => line.length));
    const width = maxLineLength + 4;
    console.log(`${style.cyan}+${'-'.repeat(width)}+${style.reset}`);
    console.log(`${style.cyan}|${style.reset} ${style.bright}${title}${style.reset}${' '.repeat(width - title.length - 1)}${style.cyan}|${style.reset}`);
    console.log(`${style.cyan}+${'-'.repeat(width)}+${style.reset}`);
    lines.forEach((line) => {
        const padded = ' '.repeat(width - line.length - 1);
        console.log(`${style.cyan}|${style.reset} ${line}${padded}${style.cyan}|${style.reset}`);
    });
    console.log(`${style.cyan}+${'-'.repeat(width)}+${style.reset}`);
}

function showStartup(loadedCommands) {
    clearScreen();
    console.log(`${style.blue}${style.bright}${APP_NAME}${style.reset}\n`);
    renderPanel('WELCOME', [
        `Version: ${APP_VERSION}`,
        'Status : Waiting for QR authentication',
        `Prefix : ${config.prefix}`,
        `Commands loaded: ${loadedCommands}`,
        `Dashboard: http://127.0.0.1:${config.dashboardPort || 3030}`
    ]);
    console.log(`\n${style.dim}Tip: Scan the QR code below with WhatsApp to connect.${style.reset}\n`);
}

function showConnecting() {
    clearScreen();
    renderPanel('AUTHENTICATION', [
        `${style.yellow}Ready to connect.${style.reset}`,
        'Open WhatsApp and scan the QR code now.',
        `Prefix: ${config.prefix}`
    ]);
}

function showConnected() {
    clearScreen();
    console.log(`${style.green}${style.bright}CONNECTED SUCCESSFULLY${style.reset}\n`);
    renderPanel('STATUS', [
        `${style.green}Online and ready to receive commands.${style.reset}`,
        `Prefix ${style.yellow}${config.prefix}${style.reset} - type commands in chat`,
        `Dashboard http://127.0.0.1:${config.dashboardPort || 3030}`,
        'Use help to list available commands'
    ]);
}

function showReconnect(reason) {
    clearScreen();
    renderPanel('RECONNECTING', [
        `${style.yellow}Lost connection.${style.reset}`,
        `Reason: ${reason || 'Unknown'}`,
        'Trying to reconnect now...'
    ]);
}

const quietLogger = {
    child: () => quietLogger,
    fatal: () => {},
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
    trace: () => {}
};

async function connectToWhatsApp() {
    installConsoleNoiseFilter();
    installProcessErrorHandlers();

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const commandHandler = new CommandHandler();
    const chatCommandHandler = new ChatCommandHandler();
    const replyCommandHandler = new ReplyCommandHandler();

    global.commandHandler = commandHandler;
    global.chatCommandHandler = chatCommandHandler;
    global.replyCommandHandler = replyCommandHandler;

    health.startHealthMonitor(commandHandler);
    dashboard.startDashboard(config.dashboardPort || 3030);

    const uniqueCommands = Array.from(new Set(commandHandler.commands.values())).length;
    showStartup(uniqueCommands);

    const sock = makeWASocket({
        auth: state,
        logger: quietLogger,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            showConnecting();
            qrcode.generate(qr, { small: true });
            return;
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                : true;

            if (shouldReconnect) {
                stateManager.updateHealth({
                    status: 'reconnecting',
                    reconnects: (stateManager.getState().health.reconnects || 0) + 1,
                    lastError: lastDisconnect?.error?.message || 'Unknown disconnect'
                });
                logger.log('reconnect', { reason: lastDisconnect?.error?.message });
                showReconnect(lastDisconnect?.error?.message);
                setTimeout(() => connectToWhatsApp(), 2000);
            } else {
                stateManager.updateHealth({ status: 'logged_out' });
                logger.log('logged_out');
                console.log(`${style.red}Logged out. Please delete auth_info_baileys and re-scan the QR.${style.reset}`);
            }
        } else if (connection === 'open') {
            stateManager.updateHealth({
                status: 'online',
                lastConnectedAt: new Date().toISOString()
            });
            logger.log('connected');
            reminders.startReminderService(sock);
            showConnected();
        }
    });

    sock.ev.on('creds.update', saveCreds);
    require('./src/events/message')(sock, commandHandler, chatCommandHandler, replyCommandHandler, {
        startupTimeMs: STARTED_AT,
        startupTimeSeconds: STARTED_AT_SECONDS
    });
}

connectToWhatsApp();
