const fs = require('fs-extra');
const os = require('os');
const path = require('path');

// Mock fs-extra
jest.mock('fs-extra', () => ({
  pathExists: jest.fn(),
  ensureDir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  move: jest.fn(),

  pathExistsSync: jest.fn(() => false),
  ensureDirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const ConfigManager = require('@app/assets/js/configmanager');

describe('ConfigManager', () => {

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be an object', () => {
    expect(typeof ConfigManager).toBe('object');
  });

  describe('load()', () => {
    it('should create a default config if one does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);
      await ConfigManager.load();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should load an existing config file', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify({ settings: { game: { resWidth: 1920 } } }));
      await ConfigManager.load();
      expect(ConfigManager.getGameWidth()).toBe(1920);
    });

    it('should handle a corrupt config file', async () => {
        fs.pathExists.mockResolvedValue(true);
        fs.readFile.mockResolvedValue('not json');
        await ConfigManager.load();
        expect(fs.writeFile).toHaveBeenCalled();
        expect(ConfigManager.getGameWidth()).toBe(1280); // Default value
    });
  });

  describe('save()', () => {
    it('should save the current config to a file', async () => {
        fs.pathExists.mockResolvedValue(false);
        await ConfigManager.load();
        ConfigManager.setGameWidth(1920);
        await ConfigManager.save();
        const savedConfig = JSON.parse(fs.writeFile.mock.calls[1][1]);
        expect(savedConfig.settings.game.resWidth).toBe(1920);
    });
  });

});
