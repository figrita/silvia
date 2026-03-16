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

function normalizeTimestamps(dir) {
    const epoch = new Date('2025-01-01T00:00:00Z')
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) normalizeTimestamps(full)
        try { fs.utimesSync(full, epoch, epoch) } catch {}
    }
}

function zipDir(dirPath, zipPath, { preserveMacOS = false } = {}) {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
    const dirName = path.basename(dirPath)
    const parentDir = path.dirname(dirPath)

    if (preserveMacOS && process.platform === 'darwin') {
        // ditto preserves macOS resource forks, extended attributes, and code signatures
        execSync(`ditto -c -k --sequesterRsrc "${dirPath}" "${zipPath}"`, { stdio: 'inherit' })
    } else if (process.platform === 'win32') {
        normalizeTimestamps(dirPath)
        // PowerShell Compress-Archive is available on all modern Windows
        execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${dirPath}' -DestinationPath '${zipPath}'"`, { stdio: 'inherit' })
    } else {
        // -X strips extra file attributes (uid/gid)
        normalizeTimestamps(dirPath)
        execSync(`cd "${parentDir}" && zip -Xr "${zipPath}" "${dirName}"`, { stdio: 'inherit' })
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
SANDBOX="$DIR/lib/chrome-sandbox"

# Check chrome-sandbox has correct SUID permissions for Electron sandboxing
if [ -f "$SANDBOX" ]; then
    OWNER=$(stat -c '%u' "$SANDBOX" 2>/dev/null)
    PERMS=$(stat -c '%a' "$SANDBOX" 2>/dev/null)
    if [ "$OWNER" != "0" ] || [ "$PERMS" != "4755" ]; then
        echo "Silvia needs to set up sandbox permissions (one-time setup)."
        echo "This requires sudo to set ownership on lib/chrome-sandbox."
        read -p "Fix now? [Y/n] " answer
        case "$answer" in
            [nN]*) echo "Aborted. You can run ./install.sh later to fix this."; exit 1 ;;
            *)
                sudo chown root:root "$SANDBOX" && sudo chmod 4755 "$SANDBOX"
                if [ $? -ne 0 ]; then
                    echo "Failed to set permissions. Try running: ./install.sh"
                    exit 1
                fi
                echo "Sandbox permissions set."
                ;;
        esac
    fi
fi

export SILVIA_WORKSPACE="$DIR"
exec "$DIR/lib/silvia" "$@"
`
    fs.writeFileSync(path.join(dest, NAME), launcher, { mode: 0o755 })

    // Create install script to fix chrome-sandbox permissions (required for Electron sandboxing)
    const installScript = `#!/bin/bash
echo "Setting up Silvia sandbox permissions (requires sudo)..."
DIR="$(cd "$(dirname "$0")" && pwd)"
sudo chown root:root "$DIR/lib/chrome-sandbox"
sudo chmod 4755 "$DIR/lib/chrome-sandbox"
echo "Done. You can now run ./Silvia"
`
    fs.writeFileSync(path.join(dest, 'install.sh'), installScript, { mode: 0o755 })

    // Copy icon
    if (fs.existsSync(ICON_PNG)) {
        fs.copyFileSync(ICON_PNG, path.join(dest, 'silvia.png'))
    }

    // Copy docs + licenses
    copyDocs(dest)

    // Write quickstart
    const quickstart = `QUICKSTART -- Linux

Run ./Silvia from a terminal.

If it fails with a sandbox error, run ./install.sh first (one-time, needs
sudo). This sets ownership and SUID permissions on lib/chrome-sandbox, which
Chromium's security sandbox requires on some Linux configurations. It isolates
the renderer process from the rest of your system. Not every distro needs this
-- it depends on your kernel's user namespace settings.

This folder is your workspace. Patches save to saves/, imported media goes
in assets/. Both are created automatically on first run.

Audio Loopback (PipeWire)

  The loopback/ folder has scripts for virtual audio routing:
    ./loopback/create_loopback.sh    Create virtual sink + source
    ./loopback/remove_loopback.sh    Remove them

Troubleshooting

  "The SUID sandbox helper binary was found, but is not configured correctly"
    Run ./install.sh, or manually:
      sudo chown root:root lib/chrome-sandbox
      sudo chmod 4755 lib/chrome-sandbox
`
    fs.writeFileSync(path.join(dest, 'QUICKSTART.txt'), quickstart)

    // Copy loopback scripts (Linux only)
    const loopbackDir = path.join(ROOT, 'loopback')
    if (fs.existsSync(loopbackDir)) {
        copyRecursive(loopbackDir, path.join(dest, 'loopback'))
    }

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
    const libDir = path.join(dest, 'lib')

    console.log(`Packaging Windows -> ${destName}/`)

    // Clean previous
    removeRecursive(dest)
    fs.mkdirSync(libDir, { recursive: true })

    // Move all files from win-unpacked into lib/
    for (const entry of fs.readdirSync(src)) {
        fs.renameSync(path.join(src, entry), path.join(libDir, entry))
    }
    fs.rmdirSync(src)

    // Create launcher .cmd (set workspace to this folder, start /b hides console)
    const launcher = `@echo off\r\nset SILVIA_WORKSPACE=%~dp0\r\nstart "" /b "%~dp0lib\\${NAME}.exe" %*\r\n`
    fs.writeFileSync(path.join(dest, `${NAME}.cmd`), launcher)

    // Copy icon
    if (fs.existsSync(ICON_ICO)) {
        fs.copyFileSync(ICON_ICO, path.join(dest, 'silvia.ico'))
    }

    // Create desktop.ini for folder icon
    const desktopIni = `[.ShellClassInfo]\r\nIconResource=silvia.ico,0\r\n`
    fs.writeFileSync(path.join(dest, 'desktop.ini'), desktopIni)

    // Write quickstart
    const quickstart = `QUICKSTART -- Windows\r\n\r\nDouble-click Silvia.cmd to launch.\r\n\r\nWindows SmartScreen may warn on first run. Click "More info" then\r\n"Run anyway" -- the app is unsigned, not malicious.\r\n\r\nThis folder is your workspace. Patches save to saves\\, imported media\r\ngoes in assets\\. Both are created automatically on first run.\r\n`
    fs.writeFileSync(path.join(dest, 'QUICKSTART.txt'), quickstart)

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

        // Write quickstart
        const quickstart = `QUICKSTART -- macOS

Right-click Silvia.app and choose Open. macOS Gatekeeper blocks unsigned
apps on double-click, but right-click > Open lets you bypass it once.

If you get "Silvia.app is damaged and can't be opened", run this in Terminal:
  xattr -cr Silvia.app
Then right-click > Open again.

This folder is your workspace. Patches save to saves/, imported media goes
in assets/. Both are created automatically on first run.
`
        fs.writeFileSync(path.join(dest, 'QUICKSTART.txt'), quickstart)

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
