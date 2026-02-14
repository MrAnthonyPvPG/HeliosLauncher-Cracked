const os = require('os')
const { exec } = require('child_process') // Built-in Node.js module
const checkDiskSpace = require('check-disk-space').default

// Configurable thresholds
const TOTAL_RAM_THRESHOLD_GB = 6
const FREE_RAM_THRESHOLD_GB = 0.8
const FREE_DISK_THRESHOLD_GB = 10

// Convert GB to Bytes for comparison
const BYTES_PER_GB = 1024 * 1024 * 1024

/**
 * Gets the actual available system memory in gigabytes.
 * This method works correctly across macOS, Linux, and Windows.
 * @returns {Promise<number>} A promise that resolves to the available RAM in GB.
 */
function getAvailableRamGb() {
    return new Promise((resolve, reject) => {
        const platform = os.platform()

        if (platform === 'darwin') { // macOS
            exec('vm_stat', (err, stdout) => {
                if (err) return reject(err)

                // On macOS, available RAM is the sum of free and inactive pages.
                const freePages = parseInt(stdout.match(/Pages free:\s+(\d+)/)[1])
                const inactivePages = parseInt(stdout.match(/Pages inactive:\s+(\d+)/)[1])
                const pageSize = 4096 // Page size is typically 4096 bytes.

                const availableBytes = (freePages + inactivePages) * pageSize
                resolve(availableBytes / BYTES_PER_GB)
            })
        } else if (platform === 'linux') {
            // On Linux, /proc/meminfo provides a direct 'MemAvailable' value.
            exec('grep MemAvailable /proc/meminfo', (err, stdout) => {
                if (err || !stdout) {
                    // Fallback for older kernels without MemAvailable.
                    return resolve(os.freemem() / BYTES_PER_GB)
                }
                const availableKb = parseInt(stdout.split(/\s+/)[1])
                resolve(availableKb / (1024 * 1024))
            })
        } else { // win32 and other platforms
            // os.freemem() is generally accurate enough on Windows.
            resolve(os.freemem() / BYTES_PER_GB)
        }
    })
}

/**
 * Performs system requirement checks for RAM and disk space.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of warning keys.
 */
exports.performChecks = async function() {
    const warnings = []

    try {
        // 2. Available RAM Check (every launch)
        const availableRam = await getAvailableRamGb()
        console.log(`Available RAM: ${availableRam.toFixed(2)} GB`)
        if (availableRam < FREE_RAM_THRESHOLD_GB) {
            warnings.push('lowFreeRAM')
        }
    } catch (err) {
        console.error('Error checking available RAM:', err)
        // Fallback to the old method on error.
        if (os.freemem() / BYTES_PER_GB < FREE_RAM_THRESHOLD_GB) {
            warnings.push('lowFreeRAM')
        }
    }

    // 3. Free Disk Space Check (every launch)
    try {
        const diskSpace = await checkDiskSpace(os.platform() === 'win32' ? 'C:' : '/')
        const freeDisk = diskSpace.free / BYTES_PER_GB
        if (freeDisk < FREE_DISK_THRESHOLD_GB) {
            warnings.push('lowDiskSpace')
        }
    } catch (err) {
        console.error('Error checking disk space:', err)
    }

    return warnings
}