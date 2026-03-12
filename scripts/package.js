#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const pkg = require(path.join(ROOT, 'package.json'))
const VERSION = pkg.version
const NAME = pkg.build.productName || 'Silvia'

// Files to include from repo root
const DOCS = ['README.md', 'LICENSE']
const LICENSES_DIR = path.join(ROOT, 'licenses')
const ICON_PNG = path.join(ROOT, 'assets', 'icons', 'android-chrome-512x512.png')
const ICON_ICO = path.join(ROOT, 'assets', 'icons', 'favicon.ico')

function copyRecursive(src, dest) {
    const stat = fs.statSync(src)
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true })
        for (const entry of fs.readdirSync(src)) {
            copyRecursive(path.join(src, entry), path.join(dest, entry))
        }
    } else {
        fs.copyFileSync(src, dest)
    }
}

function removeRecursive(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
    }
}

function copyDocs(destDir) {
    for (const doc of DOCS) {
        const src = path.join(ROOT, doc)
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(destDir, doc))
        }
    }
    if (fs.existsSync(LICENSES_DIR)) {
        copyRecursive(LICENSES_DIR, path.join(destDir, 'licenses'))
    }
}

function zipDir(dirPath, zipPath, { preserveMacOS = false } = {}) {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
    const dirName = path.basename(dirPath)
    const parentDir = path.dirname(dirPath)

    if (preserveMacOS && process.platform === 'darwin') {
        // ditto preserves macOS resource forks, extended attributes, and code signatures
        execSync(`ditto -c -k --sequesterRsrc "${dirPath}" "${zipPath}"`, { stdio: 'inherit' })
    } else {
        // -X strips extra file attributes (uid/gid), touch normalizes timestamps
        execSync(`find "${dirPath}" -exec touch -t 202501010000.00 {} + && cd "${parentDir}" && zip -Xr "${zipPath}" "${dirName}"`, { stdio: 'inherit' })
    }
    console.log(`  -> ${path.relative(ROOT, zipPath)}`)
}

// --- Linux ---
function packageLinux() {
    const src = path.join(DIST, 'linux-unpacked')
    if (!fs.existsSync(src)) {
        console.log('Skipping Linux: dist/linux-unpacked/ not found')
        return
    }

    const destName = `${NAME}-${VERSION}-linux`
    const dest = path.join(DIST, destName)
    const libDir = path.join(dest, 'lib')

    console.log(`Packaging Linux -> ${destName}/`)

    // Clean previous
    removeRecursive(dest)
    fs.mkdirSync(libDir, { recursive: true })

    // Move all files from linux-unpacked into lib/
    for (const entry of fs.readdirSync(src)) {
        fs.renameSync(path.join(src, entry), path.join(libDir, entry))
    }
    fs.rmdirSync(src)

    // Create launcher script
    const launcher = `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
export SILVIA_WORKSPACE="$DIR"
exec "$DIR/lib/silvia" "$@"
`
    fs.writeFileSync(path.join(dest, NAME), launcher, { mode: 0o755 })

    // Copy icon
    if (fs.existsSync(ICON_PNG)) {
        fs.copyFileSync(ICON_PNG, path.join(dest, 'silvia.png'))
    }

    // Copy docs + licenses
    copyDocs(dest)

    // Zip
    zipDir(dest, path.join(DIST, `${destName}.zip`))

    console.log('  Linux done.')
}

// --- Windows ---
function packageWin() {
    const src = path.join(DIST, 'win-unpacked')
    if (!fs.existsSync(src)) {
        console.log('Skipping Windows: dist/win-unpacked/ not found')
        return
    }

    const destName = `${NAME}-${VERSION}-win`
    const dest = path.join(DIST, destName)

    console.log(`Packaging Windows -> ${destName}/`)

    // Clean previous
    removeRecursive(dest)

    // Rename the folder
    fs.renameSync(src, dest)

    // Copy icon
    if (fs.existsSync(ICON_ICO)) {
        fs.copyFileSync(ICON_ICO, path.join(dest, 'silvia.ico'))
    }

    // Create desktop.ini for folder icon
    const desktopIni = `[.ShellClassInfo]\r\nIconResource=silvia.ico,0\r\n`
    fs.writeFileSync(path.join(dest, 'desktop.ini'), desktopIni)

    // Copy docs + licenses
    copyDocs(dest)

    // Zip
    zipDir(dest, path.join(DIST, `${destName}.zip`))

    console.log('  Windows done.')
}

// --- macOS ---
function packageMac() {
    const variants = [
        { src: 'mac', suffix: 'mac' },
        { src: 'mac-arm64', suffix: 'mac-arm64' },
    ]

    for (const { src: srcName, suffix } of variants) {
        const src = path.join(DIST, srcName)
        if (!fs.existsSync(src)) {
            console.log(`Skipping macOS (${suffix}): dist/${srcName}/ not found`)
            continue
        }

        const destName = `${NAME}-${VERSION}-${suffix}`
        const dest = path.join(DIST, destName)

        console.log(`Packaging macOS (${suffix}) -> ${destName}/`)

        // Clean previous
        removeRecursive(dest)
        fs.mkdirSync(dest, { recursive: true })

        // Move .app into the new folder
        const appName = `${NAME}.app`
        const appSrc = path.join(src, appName)
        if (fs.existsSync(appSrc)) {
            fs.renameSync(appSrc, path.join(dest, appName))
        }

        // Copy docs + licenses
        copyDocs(dest)

        // Clean up empty source dir
        removeRecursive(src)

        // Zip (preserve macOS code signatures and resource forks)
        zipDir(dest, path.join(DIST, `${destName}.zip`), { preserveMacOS: true })

        console.log(`  macOS (${suffix}) done.`)
    }
}

// --- Main ---
const target = process.argv[2] || 'all'

console.log(`\nPackaging ${NAME} v${VERSION} (${target})\n`)

switch (target) {
    case 'linux':
        packageLinux()
        break
    case 'win':
        packageWin()
        break
    case 'mac':
        packageMac()
        break
    case 'all':
        packageLinux()
        packageWin()
        packageMac()
        break
    default:
        console.error(`Unknown target: ${target}`)
        console.error('Usage: node scripts/package.js [linux|win|mac|all]')
        process.exit(1)
}

console.log('\nDone.\n')
