const { LoggerUtil } = require('../util/LoggerUtil')
const { RestResponseStatus, handleFetchError } = require('../common/RestResponse')
const { MicrosoftErrorCode, decipherErrorCode } = require('./MicrosoftResponse')

class MicrosoftAuth {
    static logger = LoggerUtil.getLogger('MicrosoftAuth');
    static TOKEN_ENDPOINT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
    static XBL_AUTH_ENDPOINT = 'https://user.auth.xboxlive.com/user/authenticate';
    static XSTS_AUTH_ENDPOINT = 'https://xsts.auth.xboxlive.com/xsts/authorize';
    static MC_AUTH_ENDPOINT = 'https://api.minecraftservices.com/authentication/login_with_xbox';
    static MC_PROFILE_ENDPOINT = 'https://api.minecraftservices.com/minecraft/profile';

    static async getAccessToken(code, refresh, clientId) {
        try {
            const body = new URLSearchParams({
                client_id: clientId,
                scope: 'XboxLive.signin',
                redirect_uri: 'https://login.microsoftonline.com/common/oauth2/nativeclient',
                [refresh ? 'refresh_token' : 'code']: code,
                grant_type: refresh ? 'refresh_token' : 'authorization_code'
            });

            console.log('DEBUG: REAL SEND ->', body.toString());

            const res = await fetch(this.TOKEN_ENDPOINT, {
                method: 'POST',
                body: body.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
            return { data: data, responseStatus: RestResponseStatus.SUCCESS };
        } catch (error) {
            return handleFetchError(`Get ${refresh ? 'Refresh' : 'Auth'} Token`, error, this.logger);
        }
    }

    static async getXBLToken(accessToken) {
        try {
            const res = await fetch(this.XBL_AUTH_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    Properties: {
                        AuthMethod: 'RPS',
                        SiteName: 'user.auth.xboxlive.com',
                        RpsTicket: `d=${accessToken}`
                    },
                    RelyingParty: 'http://auth.xboxlive.com',
                    TokenType: 'JWT'
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);

            return {
                data: data,
                responseStatus: RestResponseStatus.SUCCESS
            };
        } catch (error) {
            return handleFetchError('Get XBL Token', error, this.logger);
        }
    }

    static async getXSTSToken(xblResponse) {
        try {
            const res = await fetch(this.XSTS_AUTH_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    Properties: {
                        SandboxId: 'RETAIL',
                        UserTokens: [xblResponse.Token]
                    },
                    RelyingParty: 'rp://api.minecraftservices.com/',
                    TokenType: 'JWT'
                })
            });
            const data = await res.json();
            if (!res.ok) {
                // Handle specific error codes
                const error = new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
                error.response = { body: data }; // For decipherErrorCode
                throw error;
            }

            return {
                data: data,
                responseStatus: RestResponseStatus.SUCCESS
            };
        } catch (error) {
            const response = await handleFetchError('Get XSTS Token', error, this.logger);
            if (error.response && error.response.body) {
                response.microsoftErrorCode = decipherErrorCode(error.response.body);
            } else {
                response.microsoftErrorCode = MicrosoftErrorCode.UNKNOWN;
            }
            return response;
        }
    }

    static async getMCAccessToken(xstsResponse) {
        try {
            const res = await fetch(this.MC_AUTH_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    identityToken: `XBL3.0 x=${xstsResponse.DisplayClaims.xui[0].uhs};${xstsResponse.Token}`
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);

            return {
                data: data,
                responseStatus: RestResponseStatus.SUCCESS
            };
        } catch (error) {
            return handleFetchError('Get MC Access Token', error, this.logger);
        }
    }

    static async getMCProfile(mcAccessToken) {
        try {
            const res = await fetch(this.MC_PROFILE_ENDPOINT, {
                headers: {
                    Authorization: `Bearer ${mcAccessToken}`
                }
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 404) {
                    const r = { responseStatus: RestResponseStatus.ERROR, error: new Error('No Profile') };
                    r.microsoftErrorCode = MicrosoftErrorCode.NO_PROFILE;
                    return r;
                }
                throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
            }

            return {
                data: data,
                responseStatus: RestResponseStatus.SUCCESS
            };
        } catch (error) {
            return handleFetchError('Get MC Profile', error, this.logger);
        }
    }
}

module.exports = { MicrosoftAuth }
