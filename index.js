const config = require('./config');
const dashboard = require('./src/services/dashboard');
const stateManager = require('./src/utils/stateManager');
const { initDatabase } = require('./src/services/database');
const statsManager = require('./src/models/stats');
const { startCleanupService } = require('./src/services/cleanup');

const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const CommandHandler = require('./handlers/commandHandler');
const ChatCommandHandler = require('./handlers/chatCommandHandler');
const ReplyCommandHandler = require('./handlers/replyCommandHandler');
const ConfigCommandHandler = require('./handlers/configCommandHandler');
const health = require('./src/services/health');
const reminders = require('./src/services/reminders');
const { installMessageFont } = require('./src/utils/messageStyle');

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

function showStartup(loadedCommands, authMode = 'qr') {
    const dashboardPort = config.dashboard?.port || config.dashboardPort || 3030;
    const status = authMode === 'pairing'
        ? 'Status : Waiting for pairing code authentication'
        : 'Status : Waiting for QR authentication';
    const tip = authMode === 'pairing'
        ? 'Tip: Use the pairing code in WhatsApp > Linked devices > Link with phone number.'
        : 'Tip: Scan the QR code below with WhatsApp to connect.';

    clearScreen();
    console.log(`${style.blue}${style.bright}${APP_NAME}${style.reset}\n`);
    renderPanel('WELCOME', [
        `Version: ${APP_VERSION}`,
        status,
        `Prefix : ${config.prefix}`,
        `Commands loaded: ${loadedCommands}`,
        `Dashboard: http://127.0.0.1:${dashboardPort}`
    ]);
    console.log(`\n${style.dim}${tip}${style.reset}\n`);
}

function showConnecting(mode = 'qr') {
    clearScreen();
    if (mode === 'pairing') {
        renderPanel('AUTHENTICATION', [
            `${style.yellow}Ready to connect with pairing code.${style.reset}`,
            'Open WhatsApp > Linked devices > Link with phone number.',
            `Prefix: ${config.prefix}`
        ]);
        return;
    }

    renderPanel('AUTHENTICATION', [
        `${style.yellow}Ready to connect.${style.reset}`,
        'Open WhatsApp and scan the QR code now.',
        `Prefix: ${config.prefix}`
    ]);
}

function showConnected() {
    const dashboardPort = config.dashboard?.port || config.dashboardPort || 3030;
    clearScreen();
    console.log(`${style.green}${style.bright}CONNECTED SUCCESSFULLY${style.reset}\n`);
    renderPanel('STATUS', [
        `${style.green}Online and ready to receive commands.${style.reset}`,
        `Prefix ${style.yellow}${config.prefix}${style.reset} - type commands in chat`,
        `Dashboard http://127.0.0.1:${dashboardPort}`,
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

function normalizePairingPhoneNumber(value) {
    const number = String(value || '').trim().replace(/[\s()+-]/g, '');

    if (!number) {
        return '';
    }

    return /^\d{8,15}$/.test(number) ? number : '';
}

async function connectToWhatsApp() {
    installConsoleNoiseFilter();
    installProcessErrorHandlers();
    
    // Initialize database
    try {
        await initDatabase();
        console.log(`${style.green}✅ SQLite Database initialized${style.reset}`);
        
        // Start cleanup service (runs every 24 hours)
        startCleanupService(24);
    } catch (error) {
        console.log(`${style.red}❌ Database initialization failed: ${error.message}${style.reset}`);
    }

    const configCommandHandler = new ConfigCommandHandler(config);
    const { state, saveCreds } = await useMultiFileAuthState(configCommandHandler.get('connection.authDir', './auth_info_baileys'));
    const commandHandler = new CommandHandler(configCommandHandler);
    const chatCommandHandler = new ChatCommandHandler();
    const replyCommandHandler = new ReplyCommandHandler();

    global.commandHandler = commandHandler;
    global.chatCommandHandler = chatCommandHandler;
    global.replyCommandHandler = replyCommandHandler;
    global.configCommandHandler = configCommandHandler;

    health.startHealthMonitor(commandHandler);
    if (configCommandHandler.get('dashboard.enabled', true)) {
        dashboard.startDashboard(configCommandHandler.getDashboardPort());
    }

    const uniqueCommands = Array.from(new Set(commandHandler.commands.values())).length;

    const groupMetadataCache = new Map();
    const rawPairingPhoneNumber = configCommandHandler.get('connection.pairingPhoneNumber', '');
    const pairingPhoneNumber = normalizePairingPhoneNumber(rawPairingPhoneNumber);
    let pairingCodeRequested = false;

    showStartup(uniqueCommands, pairingPhoneNumber ? 'pairing' : 'qr');
    if (rawPairingPhoneNumber && !pairingPhoneNumber) {
        console.log(`${style.yellow}Invalid pairingPhoneNumber in config. Use digits only with country code, for example 23491564521. Falling back to QR.${style.reset}`);
    }

    const sock = makeWASocket({
        auth: state,
        logger: quietLogger,
        markOnlineOnConnect: configCommandHandler.get('connection.markOnlineOnConnect', false),
        syncFullHistory: configCommandHandler.get('connection.syncFullHistory', false),
        shouldSyncHistoryMessage: () => false,
        cachedGroupMetadata: async (jid) => {
            const cached = groupMetadataCache.get(jid);
            if (cached) return cached;

            try {
                const metadata = await sock.groupMetadata(jid);
                if (metadata) {
                    groupMetadataCache.set(jid, metadata);
                }
                return metadata;
            } catch (error) {
                logger.log('cached_group_metadata_error', {
                    jid,
                    error: error.message,
                    code: error.data || error.output?.statusCode
                });
                return null;
            }
        }
    });
    installMessageFont(sock);

    sock.ev.on('groups.upsert', async (event) => {
        try {
            logger.log('groups_upsert_received', {
                rawEvent: JSON.stringify(event || {}),
                groupId: event?.id || event?.jid || null,
                subject: event?.subject || null
            });
        } catch (error) {
            logger.log('groups_upsert_error', {
                error: error.message,
                code: error.data || error.output?.statusCode
            });
        }
    });

    sock.ev.on('groups.update', async ([event]) => {
        try {
            logger.log('groups_update_received', {
                rawEvent: JSON.stringify(event || {}),
                groupId: event?.id || null,
                subject: event?.subject || null,
                announce: event?.announce || null,
                restrict: event?.restrict || null
            });

            if (!event?.id) return;
            const metadata = await sock.groupMetadata(event.id);
            if (metadata) {
                groupMetadataCache.set(event.id, metadata);
            }
        } catch (error) {
            logger.log('groups_update_group_metadata_error', {
                error: error.message,
                code: error.data || error.output?.statusCode
            });
        }
    });

    sock.ev.on('group-participants.update', async (event) => {
        try {
            logger.log('group_participants_update_received_from_index', {
                rawEvent: JSON.stringify(event || {}),
                groupId: event?.id || null,
                action: event?.action || null,
                participants: (event?.participants || []).map((participant) => {
                    if (typeof participant === 'string') return participant;
                    return participant?.id || participant?.lid || participant?.phoneNumber || null;
                })
            });

            if (!event?.id) return;
            const metadata = await sock.groupMetadata(event.id);
            if (metadata) {
                groupMetadataCache.set(event.id, metadata);
            }
        } catch (error) {
            logger.log('group_participants_update_group_metadata_error', {
                error: error.message,
                code: error.data || error.output?.statusCode
            });
        }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const reason = lastDisconnect?.error?.message
            || lastDisconnect?.error?.output?.statusCode
            || lastDisconnect?.error?.constructor?.name
            || 'Unknown disconnect';

        console.log(`${style.dim}[Baileys] connection=${connection} qr=${Boolean(qr)} reason=${reason}${style.reset}`);
        console.log('[Baileys raw update]', JSON.stringify(update, null, 2));

        if (qr) {
            if (pairingPhoneNumber && !sock.authState.creds.registered) {
                if (pairingCodeRequested) {
                    return;
                }

                pairingCodeRequested = true;
                showConnecting('pairing');
                console.log(`${style.yellow}Pairing challenge received. Requesting code for ${pairingPhoneNumber}.${style.reset}`);

                try {
                    const code = await sock.requestPairingCode(pairingPhoneNumber);
                    console.log(`${style.green}Pairing code: ${style.bright}${code}${style.reset}`);
                    console.log(`${style.dim}Enter this code in WhatsApp > Linked devices > Link with phone number.${style.reset}`);
                } catch (error) {
                    pairingCodeRequested = false;
                    console.log(`${style.red}Pairing code failed: ${error.message}${style.reset}`);
                    console.log(`${style.yellow}Falling back to QR authentication.${style.reset}`);
                    try {
                        qrcode.generate(qr, { small: true });
                    } catch (qrError) {
                        console.log(`${style.red}QR renderer failed: ${qrError.message}${style.reset}`);
                        console.log(qr);
                    }
                }
                return;
            }

            showConnecting();
            console.log(`${style.yellow}QR challenge received. Scan it from the phone now.${style.reset}`);
            try {
                qrcode.generate(qr, { small: true });
            } catch (error) {
                console.log(`${style.red}QR renderer failed: ${error.message}${style.reset}`);
                console.log(qr);
            }
            return;
        }

        if (connection === 'close') {
            const disconnectCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? disconnectCode !== DisconnectReason.loggedOut
                : true;

            console.log(`${style.yellow}[close] code=${disconnectCode}, reason=${reason}${style.reset}`);

            if (shouldReconnect) {
                stateManager.updateHealth({
                    status: 'reconnecting',
                    reconnects: (stateManager.getState().health.reconnects || 0) + 1,
                    lastError: reason
                });
                logger.log('reconnect', { reason, update: JSON.stringify(update) });
                showReconnect(reason);
                setTimeout(() => connectToWhatsApp(), configCommandHandler.get('connection.reconnectDelayMs', 2000));
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
            logger.log('connected_socket_user', {
                jid: sock?.user?.id || null,
                lid: sock?.user?.lid || null,
                phone: sock?.user?.phone || null,
                name: sock?.user?.name || null
            });
            reminders.startReminderService(sock);
            showConnected();
        }
    });

    sock.ev.on('ws.close', (args) => {
        logger.log('ws_close_event_test', {
            payload: JSON.stringify(args || {}),
            timestamp: new Date().toISOString()
        });
    });

    sock.ev.on('ws.open', (args) => {
        logger.log('ws_open_event_test', {
            payload: JSON.stringify(args || {}),
            timestamp: new Date().toISOString()
        });
    });

    sock.ev.on('creds.update', saveCreds);
    require('./src/events/groupLifecycle')(sock, {
        startupTimeMs: STARTED_AT,
        startupTimeSeconds: STARTED_AT_SECONDS,
        configCommandHandler
    });
    require('./src/events/message')(sock, commandHandler, chatCommandHandler, replyCommandHandler, {
        startupTimeMs: STARTED_AT,
        startupTimeSeconds: STARTED_AT_SECONDS,
        configCommandHandler
    });
}

connectToWhatsApp();
