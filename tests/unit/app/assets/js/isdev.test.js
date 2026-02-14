const isDev = require('@app/assets/js/isdev');

describe('isDev', () => {
    it('should be a boolean', () => {
        expect(typeof isDev).toBe('boolean');
    });
});
