const { LoggerUtil } = require('../util/LoggerUtil')
const { RestResponseStatus, handleFetchError } = require('../common/RestResponse')

class MojangRestAPI {
    static logger = LoggerUtil.getLogger('MojangRestAPI');
    static STATUS_ENDPOINT = 'https://status.mojang.com/check';

    static async status() {
        try {
            const res = await fetch(this.STATUS_ENDPOINT);
            const data = await res.json();
             if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return {
                data: data,
                responseStatus: RestResponseStatus.SUCCESS
            }
        } catch (error) {
            return handleFetchError('Mojang Status', error, this.logger);
        }
    }

    static getDefaultStatuses() {
        return [
            { name: 'Minecraft', status: 'grey' },
            { name: 'Minecraft Multiplayer', status: 'grey' },
            { name: 'Mojang Accounts', status: 'grey' },
            { name: 'Textures', status: 'grey' },
            { name: 'Auth Service', status: 'grey' },
            { name: 'Sessions', status: 'grey' },
            { name: 'API', status: 'grey' }
        ]
    }

    static statusToHex(status) {
        switch (status) {
            case 'green': return '#a5c325';
            case 'yellow': return '#eac918';
            case 'red': return '#c32625';
            case 'grey':
            default: return '#888';
        }
    }
}

module.exports = { MojangRestAPI }
