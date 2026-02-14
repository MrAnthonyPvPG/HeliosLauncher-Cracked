const fs = require('fs-extra')
const path = require('path')

const NON_ASCII_REGEX = /[^\x00-\x7F]/

/**
 * Checks if a string contains non-ASCII characters.
 * @param {string} str The string to check.
 * @returns {boolean} True if the string contains non-ASCII characters, otherwise false.
 */
function hasNonAscii(str) {
    return NON_ASCII_REGEX.test(str)
}

/**
 * Checks if a string contains spaces.
 * @param {string} str The string to check.
 * @returns {boolean} True if the string contains spaces, otherwise false.
 */
function hasSpaces(str) {
    return str.includes(' ')
}

/**
 * Validates a path for stability, checking for non-ASCII characters or spaces (critical for Java/JVM).
 * @param {string} p The path to validate.
 * @returns {boolean} True if the path is stable, otherwise false.
 */
function isPathValid(p) {
    return !hasNonAscii(p) && !hasSpaces(p)
}

/**
 * Gets the standard user data directory (%APPDATA% on Windows).
 * This is the primary path used if deemed stable.
 * @param {import('electron').App} app The Electron app object.
 * @returns {string} The default data directory.
 */
function getDefaultDataPath(app) {
    const sysRoot = process.platform === 'linux' ? app.getPath('home') : app.getPath('appData')
    return path.join(sysRoot, '.foxford')
}

/**
 * Gets the secure fallback data directory (C:\.foxford).
 * WARNING: This path may require elevated privileges for the first directory creation.
 * @returns {string} The fallback data directory path.
 */
function getFallbackDataPath() {
    return path.join('C:', '.foxford')
}

/**
 * Ensures that the fallback directory exists.
 * We rely on standard user permissions here, as this path is intended to be simple.
 * @param {string} fallbackPath The path to the fallback directory.
 * @returns {Promise<void>} A promise that resolves when the directory is ready.
 */
async function ensureFallbackDirectory(fallbackPath) {
    try {
        await fs.ensureDir(fallbackPath)
    } catch (error) {
        // Log: If the folder cannot be created (e.g., EPERM error on C: drive), throw to trigger fallback failure.
        throw error
    }
}

function ensureFallbackDirectorySync(fallbackPath) {
    try {
        fs.ensureDirSync(fallbackPath)
    } catch (error) {
        // Log: If the folder cannot be created (e.g., EPERM error on C: drive), throw to trigger fallback failure.
        throw error
    }
}

/**
 * Resolves the data directory for the application.
 * Priority: 1. Stable %APPDATA% path. 2. C:\.foxford root path. 3. Original, problematic %APPDATA% path.
 *
 * @param {import('electron').App} app The Electron app object.
 * @returns {Promise<string>} A promise that resolves to the data directory path.
 */
async function resolveDataPath(app) {
    const defaultPath = getDefaultDataPath(app)

    if (isPathValid(defaultPath)) {
        // 1. Path is clean — use AppData (standard OS location).
        await fs.ensureDir(defaultPath)
        return defaultPath
    }

    // 2. Path is dirty (e.g., Cyrillic user name) — attempt the C:\.foxford fallback.
    const fallbackPath = getFallbackDataPath()

    try {
        await ensureFallbackDirectory(fallbackPath)
        return fallbackPath
    } catch (error) {
        // 3. FATAL FALLBACK FAILURE: Could not create C:\.foxford (Permission Denied likely).
        // Log: Warning about reverting to the known unstable path, which will likely lead to a Java crash.
        console.warn('Could not use C:\\.foxford fallback (Permission Denied likely). Reverting to problematic default path.', error)
        return defaultPath 
    }
}

function resolveDataPathSync(app) {
    const defaultPath = getDefaultDataPath(app)

    if (isPathValid(defaultPath)) {
        fs.ensureDirSync(defaultPath)
        return defaultPath
    }

    const fallbackPath = getFallbackDataPath()

    try {
        ensureFallbackDirectorySync(fallbackPath)
        return fallbackPath
    } catch (error) {
        // 3. FATAL FALLBACK FAILURE: Could not create C:\.foxford (Permission Denied likely).
        // Log: Warning about reverting to the known unstable path, which will likely lead to a Java crash.
        console.warn('Could not use C:\\.foxford fallback (Permission Denied likely). Reverting to problematic default path.', error)
        return defaultPath
    }
}

module.exports = {
    hasNonAscii,
    hasSpaces,
    isPathValid,
    getDefaultDataPath,
    getFallbackDataPath,
    ensureFallbackDirectory,
    ensureFallbackDirectorySync,
    resolveDataPath,
    resolveDataPathSync
}