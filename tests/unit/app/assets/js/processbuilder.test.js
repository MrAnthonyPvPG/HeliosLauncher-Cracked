const ProcessBuilder = require('@app/assets/js/processbuilder');
const ConfigManager = require('@app/assets/js/configmanager');

jest.mock('@app/assets/js/preloader', () => ({
    sendToSentry: jest.fn(),
}));

jest.mock('@app/assets/js/configmanager', () => ({
    getMinRAM: jest.fn(),
    getMaxRAM: jest.fn(),
    getJVMOptions: jest.fn(),
    getGameWidth: jest.fn(),
    getGameHeight: jest.fn(),
    getFullscreen: jest.fn(),
    getAutoConnect: jest.fn(),
    getInstanceDirectory: jest.fn(() => 'test-instance-dir'),
    getCommonDirectory: jest.fn(() => 'test-common-dir'),
    getTempNativeFolder: jest.fn(() => 'test-native-folder'),
}));

describe('ProcessBuilder', () => {
    it('should be a class', () => {
        expect(typeof ProcessBuilder).toBe('function');
    });

    it('should construct JVM arguments', () => {
        const distroServer = {
            rawServer: {
                id: 'test-server',
                minecraftVersion: '1.12.2',
            },
            modules: [],
        };
        const vanillaManifest = {
            id: '1.12.2',
            libraries: [],
            mainClass: 'net.minecraft.client.main.Main',
            minecraftArguments: '',
        };
        const modManifest = {
            id: '1.12.2-forge-14.23.5.2855',
            mainClass: 'net.minecraft.launchwrapper.Launch',
            minecraftArguments: '',
        };
        const authUser = {
            displayName: 'test-user',
            uuid: 'test-uuid',
            accessToken: 'test-access-token',
        };
        const launcherVersion = 'test-launcher-version';

        const processBuilder = new ProcessBuilder(
            distroServer,
            vanillaManifest,
            modManifest,
            authUser,
            launcherVersion
        );

        const args = processBuilder.constructJVMArguments([], 'test-native-path');
        expect(args).toBeDefined();
    });
});
