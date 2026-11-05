# Amphora desktop shell

The small Electron program that runs the game as a desktop app on Windows and Mac.

- `main.js`: the window, keyboard shortcuts and the auto-updater (reads `update.json`, downloads new game files from `updates/`, checks every file against its SHA-256 fingerprint).
- `preload.js`: the update banner and the version line in the help window.
- `icon.png`, `amphora.ico`: app icons.

The Mac app is built by `.github/workflows/build-mac.yml` on GitHub's Mac machines. The game files are taken from `updates/game` at build time, so a new build always bundles the latest game.
