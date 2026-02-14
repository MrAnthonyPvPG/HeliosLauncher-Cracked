const DiscordWrapper = require('@app/assets/js/discordwrapper');
const { Client } = require('discord-rpc-patch');

const mockLogin = jest.fn().mockResolvedValue();

jest.mock('discord-rpc-patch', () => ({
    Client: jest.fn(() => ({
        on: jest.fn(),
        login: mockLogin,
        setActivity: jest.fn(),
        clearActivity: jest.fn(),
        destroy: jest.fn(),
    })),
}), { virtual: true });

jest.mock('@app/assets/js/langloader', () => ({
    queryJS: jest.fn(),
}));

describe('DiscordWrapper', () => {
    it('should initialize the RPC client', () => {
        const genSettings = {
            clientId: '12345',
            smallImageKey: 'test-small-key',
            smallImageText: 'test-small-text',
        };
        const servSettings = {
            shortId: 'test-short-id',
            largeImageKey: 'test-large-key',
            largeImageText: 'test-large-text',
        };

        DiscordWrapper.initRPC(genSettings, servSettings);

        expect(mockLogin).toHaveBeenCalledWith({ clientId: '12345' });
    });
});
