/**
 * AuthManager
 *
 * This module aims to abstract login procedures. Offline login is used instead of Mojang's REST API,
 * while Microsoft login procedures remain intact.
 *
 * @module authmanager
 */

const ConfigManager = require('./configmanager')
const { LoggerUtil } = require('./core/util/LoggerUtil')
const { RestResponseStatus } = require('./core/common/RestResponse')
const { MicrosoftAuth } = require('./core/microsoft/MicrosoftAuth')
const { MicrosoftErrorCode } = require('./core/microsoft/MicrosoftResponse')
const { AZURE_CLIENT_ID } = require('./ipcconstants')
const Lang = require('./langloader')

const log = LoggerUtil.getLogger('AuthManager')

// Error messages for Microsoft only
function microsoftErrorDisplayable(errorCode) {
    switch (errorCode) {
        case MicrosoftErrorCode.NO_PROFILE:
            return {
                title: Lang.queryJS('auth.microsoft.error.noProfileTitle'),
                desc: Lang.queryJS('auth.microsoft.error.noProfileDesc')
            }
        case MicrosoftErrorCode.NO_XBOX_ACCOUNT:
            return {
                title: Lang.queryJS('auth.microsoft.error.noXboxAccountTitle'),
                desc: Lang.queryJS('auth.microsoft.error.noXboxAccountDesc')
            }
        case MicrosoftErrorCode.XBL_BANNED:
            return {
                title: Lang.queryJS('auth.microsoft.error.xblBannedTitle'),
                desc: Lang.queryJS('auth.microsoft.error.xblBannedDesc')
            }
        case MicrosoftErrorCode.UNDER_18:
            return {
                title: Lang.queryJS('auth.microsoft.error.under18Title'),
                desc: Lang.queryJS('auth.microsoft.error.under18Desc')
            }
        case MicrosoftErrorCode.UNKNOWN:
            return {
                title: Lang.queryJS('auth.microsoft.error.unknownTitle'),
                desc: Lang.queryJS('auth.microsoft.error.unknownDesc')
            }
        default:
            throw new Error(`Unknown error code: ${errorCode}`)
    }
}

const crypto = require('crypto')

function generateOfflineUUID(username) {
    const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex')
    return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-${hash.substr(12, 4)}-${hash.substr(16, 4)}-${hash.substr(20)}`
}

exports.addMojangAccount = async function (username, password) {
    const profileId = generateOfflineUUID(username)
    const session = {
        id: 'offline-id',
        accessToken: 'offline-access-token',
        selectedProfile: { id: profileId, name: username }
    }

    const ret = ConfigManager.addMojangAuthAccount(
        session.selectedProfile.id,
        session.accessToken,
        username,
        session.selectedProfile.name
    )
    ConfigManager.save()
    return ret
}

// Microsoft authentication functions remain as-is

const AUTH_MODE = { FULL: 0, MS_REFRESH: 1, MC_REFRESH: 2 }

/**
 * Perform the full MS Auth flow in a given mode.
 *
 * AUTH_MODE.FULL = Full authorization for a new account.
 * AUTH_MODE.MS_REFRESH = Full refresh authorization.
 * AUTH_MODE.MC_REFRESH = Refresh of the MC token, reusing the MS token.
 *
 * @param {string} entryCode FULL-AuthCode. MS_REFRESH=refreshToken, MC_REFRESH=accessToken
 * @param {*} authMode The auth mode.
 * @returns An object with all auth data. AccessToken object will be null when mode is MC_REFRESH.
 */
const { retry } = require('./util')

async function fullMicrosoftAuthFlow(entryCode, authMode) {
    const executionLogic = async () => {
        let accessTokenRaw
        let accessToken
        if (authMode !== AUTH_MODE.MC_REFRESH) {
            const accessTokenResponse = await MicrosoftAuth.getAccessToken(entryCode, authMode === AUTH_MODE.MS_REFRESH, AZURE_CLIENT_ID)
            if (accessTokenResponse.responseStatus === RestResponseStatus.ERROR) {
                throw new Error(accessTokenResponse.microsoftErrorCode)
            }
            accessToken = accessTokenResponse.data
            accessTokenRaw = accessToken.access_token
        } else {
            accessTokenRaw = entryCode
        }

        const xblResponse = await MicrosoftAuth.getXBLToken(accessTokenRaw)
        if (xblResponse.responseStatus === RestResponseStatus.ERROR) throw new Error(xblResponse.microsoftErrorCode)

        const xstsResonse = await MicrosoftAuth.getXSTSToken(xblResponse.data)
        if (xstsResonse.responseStatus === RestResponseStatus.ERROR) throw new Error(xstsResonse.microsoftErrorCode)

        const mcTokenResponse = await MicrosoftAuth.getMCAccessToken(xstsResonse.data)
        if (mcTokenResponse.responseStatus === RestResponseStatus.ERROR) throw new Error(mcTokenResponse.microsoftErrorCode)

        const mcProfileResponse = await MicrosoftAuth.getMCProfile(mcTokenResponse.data.access_token)
        if (mcProfileResponse.responseStatus === RestResponseStatus.ERROR) throw new Error(mcProfileResponse.microsoftErrorCode)

        return {
            accessToken,
            accessTokenRaw,
            xbl: xblResponse.data,
            xsts: xstsResonse.data,
            mcToken: mcTokenResponse.data,
            mcProfile: mcProfileResponse.data
        }
    }

    if (authMode === AUTH_MODE.FULL) {
        return await executionLogic().catch((err) => {
            log.error('Error during Microsoft auth flow (FULL):', err)
            return Promise.reject(microsoftErrorDisplayable(MicrosoftErrorCode.UNKNOWN))
        })
    } else {
        return await retry(executionLogic).catch((err) => {
            log.error('Error during Microsoft auth flow (RETRY):', err)
            return Promise.reject(microsoftErrorDisplayable(MicrosoftErrorCode.UNKNOWN))
        })
    }
}

/**
 * Calculate the expiry date. Advance the expiry time by 10 seconds
 * to reduce the liklihood of working with an expired token.
 *
 * @param {number} nowMs Current time milliseconds.
 * @param {number} expiresInS Expires in (seconds)
 * @returns
 */
function calculateExpiryDate(nowMs, expiresInS) {
    return nowMs + ((expiresInS - 10) * 1000)
}

/**
 * Add a Microsoft account. This will pass the provided auth code to Microsoft's OAuth2.0 flow.
 * The resultant data will be stored as an auth account in the configuration database.
 *
 * @param {string} authCode The authCode obtained from Microsoft.
 * @returns {Promise.<Object>} Promise which resolves the resolved authenticated account object.
 */
exports.addMicrosoftAccount = async function (authCode) {
    const fullAuth = await fullMicrosoftAuthFlow(authCode, AUTH_MODE.FULL)

    const now = new Date().getTime()

    const ret = ConfigManager.addMicrosoftAuthAccount(
        fullAuth.mcProfile.id,
        fullAuth.mcToken.access_token,
        fullAuth.mcProfile.name,
        calculateExpiryDate(now, fullAuth.mcToken.expires_in),
        fullAuth.accessToken.access_token,
        fullAuth.accessToken.refresh_token,
        calculateExpiryDate(now, fullAuth.accessToken.expires_in)
    )
    ConfigManager.save()

    return ret
}

// Offline account removal for Mojang
exports.removeMojangAccount = async function (uuid) {
    try {
        ConfigManager.removeAuthAccount(uuid)
        ConfigManager.save()
        return Promise.resolve()
    } catch (err) {
        log.error('Error while removing account', err)
        return Promise.reject(err)
    }
}

/**
 * Remove a Microsoft account. It is expected that the caller will invoke the OAuth logout
 * through the ipc renderer.
 *
 * @param {string} uuid The UUID of the account to be removed.
 * @returns {Promise.<void>} Promise which resolves to void when the action is complete.
 */
exports.removeMicrosoftAccount = async function (uuid) {
    try {
        ConfigManager.removeAuthAccount(uuid)
        ConfigManager.save()
        return Promise.resolve()
    } catch (err) {
        log.error('Error while removing account', err)
        return Promise.reject(err)
    }
}

// Offline validation for Mojang
async function validateSelectedMojangAccount() {
    return true // Always valid in offline mode
}

/**
 * Validate the selected account with Microsoft's authserver. If the account is not valid,
 * we will attempt to refresh the access token and update that value. If that fails, a
 * new login will be required.
 *
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
async function validateSelectedMicrosoftAccount() {
    const current = ConfigManager.getSelectedAccount()
    const now = new Date().getTime()
    const mcExpiresAt = current.expiresAt
    const mcExpired = now >= mcExpiresAt

    if (!mcExpired) {
        return true
    }

    const msExpiresAt = current.microsoft.expires_at
    const msExpired = now >= msExpiresAt

    if (msExpired) {
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.refresh_token, AUTH_MODE.MS_REFRESH)

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                res.accessToken.access_token,
                res.accessToken.refresh_token,
                calculateExpiryDate(now, res.accessToken.expires_in),
                calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            return true
        } catch (err) {
            return false
        }
    } else {
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.access_token, AUTH_MODE.MC_REFRESH)

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                current.microsoft.access_token,
                current.microsoft.refresh_token,
                current.microsoft.expires_at,
                calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            return true
        } catch (err) {
            return false
        }
    }
}

/**
 * Validate the selected auth account.
 *
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
exports.validateSelected = async function () {
    const current = ConfigManager.getSelectedAccount()

    if (current.type === 'microsoft') {
        return await validateSelectedMicrosoftAccount()
    } else {
        return await validateSelectedMojangAccount()
    }
}
