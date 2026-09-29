const fs = require('fs');
const path = require('path');

const LOCAL_PERMISSIONS_PATH = path.resolve(__dirname, '..', '..', '.local-permissions.json');

function validatePermissionOverrides(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Local permission overrides must be a JSON object.');
    }

    for (const key of ['owner']) {
        if (value[key] !== undefined && typeof value[key] !== 'string') {
            throw new Error(`Local permission override "${key}" must be a string.`);
        }
    }

    for (const key of ['owners', 'admins']) {
        if (value[key] !== undefined
            && (!Array.isArray(value[key]) || value[key].some(item => typeof item !== 'string'))) {
            throw new Error(`Local permission override "${key}" must be an array of strings.`);
        }
    }

    return {
        ...(value.owner !== undefined ? { owner: value.owner } : {}),
        ...(value.owners !== undefined ? { owners: value.owners } : {}),
        ...(value.admins !== undefined ? { admins: value.admins } : {})
    };
}

function loadLocalPermissions() {
    if (!fs.existsSync(LOCAL_PERMISSIONS_PATH)) return {};

    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(LOCAL_PERMISSIONS_PATH, 'utf8'));
    } catch (error) {
        throw new Error(`Could not load ${LOCAL_PERMISSIONS_PATH}: ${error.message}`);
    }

    return validatePermissionOverrides(parsed);
}

function saveLocalPermissions(overrides) {
    const validated = validatePermissionOverrides(overrides);
    const tempPath = `${LOCAL_PERMISSIONS_PATH}.${process.pid}.${Date.now()}.tmp`;

    try {
        fs.writeFileSync(tempPath, `${JSON.stringify(validated, null, 2)}\n`, {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600
        });
        fs.renameSync(tempPath, LOCAL_PERMISSIONS_PATH);
    } catch (error) {
        if (fs.existsSync(tempPath)) {
            try {
                fs.unlinkSync(tempPath);
            } catch (cleanupError) {
                error.message += `; temporary file cleanup failed: ${cleanupError.message}`;
            }
        }
        throw new Error(`Could not save local owner/admin IDs: ${error.message}`);
    }
}

module.exports = {
    loadLocalPermissions,
    saveLocalPermissions
};
