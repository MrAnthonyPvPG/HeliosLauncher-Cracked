const RestResponseStatus = {
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR'
}

function isDisplayableError(it) {
    return typeof it == 'object'
        && it != null
        && Object.prototype.hasOwnProperty.call(it, 'title')
        && Object.prototype.hasOwnProperty.call(it, 'desc');
}

async function handleFetchError(operation, error, logger, dataProvider) {
     const response = {
        data: dataProvider ? dataProvider() : null,
        responseStatus: RestResponseStatus.ERROR,
        error
    };
    logger.error(`Error during ${operation}`, error);
    return response;
}

module.exports = { RestResponseStatus, isDisplayableError, handleFetchError }
