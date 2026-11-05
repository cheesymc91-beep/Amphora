# Amphora

An idle gacha game of Greek myth: summon marble heroes, build a team of five and fight turn-based battles across the lands of legend.

## Download (Windows)

Get **Amphora-Setup.exe** from the [latest release](https://github.com/cheesymc91-beep/Amphora/releases/latest) and run it.

- Installs for your Windows account only. No administrator rights needed.
- Windows may say "Windows protected your PC" because the installer isn't code-signed. Click **More info → Run anyway**.
- Prefer no installer? Download the portable `.zip`, unzip it anywhere and run `Amphora.exe`.

## Download (Mac)

From the [latest release](https://github.com/cheesymc91-beep/Amphora/releases/latest):

- **Amphora-Mac-AppleSilicon.dmg** for Macs with an M1, M2, M3 or M4 chip (most Macs from late 2020 on).
- **Amphora-Mac-Intel.dmg** for older Intel Macs.

Not sure which? Apple menu → About This Mac: "Chip: Apple M…" means Apple Silicon, "Processor: Intel" means Intel.

Open the .dmg and drag **Amphora** into **Applications**. The app isn't notarized by Apple, so the first time macOS will refuse to open it:

1. Try to open Amphora once, and click **Done** (or OK) on the warning.
2. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to the message about Amphora. Confirm with your password.

After that it opens normally. (On macOS 14 or older you can instead right-click Amphora → **Open** → **Open**.)

## Updates

The app checks this repository for new versions when it starts and every few hours. New versions download in the background, are checked against SHA-256 fingerprints, and start the next time you restart the game. Your progress is stored on your own PC (`%APPDATA%\Amphora`) and is never touched by updates.

## What's in this repository

- `updates/manifest.json`: the current game version, release notes and a fingerprint for every file.
- `updates/game/`: the game itself (HTML, CSS, JavaScript and icons).
