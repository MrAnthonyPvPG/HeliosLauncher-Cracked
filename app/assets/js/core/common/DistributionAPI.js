const { resolve } = require('path');
const fs = require('fs/promises');
const { LoggerUtil } = require('../util/LoggerUtil');
const { RestResponseStatus, handleFetchError } = require('./RestResponse');
const { HeliosDistribution } = require('./DistributionClasses');

class DistributionAPI {
    static log = LoggerUtil.getLogger('DistributionAPI');

    constructor(launcherDirectory, commonDir, instanceDir, remoteUrl, devMode) {
        this.launcherDirectory = launcherDirectory;
        this.commonDir = commonDir;
        this.instanceDir = instanceDir;
        this.remoteUrl = remoteUrl;
        this.devMode = devMode;
        this.DISTRO_FILE = 'distribution.json';
        this.DISTRO_FILE_DEV = 'distribution_dev.json';
        this.distroPath = resolve(launcherDirectory, this.DISTRO_FILE);
        this.distroDevPath = resolve(launcherDirectory, this.DISTRO_FILE_DEV);
        this.rawDistribution = null;
        this.distribution = null;
    }

    async getDistribution() {
        if (this.rawDistribution == null) {
            this.rawDistribution = await this.loadDistribution();
            this.distribution = new HeliosDistribution(this.rawDistribution, this.commonDir, this.instanceDir);
        }
        return this.distribution;
    }

    async getDistributionLocalLoadOnly() {
        if (this.rawDistribution == null) {
            const x = await this.pullLocal();
            if (x == null) {
                throw new Error('FATAL: Unable to load distribution from local disk.');
            }
            this.rawDistribution = x;
            this.distribution = new HeliosDistribution(this.rawDistribution, this.commonDir, this.instanceDir);
        }
        return this.distribution;
    }

    async refreshDistributionOrFallback() {
        const distro = await this._loadDistributionNullable();
        if (distro == null) {
            DistributionAPI.log.warn('Failed to refresh distribution, falling back to current load (if exists).');
            return this.distribution;
        }
        else {
            this.rawDistribution = distro;
            this.distribution = new HeliosDistribution(distro, this.commonDir, this.instanceDir);
            return this.distribution;
        }
    }

    toggleDevMode(dev) {
        this.devMode = dev;
    }

    isDevMode() {
        return this.devMode;
    }

    async loadDistribution() {
        const distro = await this._loadDistributionNullable();
        if (distro == null) {
            throw new Error('FATAL: Unable to load distribution from remote server or local disk.');
        }
        return distro;
    }

    async _loadDistributionNullable() {
        let distro;
        if (!this.devMode) {
            distro = (await this.pullRemote()).data;
            if (distro == null) {
                distro = await this.pullLocal();
            }
            else {
                await this.writeDistributionToDisk(distro);
            }
        }
        else {
            distro = await this.pullLocal();
        }
        return distro;
    }

    async pullRemote() {
        try {
            const res = await fetch(this.remoteUrl);
            const data = await res.json();
             if (!res.ok) throw new Error(`HTTP ${res.status}`);

            return {
                data: data,
                responseStatus: RestResponseStatus.SUCCESS
            };
        }
        catch (error) {
            return handleFetchError('Pull Remote', error, DistributionAPI.log);
        }
    }

    async writeDistributionToDisk(distribution) {
        await fs.writeFile(this.distroPath, JSON.stringify(distribution, null, 4));
    }

    async pullLocal() {
        return await this.readDistributionFromFile(!this.devMode ? this.distroPath : this.distroDevPath);
    }

    async readDistributionFromFile(path) {
        try {
            await fs.access(path);
            const raw = await fs.readFile(path, 'utf-8');
            try {
                return JSON.parse(raw);
            }
            catch (error) {
                DistributionAPI.log.error(`Malformed distribution file at ${path}`);
                return null;
            }
        } catch (e) {
            DistributionAPI.log.error(`No distribution file found at ${path}!`);
            return null;
        }
    }
}

module.exports = { DistributionAPI }
