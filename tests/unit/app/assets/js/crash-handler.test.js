const CrashHandler = require('@app/assets/js/crash-handler');
const fs = require('fs-extra');

// Mock fs-extra
jest.mock('fs-extra');

describe('CrashHandler', () => {

    // Reset mocks before each test
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock pathExists to return true by default
        fs.pathExists.mockResolvedValue(true);
    });

    describe('analyzeLog (synchronous)', () => {
        it('should detect corrupted TOML config files', () => {
            const log = 'Some log\nFailed loading config file example.toml\nMore log';
            const result = CrashHandler.analyzeLog(log);
            expect(result).toEqual({
                type: 'corrupted-config',
                file: 'example.toml',
                description: 'Ошибка загрузки конфига: example.toml'
            });
        });

        it('should detect corrupted .cfg files', () => {
            const log = 'Some log\nConfiguration file example.cfg is corrupt\nMore log';
            const result = CrashHandler.analyzeLog(log);
            expect(result).toEqual({
                type: 'corrupted-config',
                file: 'example.cfg',
                description: 'Файл конфигурации example.cfg поврежден.'
            });
        });

        it('should detect corrupted .json files (JsonSyntaxException)', () => {
            const log = 'Some log\ncom.google.gson.JsonSyntaxException: ... path/to/example.json\nMore log';
            const result = CrashHandler.analyzeLog(log);
            expect(result).toEqual({
                type: 'corrupted-config',
                file: 'example.json',
                description: 'Файл конфигурации example.json поврежден (ошибка синтаксиса).'
            });
        });

        it('should detect missing version json file (ENOENT)', () => {
            const log = "ENOENT: no such file or directory, open 'C:\\Users\\Dns11\\AppData\\Roaming\\.foxford\\common\\versions\\1.20.1-fabric-0.16.10\\1.20.1-fabric-0.16.10.json'";
            const result = CrashHandler.analyzeLog(log);
            expect(result).toEqual({
                type: 'missing-version-file',
                file: '1.20.1-fabric-0.16.10.json',
                description: "Файл версии поврежден. Нажми 'Исправить' для восстановления."
            });
        });

        it('should return null for unknown errors', () => {
            const log = 'Some random error\nSomething went wrong';
            const result = CrashHandler.analyzeLog(log);
            expect(result).toBeNull();
        });
    });

    describe('analyzeFile (asynchronous with partial read)', () => {
        const filePath = '/mock/path/to/latest.log';

        it('should read the file tail and detect crash', async () => {
            const crashLog = 'Some log content\nFailed loading config file corrupted.toml\nEnd of log';
            const fileSize = 2000;
            const buffer = Buffer.from(crashLog);

            // Mock fs.stat
            fs.stat.mockResolvedValue({ size: fileSize });

            // Mock fs.open
            const fd = 123;
            fs.open.mockResolvedValue(fd);

            // Mock fs.read
            fs.read.mockImplementation(async (fd, buf, offset, length, position) => {
                // Mimic reading content into buffer
                buffer.copy(buf);
                return { bytesRead: buffer.length, buffer: buf };
            });

            // Mock fs.close
            fs.close.mockResolvedValue();

            const result = await CrashHandler.analyzeFile(filePath);

            expect(fs.stat).toHaveBeenCalledWith(filePath);
            expect(fs.open).toHaveBeenCalledWith(filePath, 'r');
            // Should verify that fs.read was called. Argument verification for buffers is tricky but we can check calls.
            expect(fs.read).toHaveBeenCalled();
            expect(fs.close).toHaveBeenCalledWith(fd);

            expect(result).toEqual({
                type: 'corrupted-config',
                file: 'corrupted.toml',
                description: 'Ошибка загрузки конфига: corrupted.toml'
            });
        });

        it('should handle small files correctly (read entire file)', async () => {
            const content = "Short log";
            const fileSize = content.length;

            fs.stat.mockResolvedValue({ size: fileSize });
            fs.open.mockResolvedValue(123);
            fs.read.mockImplementation(async (fd, buf) => {
                const len = Buffer.from(content).copy(buf);
                return { bytesRead: len, buffer: buf };
            });
            fs.close.mockResolvedValue();

            const result = await CrashHandler.analyzeFile(filePath);
            expect(fs.read).toHaveBeenCalled();
            expect(result).toBeNull(); // "Short log" has no crash
        });

        it('should handle empty files', async () => {
            fs.stat.mockResolvedValue({ size: 0 });

            const result = await CrashHandler.analyzeFile(filePath);

            expect(fs.open).not.toHaveBeenCalled();
            expect(result).toBeNull();
        });

        it('should gracefully handle file read errors', async () => {
            fs.stat.mockRejectedValue(new Error('File not found'));

            // Mock console.error to keep test output clean
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await CrashHandler.analyzeFile(filePath);

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });

});
