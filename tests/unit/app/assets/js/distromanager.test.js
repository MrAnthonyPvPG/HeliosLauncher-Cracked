jest.mock('@app/assets/js/util', () => ({
    retry: jest.fn(),
}))

describe('DistroManager', () => {
    let DistroManager
    let util

    beforeEach(() => {
        jest.resetModules()
        DistroManager = require('@app/assets/js/distromanager')
        util = require('@app/assets/js/util')
    })

    it('should retry fetching the distribution index on failure', async () => {
        const mockError = new Error('Network error')
        util.retry.mockRejectedValue(mockError)

        await expect(DistroManager.DistroAPI.getDistribution()).resolves.toBeNull()
        expect(util.retry).toHaveBeenCalled()
    })
})
