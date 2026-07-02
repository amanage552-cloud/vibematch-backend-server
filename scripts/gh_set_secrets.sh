#!/usr/bin/env bash
# Helper to set required GitHub repository secrets for mobile builds using `gh` CLI.
# Usage: export required env vars locally and run this script from the repo root.

set -euo pipefail

REPO="${GITHUB_REPO:-$(git config --get remote.origin.url || true)}"
if [ -z "$REPO" ]; then
  echo "Unable to determine repo. Set GITHUB_REPO or run from a git checkout with origin configured." >&2
  exit 1
fi

command -v gh >/dev/null 2>&1 || { echo "gh CLI is required: https://cli.github.com/" >&2; exit 1; }

function set_secret() {
  local name="$1"; local value="$2"
  if [ -z "$value" ]; then
    echo "Skipping $name (empty)"
    return
  fi
  echo "Setting secret $name..."
  echo -n "$value" | gh secret set "$name" --repo "$REPO" --body - >/dev/null
}

echo "Repository: $REPO"

# Secrets supported by the mobile-builds workflow
set_secret CERT_P12_BASE64 "${CERT_P12_BASE64:-}" 
set_secret CERT_P12_PASSWORD "${CERT_P12_PASSWORD:-}"
set_secret PROVISIONING_PROFILE_BASE64 "${PROVISIONING_PROFILE_BASE64:-}"
set_secret IOS_WORKSPACE "${IOS_WORKSPACE:-}"
set_secret IOS_PROJECT "${IOS_PROJECT:-}"
set_secret IOS_SCHEME "${IOS_SCHEME:-}"
set_secret IOS_EXPORT_METHOD "${IOS_EXPORT_METHOD:-}"

set_secret ANDROID_KEYSTORE_BASE64 "${ANDROID_KEYSTORE_BASE64:-}"
set_secret ANDROID_KEYSTORE_PASSWORD "${ANDROID_KEYSTORE_PASSWORD:-}"
set_secret ANDROID_KEY_ALIAS "${ANDROID_KEY_ALIAS:-}"
set_secret ANDROID_KEY_PASSWORD "${ANDROID_KEY_PASSWORD:-}"

set_secret SERVER_URL "${SERVER_URL:-}"

echo "Done. Verify secrets in your repository settings or run 'gh secret list --repo $REPO'"
