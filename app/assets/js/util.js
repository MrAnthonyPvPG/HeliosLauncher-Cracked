/**
 * Asynchronously retries a function with a specified number of attempts and delay.
 *
 * @param {Function} func The function to retry.
 * @param {number} [retries=3] The maximum number of retries.
 * @param {number} [delay=1000] The initial delay between retries in milliseconds.
 * @param {Function} isRetryable A function that takes an error and returns true if the function should be retried.
 * @returns {Promise<any>} A promise that resolves with the result of the function if it succeeds.
 */
exports.retry = async function(func, retries = 3, delay = 1000, isRetryable = () => true) {
    for (let i = 0; i < retries; i++) {
        try {
            return await func()
        } catch (err) {
            if (isRetryable(err) && i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
            } else {
                throw err
            }
        }
    }
}
