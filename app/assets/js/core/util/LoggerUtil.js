class LoggerUtil {
    static getLogger(label) {
        return {
            info: (message, ...args) => console.info(LoggerUtil._format(label, 'INFO', message, args)),
            warn: (message, ...args) => console.warn(LoggerUtil._format(label, 'WARN', message, args)),
            error: (message, ...args) => console.error(LoggerUtil._format(label, 'ERROR', message, args)),
            debug: (message, ...args) => console.debug(LoggerUtil._format(label, 'DEBUG', message, args))
        }
    }

    static _format(label, level, message, args) {
        // Simple timestamp format YYYY-MM-DD HH:MM:SS
        const now = new Date();
        const timestamp = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + ' ' +
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');

        let msg = `[${timestamp}] [${level}] [${label}]: ${message}`;
        if (args && args.length > 0) {
            const formattedArgs = args.map(arg => {
                if (arg instanceof Error) return arg.stack || arg.message;
                if (typeof arg === 'object') return JSON.stringify(arg);
                return arg;
            }).join(' ');
             if(formattedArgs.length > 0) msg += ' ' + formattedArgs;
        }
        return msg;
    }
}

module.exports = { LoggerUtil }
