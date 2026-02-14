const { retry } = require('../app/assets/js/util');

describe('retry', () => {
  it('should return the value of the function on the first try if it succeeds', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    const result = await retry(mockFn);
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry the function the specified number of times if it consistently fails', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
    await expect(retry(mockFn, 3, 10)).rejects.toThrow('failure');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should not retry if the error is not retryable', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('not retryable'));
    const isRetryable = (err) => err.message !== 'not retryable';
    await expect(retry(mockFn, 3, 10, isRetryable)).rejects.toThrow('not retryable');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should succeed after a few retries', async () => {
    let callCount = 0;
    const mockFn = jest.fn(async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error('failure');
      }
      return 'success';
    });
    const result = await retry(mockFn, 3, 10);
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });
});