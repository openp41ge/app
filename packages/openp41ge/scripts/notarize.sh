#!/usr/bin/env bash
# ─── notarize — sign, notarize, and staple a macOS .app bundle ────────────
#
# Usage:
#   ./scripts/notarize.sh                    # build + sign + notarize dist/Openp41ge.app
#   ./scripts/notarize.sh /path/to/Openp41ge.app # notarize existing signed app
#
# Required secrets (stored in .secrets/ — one variable per file):
#   NOTARY_APPLE_ID       Apple ID email (e.g. you@example.com)
#   NOTARY_TEAM_ID        Team ID (10-character hex, e.g. ABC123DEFG)
#   NOTARY_APP_PASSWORD   App-specific password for notarization
#
# On first run, missing variables are prompted for and saved to .secrets/
# for future use.
# ──────────────────────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")/.."

SECRETS_DIR="$PWD/.secrets"
SIGN_FLAG="${1:-}"

# ─── Resolve app path ────────────────────────────────────────────────────

if [ -n "${1:-}" ] && [ "${1:0:1}" != "-" ]; then
  APP_PATH="$1"
  shift
else
  # Default: look for a built .app in dist/
  APP_PATH=$(find dist -maxdepth 2 -name "*.app" -type d | head -1)
  if [ -z "$APP_PATH" ]; then
    echo "❌ No .app bundle found in dist/. Build one first or pass the path."
    echo "   Usage: $0 [/path/to/App.app]"
    exit 1
  fi
  echo "📦 Using app bundle: $APP_PATH"
fi

if [ ! -d "$APP_PATH" ]; then
  echo "❌ Not a directory: $APP_PATH"
  exit 1
fi

APP_NAME=$(basename "$APP_PATH" .app)

# ─── Load/prompt secrets ─────────────────────────────────────────────────

mkdir -p "$SECRETS_DIR"

load_or_prompt() {
  local var_name="$1"
  local prompt_text="$2"
  local secret="${3:-false}"
  local file="$SECRETS_DIR/$var_name"

  if [ -f "$file" ]; then
    # Read existing value
    export "$var_name"=$(cat "$file")
  else
    if [ "$secret" = "true" ]; then
      read -s -p "$prompt_text: " value
      echo
    else
      read -p "$prompt_text: " value
    fi
    echo "$value" > "$file"
    export "$var_name"="$value"
    echo "   ✓ Saved to $file"
  fi
}

load_or_prompt "NOTARY_APPLE_ID"     "Apple ID email"           "false"
load_or_prompt "NOTARY_TEAM_ID"      "Team ID (10-char hex)"    "false"
load_or_prompt "NOTARY_APP_PASSWORD" "App-specific password"    "true"

echo
echo "🔐 Secrets loaded from: $SECRETS_DIR"

# ─── 1. Code sign the app bundle (if --sign or no existing signature) ────

DO_SIGN=false
if [ "${1:-}" = "--sign" ] || [ "${1:-}" = "-s" ]; then
  DO_SIGN=true
fi

if [ "$DO_SIGN" = true ]; then
  echo
  echo "✍️  Signing $APP_PATH ..."
  codesign --deep --force --verify --verbose \
    --sign "Developer ID Application: $APP_NAME ($NOTARY_TEAM_ID)" \
    --options runtime \
    "$APP_PATH"
  echo "   ✓ Signed"
fi

# ─── 2. Verify existing signature ────────────────────────────────────────

echo
echo "🔍 Verifying signature ..."
codesign --verify --deep --verbose=2 "$APP_PATH" 2>&1 || {
  echo "⚠️  App is not signed. Re-run with --sign flag to sign it."
  exit 1
}

# ─── 3. Create zip for submission ────────────────────────────────────────

ZIP_PATH="$(dirname "$APP_PATH")/${APP_NAME}.zip"
echo
echo "📦 Creating $ZIP_PATH ..."
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"
echo "   ✓ Created"

# ─── 4. Submit to Apple Notary ───────────────────────────────────────────

echo
echo "⬆️  Submitting to Apple Notary service ..."
OUTPUT=$(xcrun notarytool submit "$ZIP_PATH" \
  --apple-id "$NOTARY_APPLE_ID" \
  --team-id "$NOTARY_TEAM_ID" \
  --password "$NOTARY_APP_PASSWORD" \
  --wait 2>&1)
echo "$OUTPUT"

# Extract the submission ID
SUBMISSION_ID=$(echo "$OUTPUT" | grep -oE 'id: [a-f0-9-]+' | head -1 | cut -d' ' -f2)
if [ -z "$SUBMISSION_ID" ]; then
  echo "❌ Could not extract submission ID from output. Check log above."
  exit 1
fi

# Check success
if echo "$OUTPUT" | grep -qi "Accepted"; then
  echo "✅ Notarization accepted (submission: $SUBMISSION_ID)"
else
  echo "❌ Notarization result unknown. Check the log above."
  echo "   To view details: xcrun notarytool log $SUBMISSION_ID"
  exit 1
fi

# ─── 5. Staple the ticket ────────────────────────────────────────────────

echo
echo "📎 Stapling ticket to $APP_PATH ..."
xcrun stapler staple "$APP_PATH"
echo "   ✓ Stapled"

# ─── 6. Clean up zip ─────────────────────────────────────────────────────

echo
echo "🧹 Removing temporary zip ..."
rm "$ZIP_PATH"
echo "   ✓ Removed"

# ─── 7. Verify ───────────────────────────────────────────────────────────

echo
echo "✅ Verifying notarization ..."
spctl --assess --verbose=4 --type execute "$APP_PATH" 2>&1
echo
echo "🎉 Done — $APP_NAME is signed, notarized, and ready to distribute."
echo "   Run the following to verify Gatekeeper approves it:"
echo "   spctl --assess --verbose=4 --type execute \"$APP_PATH\""
