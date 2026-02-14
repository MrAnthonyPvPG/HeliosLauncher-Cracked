class AssetGuardError extends Error {
    constructor(message, cause) {
        super(message, { cause });
        this.name = 'AssetGuardError';
    }
}
module.exports = { AssetGuardError }
