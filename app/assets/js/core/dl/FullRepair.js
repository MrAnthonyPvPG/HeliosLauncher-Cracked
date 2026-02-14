const { DistributionAPI } = require('../common/DistributionAPI');
const { DistributionIndexProcessor } = require('./DistributionIndexProcessor');
const { MojangIndexProcessor } = require('./MojangIndexProcessor');
const { downloadQueue } = require('./DownloadEngine');
const { LoggerUtil } = require('../util/LoggerUtil');
const { validateLocalFile } = require('../common/FileUtils');

class FullRepair {
    static logger = LoggerUtil.getLogger('FullRepair');

    constructor(commonDirectory, instanceDirectory, launcherDirectory, serverId, devMode) {
        this.commonDirectory = commonDirectory;
        this.instanceDirectory = instanceDirectory;
        this.launcherDirectory = launcherDirectory;
        this.serverId = serverId;
        this.devMode = devMode;
        this.processors = [];
        this.assets = [];
        this.distribution = null;
    }

    async spawnReceiver() {
        // No-op for compatibility, or throw warning
        FullRepair.logger.debug('spawnReceiver is deprecated and no-op in monolithic core.');
    }

    get childProcess() {
        // Mock child process for compatibility
        return {
            on: (event, cb) => {
                // We don't really emit events here in the same way,
                // but landing.js expects 'error' and 'close'.
                // Since we run in-process, errors are thrown and 'close' is end of execution.
                // We might not need this if we update landing.js
            }
        }
    }

    destroyReceiver() {
        // No-op
    }

    async verifyFiles(onProgress) {
        const api = new DistributionAPI(
            this.launcherDirectory,
            this.commonDirectory,
            this.instanceDirectory,
            null,
            this.devMode
        );
        this.distribution = await api.getDistributionLocalLoadOnly();
        const server = this.distribution.getServerById(this.serverId);

        const mojangIndexProcessor = new MojangIndexProcessor(this.commonDirectory, server.rawServer.minecraftVersion);
        const distributionIndexProcessor = new DistributionIndexProcessor(this.commonDirectory, this.distribution, this.serverId);

        this.processors = [
            mojangIndexProcessor,
            distributionIndexProcessor
        ];

        let numStages = 0;
        for (const processor of this.processors) {
            await processor.init();
            numStages += processor.totalStages();
        }

        const assets = [];
        let completedStages = 0;

        for (const processor of this.processors) {
            const result = await processor.validate(async () => {
                completedStages++;
                const percent = Math.trunc((completedStages / numStages) * 100);
                if(onProgress) onProgress(percent);
            });

            Object.values(result)
                .flatMap(asset => asset)
                .forEach(asset => assets.push(asset));
        }

        this.assets = assets;
        return this.assets.length;
    }

    async download(onProgress) {
        const expectedTotalSize = this.assets.reduce((acc, a) => acc + a.size, 0);

        let currentPercent = 0;
        const receivedEach = await downloadQueue(this.assets, received => {
            if(expectedTotalSize > 0) {
                const nextPercent = Math.trunc((received / expectedTotalSize) * 100);
                if (currentPercent !== nextPercent) {
                    currentPercent = nextPercent;
                    if(onProgress) onProgress(currentPercent);
                }
            } else {
                if(onProgress) onProgress(100);
            }
        });

        for (const asset of this.assets) {
            if (asset.size !== receivedEach[asset.id]) {
                FullRepair.logger.warn(`Asset ${asset.id} declared a size of ${asset.size} bytes, but ${receivedEach[asset.id]} were received!`);
                if (!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
                    FullRepair.logger.error(`Hashes do not match, ${asset.id} may be corrupted.`);
                }
            }
        }

        for (const processor of this.processors) {
            await processor.postDownload();
        }
    }
}

module.exports = { FullRepair }
