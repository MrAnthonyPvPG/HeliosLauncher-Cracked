const SysUtil = require('@app/assets/js/sysutil');
const os = require('os');
const { exec } = require('child_process');
const checkDiskSpace = require('check-disk-space').default;
const ConfigManager = require('@app/assets/js/configmanager');

jest.mock('os', () => ({
    platform: jest.fn(),
    totalmem: jest.fn(),
    freemem: jest.fn(),
}));

jest.mock('child_process', () => ({
    exec: jest.fn(),
}));

jest.mock('check-disk-space', () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('@app/assets/js/configmanager', () => ({
    getTotalRAMWarningShown: jest.fn(),
    setTotalRAMWarningShown: jest.fn(),
    save: jest.fn(),
}));

describe('SysUtil', () => {
    it('should be an object', () => {
        expect(typeof SysUtil).toBe('object');
    });

    it('should perform system checks', async () => {
        os.platform.mockReturnValue('linux');
        os.totalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
        exec.mockImplementation((command, callback) => callback(null, 'MemAvailable: 8192000 kB'));
        checkDiskSpace.mockResolvedValue({ free: 20 * 1024 * 1024 * 1024 });
        ConfigManager.getTotalRAMWarningShown.mockReturnValue(false);

        const warnings = await SysUtil.performChecks();
        expect(warnings).toEqual([]);
    });
});
