const fs = require('fs-extra');
const path = require('path');

/**
 * Reads the last N bytes of a file.
 * @param {string} filePath Path to the file.
 * @param {number} maxBytes Number of bytes to read from the end.
 * @returns {Promise<string>} The file content (tail).
 */
async function readLastBytes(filePath, maxBytes = 1024 * 200) { 
    try {
        if (!await fs.pathExists(filePath)) return '';
        
        const stats = await fs.stat(filePath);
        const fileSize = stats.size;
        if (fileSize === 0) return '';

        const start = Math.max(0, fileSize - maxBytes);
        const length = fileSize - start;
        const buffer = Buffer.alloc(length);

        const fd = await fs.open(filePath, 'r');
        let bytesRead = 0;
        try {
            const res = await fs.read(fd, buffer, 0, length, start);
            bytesRead = res.bytesRead !== undefined ? res.bytesRead : res; 
        } finally {
            await fs.close(fd);
        }

        const content = buffer.toString('utf-8', 0, bytesRead);
        console.log(`[CrashHandler] Read ${bytesRead} bytes from log.`);
        return content;
    } catch (error) {
        console.error(`[CrashHandler] Failed to read log file tail: ${error.message}`);
        return '';
    }
}

/**
 * Analyzes the game's log content for known crash patterns.
 * @param {string} logContent The content of the latest.log file.
 * @returns {object | null} An object with crash details, or null if no known pattern is found.
 */
exports.analyzeLog = function(logContent) {
    let match;

    // 1. Config Loading Exception (Specific & Generic)
    // Matches: "ModConfig$ConfigLoadingException: ... farmersdelight-client.toml"
    // Regex logic: Find "ConfigLoadingException" OR "Failed loading config", 
    // then ignore everything until the first .toml filename found (that doesn't have spaces).
    const configErrorRegex = /(?:ConfigLoadingException|Failed loading config file).*?([^\s]+\.toml)/i;
    match = configErrorRegex.exec(logContent);
    if (match && match[1]) {
        return {
            type: 'corrupted-config',
            file: path.basename(match[1]),
            description: `Ошибка загрузки конфига: ${path.basename(match[1])}`
        };
    }

    // 2. MalformedInputException (Encoding/Null bytes error)
    // Scan specifically for this java error, then look backwards for the last mentioned TOML file.
    if (logContent.includes('MalformedInputException') || logContent.includes('ParsingException')) {
        const errorIdx = logContent.indexOf('MalformedInputException');
        // If specific error not found, try generic parsing exception location
        const searchEndIdx = errorIdx !== -1 ? errorIdx : logContent.indexOf('ParsingException');

        if (searchEndIdx !== -1) {
            // Check text ONLY before the error to find the culprit file
            const contentBeforeError = logContent.substring(0, searchEndIdx);
            // Regex: capture any string ending in .toml that doesn't contain spaces
            const tomlMatches = [...contentBeforeError.matchAll(/([^\s]+\.toml)/gi)];
            
            if (tomlMatches.length > 0) {
                // Get the very last toml file mentioned before the crash
                const culpritFile = tomlMatches[tomlMatches.length - 1][1];
                return {
                    type: 'corrupted-config',
                    file: path.basename(culpritFile),
                    description: `Файл ${path.basename(culpritFile)} поврежден (ошибка кодировки/парсинга).`
                };
            }
        }
    }

    // 3. JsonSyntaxException (Corrupted JSON)
    // Matches: "com.google.gson.JsonSyntaxException: ... path/to/example.json"
    // Regex logic: Look for JsonSyntaxException and then find the next .json file.
    const jsonSyntaxRegex = /com\.google\.gson\.JsonSyntaxException:.*?([^\s]+\.json)/i;
    match = jsonSyntaxRegex.exec(logContent);
    if (match && match[1]) {
        return {
            type: 'corrupted-config',
            file: path.basename(match[1]),
            description: `Файл конфигурации ${path.basename(match[1])} поврежден (ошибка синтаксиса).`
        };
    }

    // 4. Generic "is corrupt" message
    const corruptedCfgRegex = /Configuration file\s+.*?([^\s]+\.(?:cfg|toml|json))\s+is corrupt/i;
    match = corruptedCfgRegex.exec(logContent);
    if (match && match[1]) {
        return {
            type: 'corrupted-config',
            file: path.basename(match[1]),
            description: `Файл конфигурации ${path.basename(match[1])} поврежден.`
        };
    }

    // 5. Missing version json file (ENOENT)
    const missingVersionJsonRegex = /ENOENT: no such file or directory, open '.*[\\/]versions[\\/](.+)[\\/]\1\.json'/;
    match = missingVersionJsonRegex.exec(logContent);
    if (match && match[1]) {
        return {
            type: 'missing-version-file',
            file: match[1] + '.json',
            description: "Файл версии поврежден. Нажми 'Исправить' для восстановления."
        };
    }

    // 6. Incompatible Mods (Fabric/Quilt dependency errors)
    // Matches: "net.fabricmc.loader.impl.FormattedException: Some of your mods are incompatible"
    // OR: "[main/ERROR]: Incompatible mods found!"
    if (logContent.includes('Incompatible mods found!') || 
        logContent.includes('Some of your mods are incompatible') ||
        logContent.includes('Mod resolution failed')) {
        return {
            type: 'incompatible-mods',
            file: 'mods', // Условное имя, так как проблема во всей папке
            description: "Несовместимые моды. Нажми 'Исправить', чтобы сбросить настройки модов."
        };
    }

    return null;
}

/**
 * Analyzes a log file by reading its tail.
 * @param {string} filePath Path to the log file.
 * @returns {Promise<object | null>} Crash analysis result.
 */
exports.analyzeFile = async function(filePath) {
    const content = await readLastBytes(filePath, 1024 * 200);
    
    if (!content) {
        console.warn('[CrashHandler] Log file was empty or unreadable at crash time.');
        return null;
    }
    
    const result = exports.analyzeLog(content);
    
    if (result) {
        console.log('[CrashHandler] Analysis success:', result);
    } else {
        console.log('[CrashHandler] Analysis returned null.');
        
        // DEBUG: Print what we see around the word "Exception" to understand why regex failed
        const debugIdx = content.indexOf('Exception');
        if (debugIdx !== -1) {
            const start = Math.max(0, debugIdx - 300);
            const end = Math.min(content.length, debugIdx + 300);
            console.log('[CrashHandler DEBUG] Context around "Exception":\n', content.substring(start, end));
        } else {
             console.log('[CrashHandler DEBUG] No "Exception" word found in the last 200KB of log.');
        }
    }
    return result;
}