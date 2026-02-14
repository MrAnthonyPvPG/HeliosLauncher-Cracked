const { ipcRenderer } = require('electron')
const fs = require('fs-extra')
const { app } = require('@electron/remote')
const os = require('os')
const path = require('path')

const ConfigManager = require('./configmanager')
const { DistroAPI } = require('./distromanager')
const LangLoader = require('./langloader')
const { LoggerUtil } = require('./core/util/LoggerUtil')
const { retry } = require('./util')
let Sentry

const logger = LoggerUtil.getLogger('Preloader')

async function preloader() {
    logger.info('Loading..')

    LangLoader.setupLanguage()

    try {
        Sentry = require('@sentry/electron/renderer')
        Sentry.init({
            dsn: 'https://f02442d2a0733ac2c810b8d8d7f4a21e@o4508545424359424.ingest.de.sentry.io/4508545432027216',
            release: 'FLauncher@' + app.getVersion(),
        })

        const systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            cpu: os.cpus(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            hostname: os.hostname(),
        }

        Sentry.setContext('system', systemInfo)
    } catch (error) {
        logger.warn('Sentry initialization failed:', error)
    }

    try {
        await ConfigManager.load()
    } catch (err) {
        logger.error('Error loading config:', err)
        ipcRenderer.send('distributionIndexDone', false)
        return
    }

    DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
    DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()

    LangLoader.setupLanguage()

    try {
        const heliosDistro = await DistroAPI.getDistribution()
        logger.info('Loaded distribution index.')

        if (heliosDistro) {
            if (ConfigManager.getSelectedServer() == null || heliosDistro.getServerById(ConfigManager.getSelectedServer()) == null) {
                logger.info('Determining default selected server..')
                ConfigManager.setSelectedServer(heliosDistro.getMainServer().rawServer.id)
                await ConfigManager.save()
            }
            ipcRenderer.send('distributionIndexDone', true)
        } else {
            logger.error('Loaded distribution index is null.')
            ipcRenderer.send('distributionIndexDone', false) 
        }

    } catch (err) {
        logger.error('Failed to load distribution index, continuing in offline mode.', err)
        sendToSentry(`Failed to load distribution index: ${err.message}`, 'error')
        ipcRenderer.send('distributionIndexDone', false)
    }

    try {
        await retry(() => fs.remove(path.join(os.tmpdir(), ConfigManager.getTempNativeFolder())))
        logger.info('Cleaned natives directory.')
    } catch (err) {
        if (err.code === 'EACCES') {
            logger.warn('Could not clean natives directory, permission denied.')
        } else {
            logger.warn('Error while cleaning natives directory:', err)
            sendToSentry(`Error cleaning natives directory: ${err.message}`, 'error')
        }
    }
}

// Capture log or error and send to Sentry
function sendToSentry(message, type = 'info') {
    if (Sentry) {
        if (type === 'error') {
            Sentry.captureException(new Error(message))
        } else {
            Sentry.captureMessage(message)
        }
    }
}

module.exports = { sendToSentry }

preloader()