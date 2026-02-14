const MicrosoftErrorCode = {
    UNKNOWN: 'UNKNOWN',
    NO_PROFILE: 'NO_PROFILE',
    NO_XBOX_ACCOUNT: 'NO_XBOX_ACCOUNT',
    XBL_BANNED: 'XBL_BANNED',
    UNDER_18: 'UNDER_18'
}

function decipherErrorCode(body) {
    if (body) {
        if (body.XErr) {
            const xErr = body.XErr;
            switch (xErr) {
                case 2148916233:
                    return MicrosoftErrorCode.NO_XBOX_ACCOUNT;
                case 2148916235:
                    return MicrosoftErrorCode.XBL_BANNED;
                case 2148916238:
                    return MicrosoftErrorCode.UNDER_18;
            }
        }
    }
    return MicrosoftErrorCode.UNKNOWN;
}

module.exports = { MicrosoftErrorCode, decipherErrorCode }
