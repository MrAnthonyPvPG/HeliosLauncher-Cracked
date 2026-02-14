const LangLoader = require('@app/assets/js/langloader');
const fs = require('fs-extra');
const toml = require('toml');

jest.mock('fs-extra', () => ({
    readFileSync: jest.fn(),
}));

jest.mock('toml', () => ({
    parse: jest.fn(),
}));

describe('LangLoader', () => {
    beforeEach(() => {
        fs.readFileSync.mockReturnValue('');
        toml.parse.mockReturnValue({
            js: {
                test: {
                    test: 'test',
                },
            },
            ejs: {
                test: {
                    test: 'test',
                },
            },
        });
        LangLoader.loadLanguage('en_US');
    });

    it('should query the correct JS string', () => {
        expect(LangLoader.queryJS('test.test')).toBe('test');
    });

    it('should query the correct EJS string', () => {
        expect(LangLoader.queryEJS('test.test')).toBe('test');
    });
});
