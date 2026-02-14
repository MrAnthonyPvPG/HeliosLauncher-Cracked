const AuthManager = require('@app/assets/js/authmanager');
const ConfigManager = require('@app/assets/js/configmanager');

jest.mock('@app/assets/js/configmanager', () => ({
    addMojangAuthAccount: jest.fn(),
    removeAuthAccount: jest.fn(),
    save: jest.fn(),
}));

describe('AuthManager', () => {
    it('should add a Mojang account', async () => {
        await AuthManager.addMojangAccount('testuser', 'testpass');
        expect(ConfigManager.addMojangAuthAccount).toHaveBeenCalledWith(
            expect.any(String),
            'offline-access-token',
            'testuser',
            'testuser'
        );
        expect(ConfigManager.save).toHaveBeenCalled();
    });

    it('should remove a Mojang account', async () => {
        await AuthManager.removeMojangAccount('test-uuid');
        expect(ConfigManager.removeAuthAccount).toHaveBeenCalledWith('test-uuid');
        expect(ConfigManager.save).toHaveBeenCalled();
    });
});
