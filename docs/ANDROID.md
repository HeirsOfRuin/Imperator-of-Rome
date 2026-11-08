# Imperator: the Android app

The itch.io Android download is the single-file build of the game (`npm run build:app`, the same
file as the desktop download) inside a Capacitor WebView, the way Knight of Adalia's and House of
Adalia's apps are made. It plays offline; the app keeps the saves on the phone. Nothing is built on
your own machine: GitHub builds the APK (`.github/workflows/android.yml`).

## Getting the APK off GitHub
1. On github.com, signed in, open the repository's **Actions** tab.
2. Choose **Android app** in the list on the left.
3. Open the newest run with a green tick.
4. Scroll to **Artifacts** and download **imperator-android**. It is a zip with the APK inside:
   - `imperator.apk` when the signing secrets are set: publish this one;
   - `imperator-TEST.apk` when they are not: try it on your own phone, never publish it.
5. Unzip it and upload the `.apk` to itch with only **Android** ticked.

Artifacts are kept 30 days. A new one is built on every push that changes the game. Once this
workflow is on the default branch, **Run workflow** on the same page builds one on demand.

## The signing key (once)
Android installs an update over an installed app only if both were signed with the same key. The
key is never in the repository. Imperator uses the same key as Knight of Adalia's and House of
Adalia's apps (key alias `knight`). In this repository: **Settings > Secrets and variables >
Actions > New repository secret**, twice, with the same values as in Knight of Adalia's repository:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the keystore file, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | its password |

GitHub never shows a secret again once saved, so copy the values from where you keep the keystore,
not from Knight of Adalia's settings page. The apps are different apps
(`io.github.heirsofruin.imperator` here) and install side by side. **The appId is permanent** once
an APK is published.

## What is in the repository
- `capacitor.config.json`: the app id, name, the web folder (`dist/app`) and the background colour.
- `android/`: the Android project Capacitor generated (`npx cap add android`), with two edits in
  `app/build.gradle`: the version code is the workflow's run number, so every APK installs over the
  last; and the release signing block reads the key from the workflow's environment.
- `tools/android-icons.mjs`: draws the launcher icons and splash screens from `icons/`. Re-run it if
  the icons change.

## Not yet proved here
A cloud session has no Android SDK, so the APK is built only by the workflow. The first build of
this setup is the check: a run with a green tick and an `imperator-android` artifact.
