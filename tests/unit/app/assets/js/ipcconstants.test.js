const IpcConstants = require('@app/assets/js/ipcconstants');

describe('IpcConstants', () => {
    it('should export the correct AZURE_CLIENT_ID', () => {
        expect(IpcConstants.AZURE_CLIENT_ID).toBe('1ce6e35a-126f-48fd-97fb-54d143ac6d45');
    });
});
