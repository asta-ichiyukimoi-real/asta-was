const fs = require('fs');
const path = require('path');
const state = require('./stateManager');

const LOG_DIR = path.join(__dirname, '../../logs');

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

function log(type, details = {}) {
    ensureLogDir();
    const entry = {
        type,
        ...details,
        at: new Date().toISOString()
    };
    const day = entry.at.slice(0, 10);
    const file = path.join(LOG_DIR, `bot-${day}.log`);

    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
    state.addRecentLog(entry);
    return entry;
}

module.exports = {
    log
};
