const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const BACKUP_DIR = path.join(ROOT, 'backups');

function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

function createBackup() {
    ensureBackupDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(BACKUP_DIR, `bot-state-${stamp}.json`);
    fs.copyFileSync(path.join(ROOT, 'bot-state.json'), file);
    return file;
}

function listBackups() {
    ensureBackupDir();
    return fs.readdirSync(BACKUP_DIR)
        .filter(file => file.endsWith('.json'))
        .sort()
        .reverse();
}

function restoreBackup(fileName) {
    ensureBackupDir();
    const safeName = path.basename(fileName);
    const source = path.join(BACKUP_DIR, safeName);
    if (!fs.existsSync(source)) {
        throw new Error('Backup file not found');
    }

    const currentBackup = createBackup();
    fs.copyFileSync(source, path.join(ROOT, 'bot-state.json'));
    return currentBackup;
}

module.exports = {
    createBackup,
    listBackups,
    restoreBackup
};
