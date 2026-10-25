#!/bin/bash
# macOS 26(Tahoe)은 Icon Composer(.icon)로 만들지 않은 아이콘을 Dock에서 회색 판 위에 올려 표시합니다.
# Tauri 번들러는 .icon을 컴파일하지 못하므로, 빌드된 RunTime.app에 직접 Assets.car를 넣고 다시 서명합니다.
# 사용법: scripts/apply-mac-icon.sh [RunTime.app 경로]
set -euo pipefail

cd "$(dirname "$0")/.."
APP="${1:-src-tauri/target/release/bundle/macos/RunTime.app}"
ICON_SRC="$PWD/src-tauri/icons/RunTime.icon"
ICON_NAME="RunTime"

# xcode-select가 Command Line Tools를 가리켜도 Xcode가 설치돼 있으면 사용합니다.
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

[ -d "$APP" ] || { echo "앱을 찾을 수 없습니다: $APP" >&2; exit 1; }
xcrun --find actool >/dev/null 2>&1 || { echo "actool이 없습니다. Xcode 26 이상이 필요합니다." >&2; exit 1; }

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

xcrun actool "$ICON_SRC" --compile "$OUT" \
  --output-format human-readable-text --notices --warnings --errors \
  --output-partial-info-plist "$OUT/partial.plist" \
  --app-icon "$ICON_NAME" --include-all-app-icons \
  --enable-on-demand-resources NO --development-region en \
  --target-device mac --minimum-deployment-target 26.0 --platform macosx

RES="$APP/Contents/Resources"
cp "$OUT/Assets.car" "$RES/Assets.car"
cp "$OUT/$ICON_NAME.icns" "$RES/$ICON_NAME.icns"
rm -f "$RES/icon.icns"

PLIST="$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile $ICON_NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleIconName string $ICON_NAME" "$PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Set :CFBundleIconName $ICON_NAME" "$PLIST"

codesign --force --deep -s - "$APP"
touch "$APP"
echo "아이콘 적용 완료: $APP"
