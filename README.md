# Contraction Timer

[![CI](https://github.com/Uricorn/Contraction-Timer/actions/workflows/ci.yml/badge.svg)](https://github.com/Uricorn/Contraction-Timer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A minimal contraction timer for labour that runs **fully offline** — in the browser (installable PWA)
or as an Android app. No account, no ads, no analytics; data never leaves your device.

**Try it:** <https://uricorn.github.io/Contraction-Timer/> (after enabling GitHub Pages, see below)

## Features

- One big start/stop button; the background colour shows contracting / resting at a glance
- Live timer for the current contraction and the rest since the last one
- One-hour averages: number of contractions, average length, average time apart
- Pause and resume (paused gaps are left out of the averages)
- 5-1-1 / 4-1-1 / 3-1-1 guideline alert (your choice), plus a "when to call right away" card
- A "When to call" panel where each digit of 5-1-1 / 4-1-1 / 3-1-1 has its own progress meter
- Tips tab: breathing pacer, words to say, evidence-rated partner tips with links to Cochrane, NHS and NICE
- Calm, soft design with light and dark modes; the button gently breathes during a contraction
- History with delete, CSV export, and "clear all"
- Screen stays awake while a contraction is running; state survives closing the app or restarts
- Works offline (service worker on the web, bundled assets on Android)

> **Not medical advice.** Always follow guidance from your midwife or doctor.

## Development

Requires Node 22+.

```sh
npm ci
npm run dev        # http://localhost:3000
npm test           # unit tests (Vitest)
npm run lint       # ESLint
npm run build      # type-check + production build into dist/
```

Stack: TypeScript, Vite, Vitest, Capacitor — no UI framework, ~5 kB of JS. The timing logic lives in
[`src/logic.ts`](src/logic.ts) and is unit tested; the UI is in [`src/main.ts`](src/main.ts).

### Android

Requires JDK 21 and the Android SDK.

```sh
npm run android:sync                      # build web app and copy into the Android project
cd android && ./gradlew assembleDebug     # APK in android/app/build/outputs/apk/debug
```

Or open `android/` in Android Studio. The app id is `io.github.uricorn.contractiontimer`.

## CI/CD

| Workflow                                       | When         | What                                                   |
| ---------------------------------------------- | ------------ | ------------------------------------------------------ |
| [`ci.yml`](.github/workflows/ci.yml)           | push / PR    | lint, format check, tests, build, debug APK (artifact) |
| [`pages.yml`](.github/workflows/pages.yml)     | push to main | deploys the web app to GitHub Pages                    |
| [`release.yml`](.github/workflows/release.yml) | tag `v*`     | builds the APK and creates a GitHub release            |

One-time setup: **Settings → Pages → Source: GitHub Actions**. To publish a signed APK add the secrets
`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS`; without them the release
contains an unsigned APK. Dependabot keeps npm, Gradle and Actions up to date.

## F-Droid

The app has no proprietary dependencies and fastlane store metadata is included. See
[docs/FDROID.md](docs/FDROID.md) for the submission steps and a draft build recipe.

## Credits

Feature inspiration: [petewritescode/contraction-timer](https://github.com/petewritescode/contraction-timer).

## License

[MIT](LICENSE)

## Dependencies

Kept deliberately small: two runtime packages (Capacitor) and a modern, current toolchain
(Vite, TypeScript, Vitest, ESLint flat config). `npm audit` is clean; `overrides` in
`package.json` pin patched `minimatch`/`glob` for the Capacitor CLI and can be dropped once it
updates. Dependabot runs weekly with grouped PRs (we start on the latest versions).
