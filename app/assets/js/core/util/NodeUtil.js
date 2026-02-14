const { fileURLToPath } = require('url');
const { platform } = require('os');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureEncodedPath(path) {
    // ## BACKWARD COMPATIBILITY FIX ##
    return path.replace(/\\/g, '/');
}

function ensureDecodedPath(path) {
    if (path.startsWith('file://')) {
        try {
            return fileURLToPath(path);
        }
        catch (e) {
            const strippedPath = path.substring(path.startsWith('file:///') ? 8 : 7);
            if (platform() === 'win32') {
                if (strippedPath.startsWith('/'))
                    return strippedPath;
                return strippedPath.replace(/\//g, '\\');
            }
            return strippedPath;
        }
    }
    if (platform() === 'win32') {
        if (path.startsWith('/')) {
            return path;
        }
        return path.replace(/\//g, '\\');
    }
    return path;
}

module.exports = { sleep, ensureEncodedPath, ensureDecodedPath }
