// ====================================================================
// PATCH: NON-ASCII (CYRILLIC) USERNAME FIX
// This block detects if the system TEMP path contains non-ASCII characters (like Cyrillic).
// If detected, it attempts to redirect temporary files to a safe, ASCII-only path
// to prevent Java/Native library loading errors (UnsatisfiedLinkError).
// ====================================================================
const fs = require('fs')
const os = require('os')
const path = require('path')

function tryFixCyrillicTemp() {
    try {
        const currentTemp = os.tmpdir()
        // Check for non-ASCII characters (e.g. Russian letters)
        const hasNonAscii = /[^\x00-\x7F]/.test(currentTemp)

        if (hasNonAscii) {
            console.log('[Setup] Non-ASCII characters detected in TEMP path. Attempting redirect...')
            
            // Define a safe path in the root data directory (C:\.foxford\temp_natives)
            const safePath = 'C:\\.foxford\\temp_natives'

            if (!fs.existsSync(safePath)) {
                fs.mkdirSync(safePath, { recursive: true })
            }

            // Override system environment variables for this process only
            process.env.TEMP = safePath
            process.env.TMP = safePath
            
            // Override Node's internal function
            const oldTmpDir = os.tmpdir
            os.tmpdir = () => safePath

            console.log(`[Setup] TEMP directory successfully redirected to: ${safePath}`)
        }
    } catch (err) {
        // If the fix fails, log it but DO NOT crash the app. Continue with defaults.
        console.warn('[Setup] Failed to apply Cyrillic temp fix. Continuing with default settings.', err)
    }
}

// Run the patch immediately before any other module loads
tryFixCyrillicTemp()
// ====================================================================

const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

// Requirements
const { app, BrowserWindow, ipcMain, Menu, shell, powerMonitor, dialog } = require('electron')
const autoUpdater                       = require('electron-updater').autoUpdater
const { spawn }                         = require('child_process')
const ejse                              = require('ejs-electron')
// fs, os, path are already imported at the top
const isDev                             = require('./app/assets/js/isdev')
const semver                            = require('semver')
const { pathToFileURL }                 = require('url')
const { AZURE_CLIENT_ID, MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, SHELL_OPCODE } = require('./app/assets/js/ipcconstants')
const LangLoader                        = require('./app/assets/js/langloader')
const SysUtil                           = require('./app/assets/js/sysutil')
const ConfigManager                     = require('./app/assets/js/configmanager')

// Set up single instance lock.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Focus the existing window if a user tries to open a second instance
        if (win) {
            if (win.isMinimized()) win.restore()
            win.focus()
        }
    })
}


// Setup Lang
LangLoader.setupLanguage()

/**
 * Determines if a file system error is non-critical and can be ignored without
 * triggering the administrative relaunch process.
 *
 * @param {Error} err The encountered error object (must have code, syscall, and path properties).
 * @returns {boolean} True if the error should be ignored, false if it is critical (i.e., requires admin intervention).
 */
function isIgnorableError(err) {
    // Check if the error code is related to basic permission denial (EPERM) or resource locking (EBUSY).
    if (err.code !== 'EPERM' && err.code !== 'EBUSY') return false

    // Ignore non-critical cleanup system calls (deletion of old files, directory removal, file status check).
    const isCleanup = err.syscall === 'unlink' || err.syscall === 'rmdir' || err.syscall === 'lstat'

    // CRITICAL CHECK: If the operation is NOT cleanup (i.e., open, write, or mkdir) 
    // AND it affects our designated safe directory (temp_natives). This indicates a serious failure
    // to establish the working environment, which requires admin intervention.
    if (!isCleanup && err.path && err.path.includes('temp_natives')) {
        return false // Do not ignore: This is a critical write/creation failure.
    }

    // Ignore errors occurring within standard system temporary folders or native library cache (non-critical collateral damage).
    const isTemp = err.path && (err.path.includes('Temp') || err.path.includes('WCNatives'))
    
    // Ignore the error if it involves standard temporary file paths OR is a general cleanup operation.
    return isTemp || isCleanup
}

// Global synchronous error handler
process.on('uncaughtException', (err) => {
    // 1. Check if this is a non-critical error we can ignore
    if (isIgnorableError(err)) {
        console.warn('[Warning] Suppressed non-critical EPERM error:', err.path)
        return // Keep running
    }

    // ENOSPC: no space left on device!
    if (err.code === 'ENOSPC') {
        console.warn('Disk full detected (ENOSPC). Sending warning to UI.')
        if (win && !win.isDestroyed()) {
            win.webContents.send('system-warnings', ['lowDiskSpace'])
        }
        return
    }

    if (err.code === 'EPERM') {
        // If returns true: we are handling/relaunching, stop execution.
        if (handleEPERM()) return 
    } else {
        console.error('An uncaught exception occurred:', err)
        dialog.showMessageBoxSync({
            type: 'error',
            title: 'Критическая ошибка',
            message: 'Произошла непредвиденная ошибка.',
            detail: err.message,
            buttons: ['Выйти']
        })
        app.quit()
    }
})

// Global asynchronous error handler (Promise rejections)
process.on('unhandledRejection', (reason, promise) => {
    // Convert reason to an Error object if possible for checking
    const err = reason instanceof Error ? reason : new Error(reason)
    err.code = reason.code || err.code
    err.path = reason.path || err.path
    err.syscall = reason.syscall || reason.syscall

    if (isIgnorableError(err)) {
        console.warn('[Warning] Suppressed non-critical Async EPERM error:', err.path)
        return
    }

    // ENOSPC: no space left on device!
    if (err.code === 'ENOSPC') {
        console.warn('Disk full detected (Async ENOSPC). Sending warning to UI.')
        if (win && !win.isDestroyed()) {
            win.webContents.send('system-warnings', ['lowDiskSpace'])
        }
        return
    }

    if (reason && reason.code === 'EPERM') {
        if (handleEPERM()) return
    } else {
        console.error('An unhandled rejection occurred:', reason)
        dialog.showMessageBoxSync({
            type: 'error',
            title: 'Критическая ошибка (async)',
            message: 'Произошла непредвиденная асинхронная ошибка.',
            detail: (reason && reason.message) ? reason.message : 'Неизвестная ошибка',
            buttons: ['Выйти']
        })
        app.quit()
    }
})

try {
    const Sentry = require('@sentry/electron/main')
    Sentry.init({
        dsn: 'https://f02442d2a0733ac2c810b8d8d7f4a21e@o4508545424359424.ingest.de.sentry.io/4508545432027216',
        release: 'FLauncher@' + app.getVersion(),
    })
} catch (error) {
    console.error('Sentry failed to initialize:', error)
}


// Setup auto updater.
let autoUpdateListeners = {}

function initAutoUpdater(event, data) {
    if(data){
        autoUpdater.allowPrerelease = true
    }
    
    if(isDev){
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml')
    }
    if(process.platform === 'darwin'){
        autoUpdater.autoDownload = false
    }

    // Event listeners for auto updater.
    const updateAvailableListener = info => {
        if (!event.sender.isDestroyed()) {
            event.sender.send('autoUpdateNotification', 'update-available', info)
        }
    }
    const updateDownloadedListener = info => {
        if (!event.sender.isDestroyed()) {
            event.sender.send('autoUpdateNotification', 'update-downloaded', info)
        }
    }
    const updateNotAvailableListener = info => {
        if (!event.sender.isDestroyed()) {
            event.sender.send('autoUpdateNotification', 'update-not-available', info)
        }
    }
    const checkingForUpdateListener = () => {
        if (!event.sender.isDestroyed()) {
            event.sender.send('autoUpdateNotification', 'checking-for-update')
        }
    }
    const errorListener = err => {
        if (!event.sender.isDestroyed()) {
            if (err.code === 'EPERM' || err.code === 'ENOENT') {
                event.sender.send('autoUpdateNotification', 'antivirus-issue')
            } else {
                event.sender.send('autoUpdateNotification', 'realerror', err)
            }
        }
    }

    autoUpdater.removeAllListeners('update-available')
    autoUpdater.removeAllListeners('update-downloaded')
    autoUpdater.removeAllListeners('update-not-available')
    autoUpdater.removeAllListeners('checking-for-update')
    autoUpdater.removeAllListeners('error')

    autoUpdater.on('update-available', updateAvailableListener)
    autoUpdater.on('update-downloaded', updateDownloadedListener)
    autoUpdater.on('update-not-available', updateNotAvailableListener)
    autoUpdater.on('checking-for-update', checkingForUpdateListener)
    autoUpdater.on('error', errorListener)
}

ipcMain.on('autoUpdateAction', (event, arg, data) => {
    if (!event.sender.isDestroyed()) {
        switch(arg){
            case 'initAutoUpdater':
                console.log('Initializing auto updater.')
                initAutoUpdater(event, data)
                event.sender.send('autoUpdateNotification', 'ready')
                break
            case 'checkForUpdate':
                autoUpdater.checkForUpdates()
                    .catch(err => {
                        if (!event.sender.isDestroyed()) {
                            if (err.code === 'EPERM' || err.code === 'ENOENT') {
                                event.sender.send('autoUpdateNotification', 'antivirus-issue')
                            } else {
                                event.sender.send('autoUpdateNotification', 'realerror', err)
                            }
                        }
                    })
                break
            case 'allowPrereleaseChange':
                if(!data){
                    const preRelComp = semver.prerelease(app.getVersion())
                    if(preRelComp != null && preRelComp.length > 0){
                        autoUpdater.allowPrerelease = true
                    } else {
                        autoUpdater.allowPrerelease = data
                    }
                } else {
                    autoUpdater.allowPrerelease = data
                }
                break
            case 'installUpdateNow':
                autoUpdater.quitAndInstall(false, true);
                break
            default:
                console.log('Unknown argument', arg)
                break
        }
    }
})

ipcMain.on('distributionIndexDone', (event, res) => {
    if (!event.sender.isDestroyed()) {
        event.sender.send('distributionIndexDone', res)
    }
})

ipcMain.handle(SHELL_OPCODE.TRASH_ITEM, async (event, ...args) => {
    try {
        await shell.trashItem(args[0])
        return { result: true }
    } catch(error) {
        return { result: false, error: error }
    }
})

app.disableHardwareAcceleration()

const REDIRECT_URI_PREFIX = 'https://login.microsoftonline.com/common/oauth2/nativeclient?'

let msftAuthWindow
let msftAuthSuccess
let msftAuthViewSuccess
let msftAuthViewOnClose
ipcMain.on(MSFT_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    if (msftAuthWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN, msftAuthViewOnClose)
        return
    }
    msftAuthSuccess = false
    msftAuthViewSuccess = arguments_[0]
    msftAuthViewOnClose = arguments_[1]
    msftAuthWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLoginTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('icon')
    })

    msftAuthWindow.on('closed', () => {
        msftAuthWindow = undefined
    })

    msftAuthWindow.on('close', () => {
        if(!msftAuthSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED, msftAuthViewOnClose)
        }
    })

    msftAuthWindow.webContents.on('did-navigate', (_, uri) => {
        if (uri.startsWith(REDIRECT_URI_PREFIX)) {
            const url = new URL(uri)
            const queryMap = Object.fromEntries(url.searchParams.entries())

            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.SUCCESS, queryMap, msftAuthViewSuccess)

            msftAuthSuccess = true
            msftAuthWindow.close()
            msftAuthWindow = null
        }
    })

    msftAuthWindow.removeMenu()
    msftAuthWindow.loadURL('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=' + AZURE_CLIENT_ID + '&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient')
})

let msftLogoutWindow
let msftLogoutSuccess
let msftLogoutSuccessSent
let msftLogoutTimeout
ipcMain.on(MSFT_OPCODE.OPEN_LOGOUT, (ipcEvent, uuid, isLastAccount) => {
    if (msftLogoutWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN)
        return
    }

    msftLogoutSuccess = false
    msftLogoutSuccessSent = false
    msftLogoutWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLogoutTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('icon')
    })

    msftLogoutWindow.on('closed', () => {
        if (msftLogoutTimeout) {
            clearTimeout(msftLogoutTimeout)
            msftLogoutTimeout = null
        }
        msftLogoutWindow = undefined
    })

    msftLogoutWindow.on('close', () => {
        if (msftLogoutTimeout) {
            clearTimeout(msftLogoutTimeout)
            msftLogoutTimeout = null
        }
        if(!msftLogoutSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED)
        } else if(!msftLogoutSuccessSent) {
            msftLogoutSuccessSent = true
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
        }
    })
    
    msftLogoutWindow.webContents.on('did-navigate', (_, uri) => {
        if(uri.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/logoutsession')) {
            msftLogoutSuccess = true
            msftLogoutTimeout = setTimeout(() => {
                if(!msftLogoutSuccessSent) {
                    msftLogoutSuccessSent = true
                    ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
                }

                if(msftLogoutWindow) {
                    msftLogoutWindow.close()
                    msftLogoutWindow = null
                }
            }, 5000)
        }
    })
    
    msftLogoutWindow.removeMenu()
    msftLogoutWindow.loadURL('https://login.microsoftonline.com/common/oauth2/v2.0/logout')
})

let win

function createWindow() {

    win = new BrowserWindow({
        width: 980,
        height: 552,
        icon: getPlatformIcon('icon'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'app', 'assets', 'js', 'preloader.js'),
            nodeIntegration: true,
            contextIsolation: false
        },
        backgroundColor: '#171614'
    })
    remoteMain.enable(win.webContents)

    const data = {
        bkid: Math.floor((Math.random() * fs.readdirSync(path.join(__dirname, 'app', 'assets', 'images', 'backgrounds')).length)),
        lang: (str, placeHolders) => LangLoader.queryEJS(str, placeHolders)
    }
    Object.entries(data).forEach(([key, val]) => ejse.data(key, val))

    win.loadURL(pathToFileURL(path.join(__dirname, 'app', 'app.ejs')).toString())

    win.once('ready-to-show', async () => {
        const warnings = await SysUtil.performChecks()
        if (win && !win.isDestroyed()) {
            
            // Protect against crashes when saving config
            try {
                if (!ConfigManager.getTotalRAMWarningShown()) {
                    const totalRam = os.totalmem() / (1024 * 1024 * 1024)
                    if (totalRam < 6) {
                        warnings.push('lowTotalRAM')
                        ConfigManager.setTotalRAMWarningShown(true)
                        await ConfigManager.save()
                    }
                }
            } catch (err) {
                if (err.code === 'EPERM') {
                    // If true (relaunch needed), stop execution.
                    // If false (ignore), continue showing window.
                    if (handleEPERM()) return 
                } else {
                    console.error('Failed to save config during ready-to-show:', err)
                }
            }

            if (warnings.length > 0) {
                win.webContents.send('system-warnings', warnings)
            }
            win.show()

            // Auto update
            setTimeout(() => {
                // 1. Safety check: Ensure the window still exists (user hasn't closed the app)
                if (win && !win.isDestroyed()) {
                    console.log('[AutoUpdate] Starting delayed update check...')
                    
                    // 2. Initialize logic (simulate an IPC event by passing the current window)
                    // Note: 'false' means we are not forcing pre-release settings
                    initAutoUpdater({ sender: win.webContents }, false)

                    // 3. trigger the check silently (non-blocking)
                    autoUpdater.checkForUpdates().catch(err => {
                        console.warn('[AutoUpdate] Background check error:', err)
                        // Log to console only, do not disturb the user with error popups
                    })
                }
            }, 15 * 60 * 1000) // 15 minutes * 60 seconds * 1000 ms
        }
    })

    win.removeMenu()

    win.resizable = true

    win.on('closed', () => {
        win = null
    })
}

function createMenu() {
    if(process.platform === 'darwin') {
        let applicationSubMenu = {
            label: 'Application',
            submenu: [{
                label: 'About Application',
                selector: 'orderFrontStandardAboutPanel:'
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                accelerator: 'Command+Q',
                click: () => {
                    app.quit()
                }
            }]
        }

        let editSubMenu = {
            label: 'Edit',
            submenu: [{
                label: 'Undo',
                accelerator: 'CmdOrCtrl+Z',
                selector: 'undo:'
            }, {
                label: 'Redo',
                accelerator: 'Shift+CmdOrCtrl+Z',
                selector: 'redo:'
            }, {
                type: 'separator'
            }, {
                label: 'Cut',
                accelerator: 'CmdOrCtrl+X',
                selector: 'cut:'
            }, {
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                selector: 'copy:'
            }, {
                label: 'Paste',
                accelerator: 'CmdOrCtrl+V',
                selector: 'paste:'
            }, {
                label: 'Select All',
                accelerator: 'CmdOrCtrl+A',
                selector: 'selectAll:'
            }]
        }

        let menuTemplate = [applicationSubMenu, editSubMenu]
        let menuObject = Menu.buildFromTemplate(menuTemplate)
        Menu.setApplicationMenu(menuObject)
    }
}

function getPlatformIcon(filename){
    let ext
    switch(process.platform) {
        case 'win32':
            ext = 'ico'
            break
        case 'darwin':
        case 'linux':
        default:
            ext = 'png'
            break
    }

    return path.join(__dirname, 'app', 'assets', 'images', `${filename}.${ext}`)
}

/**
 * Relaunches the application with Administrator privileges.
 */
function relaunchAsAdmin() {
    if (process.platform === 'win32') {
        
        // 1. Release the single instance lock immediately so the new admin instance
        // can start without being blocked by this current instance.
        app.releaseSingleInstanceLock()
        
        const exe = process.execPath
        // 2. Explicitly set working directory to the app's folder (avoids System32 default).
        const cwd = path.dirname(exe)

        // 3. Pass --relaunch-admin to signal that we've already tried elevating permissions.
        const command = `Start-Process -FilePath '${exe}' -WorkingDirectory '${cwd}' -ArgumentList '--relaunch-admin' -Verb RunAs`
        
        const ps = spawn('powershell.exe', ['-Command', command], {
            // windowsHide: true -> Hides the black console window but keeps it attached
            // to the session, allowing the UAC prompt to appear.
            windowsHide: true, 
            stdio: 'ignore'
        })

        ps.on('error', (err) => {
            // If PowerShell failed to start, reclaim the lock and notify the user.
            app.requestSingleInstanceLock() 
            dialog.showMessageBoxSync({
                type: 'error',
                title: 'Ошибка',
                message: 'Не удалось выполнить перезапуск.',
                detail: err.message,
                buttons: ['Выйти']
            })
            app.quit()
        })

        // 4. Wait for the 'exit' event. This triggers when the user interacts with the UAC prompt.
        // This ensures the command has been fully processed before closing the app.
        ps.on('exit', () => {
            app.quit()
        })

    } else {
        dialog.showMessageBoxSync({
            type: 'error',
            title: 'Ошибка прав доступа',
            message: 'Для продолжения работы требуются права администратора.',
            detail: 'Перезапустите приложение от имени администратора.',
            buttons: ['Выйти']
        })
        app.quit()
    }
}

/**
 * Handles critical EPERM (permission denied) errors.
 * Returns true if the application should stop execution (due to restart or quit).
 * Returns false if the error should be ignored (loop protection).
 */
function handleEPERM() {
    // Check for loop protection
    if (process.argv.includes('--relaunch-admin')) {
        console.error('[EPERM Loop Protection] Already admin, but EPERM persists. Ignoring error to keep app alive.')
        return false // Ignore error, continue execution
    }

    const choice = dialog.showMessageBoxSync({
        type: 'error',
        title: 'Ошибка прав доступа',
        message: 'Нужны права администратора, чтобы продолжить.',
        detail: 'Приложению не удается записать данные. Перезапустить с правами администратора?',
        buttons: ['Перезапустить', 'Выйти'],
        defaultId: 0,
        cancelId: 1
    })
    
    if (choice === 0) {
        relaunchAsAdmin()
    } else {
        app.quit()
    }
    return true // Stop execution
}

app.on('ready', async () => {
    try {
        await ConfigManager.load()
    } catch (err) {
        if (err.code === 'EPERM') {
            // Check if we should ignore the error and proceed, or stop for a restart.
            if (!handleEPERM()) {
                console.log('Proceeding despite config load failure...')
            } else {
                return 
            }
        } else {
            console.error('Error loading config:', err)
        }
    }
    createWindow()
    createMenu()
    powerMonitor.on('resume', () => {
        if (win && !win.isDestroyed()) {
            win.webContents.send('power-resume')
        }
    })
})

app.on('before-quit', () => {
    powerMonitor.removeAllListeners('resume')
})


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (win === null) {
        createWindow()
    }
})