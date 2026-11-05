# Amphora for Android

A small Android app around the Amphora web app (served from this repository's GitHub Pages site). It always shows the newest published game and keeps working offline after the first start.

Built by `.github/workflows/build-android.yml`. The release signing key (`amphora-release.p12`) is created on the first build and protected by the `ANDROID_KEY_PASSWORD` repository secret. Keep that password: Android only accepts updates signed with the same key.
