# Amphora

An idle gacha game of Greek myth: summon marble heroes, build a team of five and fight turn-based battles across the lands of legend.

## Download (Windows)

Get **Amphora-Setup.exe** from the [latest release](https://github.com/cheesymc91-beep/Amphora/releases/latest) and run it.

- Installs for your Windows account only. No administrator rights needed.
- Windows may say "Windows protected your PC" because the installer isn't code-signed. Click **More info → Run anyway**.
- Prefer no installer? Download the portable `.zip`, unzip it anywhere and run `Amphora.exe`.

## Updates

The app checks this repository for new versions when it starts and every few hours. New versions download in the background, are checked against SHA-256 fingerprints, and start the next time you restart the game. Your progress is stored on your own PC (`%APPDATA%\Amphora`) and is never touched by updates.

## What's in this repository

- `updates/manifest.json`: the current game version, release notes and a fingerprint for every file.
- `updates/game/`: the game itself (HTML, CSS, JavaScript and icons).
