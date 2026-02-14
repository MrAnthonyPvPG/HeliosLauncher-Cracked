const { LoggerUtil } = require('../util/LoggerUtil');
const { validateLocalFile, safeEnsureDir } = require('../common/FileUtils');
const { ensureDecodedPath, sleep } = require('../util/NodeUtil');
const { dirname, extname } = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const P2PManager = require('./P2PManager');

const log = LoggerUtil.getLogger('DownloadEngine');

async function downloadQueue(assets, onProgress) {
    P2PManager.start();
    const limit = 32; // Concurrency
    const receivedTotals = assets.reduce((acc, a) => ({ ...acc, [a.id]: 0 }), {});
    let receivedGlobal = 0;

    const runDownload = async (asset) => {
        const onEachProgress = (transferred) => {
            receivedGlobal += (transferred - receivedTotals[asset.id]);
            receivedTotals[asset.id] = transferred;
            if (onProgress) onProgress(receivedGlobal);
        };
        await downloadFile(asset, onEachProgress);
    };

    const queue = [...assets];
    const workers = [];

    const worker = async () => {
        while (queue.length > 0) {
            const asset = queue.shift();
            try {
                await runDownload(asset);
            } catch (err) {
                // If downloadFile throws, it means it failed after retries.
                throw err;
            }
        }
    };

    for (let i = 0; i < limit; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
    return receivedTotals;
}

async function downloadFile(asset, onProgress) {
    if (!asset || !asset.path) {
        throw new Error('Asset or asset path is null or undefined.');
    }
    const { url, path, algo, hash } = asset;
    const decodedPath = ensureDecodedPath(path);
    const CONFIG_EXTENSIONS = ['.txt', '.json', '.yml', '.yaml', '.dat'];

    try {
        await fs.access(decodedPath);
        if (CONFIG_EXTENSIONS.includes(extname(decodedPath))) {
            log.debug(`Skipping download of ${decodedPath} as it already exists.`);
            if (onProgress) onProgress(asset.size); // Account for skipping
            return;
        }
        if (await validateLocalFile(decodedPath, algo, hash)) {
            log.debug(`File already exists and is valid: ${decodedPath}`);
            if (onProgress) onProgress(asset.size); // Account for skipping
            return;
        }
    } catch (e) { }

    await safeEnsureDir(dirname(decodedPath));

    try {
        const success = await P2PManager.downloadFile(asset, decodedPath);
        if (success) {
            if (await validateLocalFile(decodedPath, algo, hash)) {
                log.debug(`Downloaded ${asset.id} from P2P peer.`);
                if (onProgress) onProgress(asset.size);
                return;
            }
        }
    } catch (err) {
        log.warn(`P2P download failed for ${asset.id}: ${err.message}`);
    }

    let retryCount = 0;
    const MAX_RETRIES = 5;
    const MAX_HTTP_CONCURRENCY = 15;

    // Safety limit for HTTP requests (hybrid concurrency)
    while (activeHttpRequests >= MAX_HTTP_CONCURRENCY) {
        await sleep(50);
    }
    activeHttpRequests++;

    try {
        while (retryCount <= MAX_RETRIES) {
            if (retryCount > 0) {
                const delay = Math.pow(2, retryCount) * 1000;
                await sleep(delay);
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // Connect timeout

                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                // Progress tracking
                const contentLength = response.headers.get('content-length');
                const total = parseInt(contentLength, 10) || asset.size || 0;
                let loaded = 0;
                let lastProgressTime = 0;

                const fileStream = fsSync.createWriteStream(decodedPath);

                // Use streaming instead of buffering
                if (response.body) {
                    const reader = response.body.getReader();
                    const nodeStream = new Readable({
                        async read() {
                            const { done, value } = await reader.read();
                            if (done) {
                                this.push(null);
                            } else {
                                loaded += value.length;
                                const now = Date.now();
                                if (onProgress && (now - lastProgressTime >= 100 || loaded === total)) {
                                    onProgress(loaded);
                                    lastProgressTime = now;
                                }
                                this.push(Buffer.from(value));
                            }
                        }
                    });
                    await pipeline(nodeStream, fileStream);
                } else {
                    throw new Error('No response body');
                }

                // Re-validate
                if (await validateLocalFile(decodedPath, algo, hash)) {
                    return;
                } else {
                    throw new Error(`File validation failed: ${decodedPath}`);
                }

            } catch (err) {
                if (onProgress) onProgress(0);
                retryCount++;
                if (retryCount > MAX_RETRIES) throw err;
                log.warn(`Download failed for ${url} (Attempt ${retryCount}): ${err.message}`);
            }
        }
    } finally {
        activeHttpRequests--;
    }
}

let activeHttpRequests = 0;

module.exports = { downloadQueue, downloadFile }
