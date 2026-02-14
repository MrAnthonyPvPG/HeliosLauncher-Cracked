const DropinModUtil = require('@app/assets/js/dropinmodutil');
const fs = require('fs-extra');
const path = require('path');
const { ipcRenderer } = require('electron');

jest.mock('fs-extra', () => ({
    ensureDirSync: jest.fn(),
    existsSync: jest.fn(),
    readdirSync: jest.fn(),
    moveSync: jest.fn(),
    rename: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

jest.mock('electron', () => ({
    ipcRenderer: {
        invoke: jest.fn(),
    },
}));

describe('DropinModUtil', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should validate that the directory exists', () => {
        DropinModUtil.validateDir('test-dir');
        expect(fs.ensureDirSync).toHaveBeenCalledWith('test-dir');
    });

    it('should scan for drop-in mods', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue(['test.jar', 'test.zip.disabled']);
        const mods = DropinModUtil.scanForDropinMods('test-dir', '1.12.2');
        expect(mods).toEqual([
            {
                fullName: 'test.jar',
                name: 'test.jar',
                ext: 'jar',
                disabled: false,
            },
            {
                fullName: 'test.zip.disabled',
                name: 'test.zip',
                ext: 'zip',
                disabled: true,
            },
            {
                fullName: path.join('1.12.2', 'test.jar'),
                name: 'test.jar',
                ext: 'jar',
                disabled: false,
            },
            {
                fullName: path.join('1.12.2', 'test.zip.disabled'),
                name: 'test.zip',
                ext: 'zip',
                disabled: true,
            },
        ]);
    });

    it('should add drop-in mods', () => {
        DropinModUtil.addDropinMods([{ name: 'test.jar', path: 'test-path' }], 'test-dir');
        expect(fs.moveSync).toHaveBeenCalledWith('test-path', path.join('test-dir', 'test.jar'));
    });

    it('should delete a drop-in mod', async () => {
        ipcRenderer.invoke.mockResolvedValue({ result: true });
        await DropinModUtil.deleteDropinMod('test-dir', 'test.jar');
        expect(ipcRenderer.invoke).toHaveBeenCalledWith('TRASH_ITEM', path.join('test-dir', 'test.jar'));
    });

    it('should toggle a drop-in mod', () => {
        DropinModUtil.toggleDropinMod('test-dir', 'test.jar', false);
        expect(fs.rename).toHaveBeenCalledWith(path.join('test-dir', 'test.jar'), path.join('test-dir', 'test.jar.disabled'), expect.any(Function));
    });

    it('should check if a drop-in mod is enabled', () => {
        expect(DropinModUtil.isDropinModEnabled('test.jar')).toBe(true);
        expect(DropinModUtil.isDropinModEnabled('test.jar.disabled')).toBe(false);
    });

    it('should scan for shaderpacks', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue(['test.zip']);
        const packs = DropinModUtil.scanForShaderpacks('test-dir');
        expect(packs).toEqual([
            {
                fullName: 'OFF',
                name: 'Off (Default)',
            },
            {
                fullName: 'test.zip',
                name: 'test',
            },
        ]);
    });

    it('should get the enabled shaderpack', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('shaderPack=test.zip');
        const pack = DropinModUtil.getEnabledShaderpack('test-dir');
        expect(pack).toBe('test.zip');
    });

    it('should set the enabled shaderpack', () => {
        DropinModUtil.setEnabledShaderpack('test-dir', 'test.zip');
        expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('test-dir', 'optionsshaders.txt'), 'shaderPack=test.zip', { encoding: 'utf-8' });
    });

    it('should add shaderpacks', () => {
        DropinModUtil.addShaderpacks([{ name: 'test.zip', path: 'test-path' }], 'test-dir');
        expect(fs.moveSync).toHaveBeenCalledWith('test-path', path.join('test-dir', 'shaderpacks', 'test.zip'));
    });
});
