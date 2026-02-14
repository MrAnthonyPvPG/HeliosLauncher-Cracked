const { LoggerUtil } = require('../util/LoggerUtil');
const { IndexProcessor } = require('./IndexProcessor');
const { AssetGuardError } = require('./AssetGuardError');
const { validateLocalFile, getVersionJsonPath, safeEnsureDir } = require('../common/FileUtils');
const { HashAlgo } = require('./Asset');
const { Type } = require('../common/DistributionClasses');
const { mcVersionAtLeast } = require('../common/MojangUtils');
const fs = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');

class DistributionIndexProcessor extends IndexProcessor {
    static logger = LoggerUtil.getLogger('DistributionIndexProcessor');

    constructor(commonDir, distribution, serverId) {
        super(commonDir);
        this.distribution = distribution;
        this.serverId = serverId;
    }

    async init() {
        // no-op
    }

    totalStages() {
        return 1;
    }

    async validate(onStageComplete) {
        const server = this.distribution.getServerById(this.serverId);
        if (server == null) {
            throw new AssetGuardError(`Invalid server id ${this.serverId}`);
        }

        const notValid = await this.validateModules(server.modules);
        if(onStageComplete) await onStageComplete();
        return {
            distribution: notValid
        };
    }

    async postDownload() {
        await this.loadModLoaderVersionJson();
    }

    async validateModules(modules) {
        // Dynamic import for ESM module
        const { default: pLimit } = await import('p-limit');
        const limit = pLimit(32);

        // Flatten module tree for validation
        const flatModules = [];
        const traverse = (modList) => {
            for(const mod of modList) {
                flatModules.push(mod);
                if(mod.hasSubModules()) {
                    traverse(mod.subModules);
                }
            }
        };
        traverse(modules);

        const tasks = flatModules.map(module => {
            return limit(async () => {
                const hash = module.rawModule.artifact.MD5;
                if (!await validateLocalFile(module.getPath(), HashAlgo.MD5, hash)) {
                    return {
                        id: module.rawModule.id,
                        hash: hash,
                        algo: HashAlgo.MD5,
                        size: module.rawModule.artifact.size,
                        url: module.rawModule.artifact.url,
                        path: module.getPath()
                    };
                }
                return null;
            });
        });

        const results = await Promise.all(tasks);
        return results.filter(Boolean);
    }

    async loadModLoaderVersionJson() {
        const server = this.distribution.getServerById(this.serverId);
        if (server == null) {
            throw new AssetGuardError(`Invalid server id ${this.serverId}`);
        }
        const modLoaderModule = server.modules.find(({ rawModule: { type } }) => type === Type.ForgeHosted || type === Type.Forge || type === Type.Fabric);
        if (modLoaderModule == null) {
            throw new AssetGuardError('No mod loader found!');
        }
        if (modLoaderModule.rawModule.type === Type.Fabric
            || DistributionIndexProcessor.isForgeGradle3(server.rawServer.minecraftVersion, modLoaderModule.getMavenComponents().version)) {
            return await this.loadVersionManifest(modLoaderModule);
        }
        else {
            try {
                const zip = new AdmZip(modLoaderModule.getPath());
                const entry = zip.getEntry('version.json');
                if(!entry) throw new Error('version.json not found in modloader jar');

                const data = JSON.parse(zip.readAsText(entry));
                const writePath = getVersionJsonPath(this.commonDir, data.id);
                await safeEnsureDir(path.dirname(writePath));
                await fs.writeFile(writePath, JSON.stringify(data));
                return data;
            } catch(e) {
                 throw new AssetGuardError('Failed to extract version.json from modloader', e);
            }
        }
    }

    async loadVersionManifest(modLoaderModule) {
        const versionManifstModule = modLoaderModule.subModules.find(({ rawModule: { type } }) => type === Type.VersionManifest);
        if (versionManifstModule == null) {
            throw new AssetGuardError('No mod loader version manifest module found!');
        }
        return JSON.parse(await fs.readFile(versionManifstModule.getPath(), 'utf-8'));
    }

    static isForgeGradle3(mcVersion, forgeVersion) {
        if (mcVersionAtLeast('1.13', mcVersion)) {
            return true;
        }
        try {
            const forgeVer = forgeVersion.split('-')[1];
            const maxFG2 = [14, 23, 5, 2847];
            const verSplit = forgeVer.split('.').map(v => Number(v));
            for (let i = 0; i < maxFG2.length; i++) {
                if (verSplit[i] > maxFG2[i]) {
                    return true;
                }
                else if (verSplit[i] < maxFG2[i]) {
                    return false;
                }
            }
            return false;
        }
        catch (err) {
            throw new Error('Forge version is complex (changed).. launcher requires a patch.');
        }
    }
}

module.exports = { DistributionIndexProcessor }
