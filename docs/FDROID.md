# Publishing on F-Droid

F-Droid builds apps from source, so no signing keys or binaries are needed from us.

1. Tag a release (`git tag v0.1.0 && git push --tags`). Keep `versionCode`/`versionName` in
   `android/app/build.gradle` in sync, and add `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`.
2. Fork <https://gitlab.com/fdroid/fdroiddata> and add `metadata/io.github.uricorn.contractiontimer.yml`
   (draft below), then open a merge request. Check it locally with `fdroid lint` and `fdroid build`.
3. The store listing (title, descriptions, changelogs) is read from `fastlane/metadata/android`.

Before submitting, add screenshots to `fastlane/metadata/android/en-US/images/phoneScreenshots/`
and a 512x512 `images/icon.png`.

```yaml
Categories:
  - Health & Fitness
License: MIT
AuthorName: Uricorn
SourceCode: https://github.com/Uricorn/Contraction-Timer
IssueTracker: https://github.com/Uricorn/Contraction-Timer/issues

AutoName: Contraction Timer

RepoType: git
Repo: https://github.com/Uricorn/Contraction-Timer.git

Builds:
  - versionName: 0.1.0
    versionCode: 1
    commit: v0.1.0
    subdir: android/app
    sudo:
      - apt-get update
      - apt-get install -y nodejs npm
    init: cd ../.. && npm ci && npm run android:sync
    gradle:
      - yes

AutoUpdateMode: Version
UpdateCheckMode: Tags
CurrentVersion: 0.1.0
CurrentVersionCode: 1
```

Notes: the recipe is a starting point and will need adjusting to F-Droid's current Node tooling
guidance during review. The app has no Google/proprietary dependencies, and no tracking.
