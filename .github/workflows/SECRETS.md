Required GitHub repository secrets for `.github/workflows/mobile-builds.yml`

Set these secrets in your repository (Settings → Secrets → Actions) or use the included `scripts/gh_set_secrets.sh` which requires the GitHub CLI (`gh`).

Recommended secrets and purpose:

- `CERT_P12_BASE64` — base64-encoded iOS signing certificate (.p12). Optional if using automatic signing.
- `CERT_P12_PASSWORD` — password for the .p12 file.
- `PROVISIONING_PROFILE_BASE64` — base64-encoded provisioning profile (.mobileprovision).
- `IOS_WORKSPACE` — Xcode workspace path (e.g., `ios/VibeMatch.xcworkspace`).
- `IOS_PROJECT` — Xcode project path (e.g., `ios/VibeMatch.xcodeproj`).
- `IOS_SCHEME` — Xcode scheme to build (e.g., `VibeMatch`).
- `IOS_EXPORT_METHOD` — ad-hoc, enterprise, app-store (default: ad-hoc).

- `ANDROID_KEYSTORE_BASE64` — base64-encoded Android keystore (.jks or .keystore) for signing release APKs.
- `ANDROID_KEYSTORE_PASSWORD` — keystore password.
- `ANDROID_KEY_ALIAS` — alias inside keystore.
- `ANDROID_KEY_PASSWORD` — key password.

- `SERVER_URL` — public HTTPS URL where artifacts will be served (used to build manifest.plist URL).

Notes:
- iOS OTA installs require a valid HTTPS host and properly signed `ipa` using an enterprise or ad-hoc provisioning profile. Users must trust the provisioning profile on device.
- Android APKs need to be signed with a release key for install on devices without installation warnings.
- For security, prefer using GitHub Actions to upload final artifacts to a secure storage (S3/Cloud) rather than committing large binaries into the repo.

Example: use the `gh` CLI to set a secret from a local file

  export REPO=youruser/yourrepo
  export CERT_P12_BASE64=$(base64 -w0 path/to/cert.p12)
  gh secret set CERT_P12_BASE64 --repo "$REPO" --body "$CERT_P12_BASE64"
