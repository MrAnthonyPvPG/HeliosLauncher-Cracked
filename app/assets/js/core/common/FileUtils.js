const fs = require('fs/promises')
const { createReadStream } = require('fs')
const crypto = require('crypto')
const path = require('path')
const AdmZip = require('adm-zip')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

async function validateLocalFile(filePath, algo, hash) {
    if (!hash) return true; // No hash to check
    try {
        await fs.access(filePath);
    } catch(e) {
        return false;
    }

    return new Promise((resolve, reject) => {
        const stream = createReadStream(filePath);
        // Normalize algorithm name
        const algorithm = algo.toLowerCase().replace('-', '');
        const hashStream = crypto.createHash(algorithm);

        stream.on('error', err => {
            // File read error
            resolve(false);
        });

        hashStream.on('error', err => {
            // Algorithm error
             resolve(false);
        });

        stream.pipe(hashStream).on('finish', () => {
            const computedHash = hashStream.read().toString('hex');
            resolve(computedHash === hash.toLowerCase());
        });
    });
}

async function safeEnsureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true })
}

function getLibraryDir(commonDir) {
    return path.join(commonDir, 'libraries');
}

function getVersionDir(commonDir) {
    return path.join(commonDir, 'versions');
}

function getVersionJsonPath(commonDir, version) {
    return path.join(getVersionDir(commonDir), version, `${version}.json`);
}

function getVersionJarPath(commonDir, version) {
    return path.join(getVersionDir(commonDir), version, `${version}.jar`);
}

function calculateHashByBuffer(buffer, algo) {
    const algorithm = algo.toLowerCase().replace('-', '');
    return crypto.createHash(algorithm).update(buffer).digest('hex');
}

async function extractZip(archivePath, onEntry) {
    const zip = new AdmZip(archivePath);
    const entries = zip.getEntries();

    zip.extractAllTo(path.dirname(archivePath), true);

    if(onEntry) {
        const entriesObj = {};
        entries.forEach(e => entriesObj[e.entryName] = e);
        await onEntry({ entries: () => entriesObj });
    }
}

async function extractTarGz(archivePath, onEntry) {
    const destDir = path.dirname(archivePath);
    await execAsync(`tar -xzf "${archivePath}" -C "${destDir}"`);

    if(onEntry) {
        const { stdout } = await execAsync(`tar -tf "${archivePath}"`);
        const lines = stdout.split('\n');
        await onEntry({ name: lines[0] });
    }
}

module.exports = { validateLocalFile, safeEnsureDir, getLibraryDir, getVersionDir, getVersionJsonPath, getVersionJarPath, calculateHashByBuffer, extractZip, extractTarGz }
