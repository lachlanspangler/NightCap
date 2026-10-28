#!/usr/bin/env bash
# sim.sh — our own simulator, addressed ONLY by its UDID (CLAUDE.md "Running alongside NightOut").
# Never `simctl shutdown all`, never touch other devices, never quit Simulator.app.
#
#   scripts/sim.sh create            create "NightCap iPhone" (iPhone 17 Pro, iOS 26.x) → .sim-udid
#   scripts/sim.sh udid              print our UDID
#   scripts/sim.sh boot              boot ours (and show it in Simulator.app)
#   scripts/sim.sh expo-go           download Expo Go (SDK 54) once and install it on ours
#   scripts/sim.sh open <url>        open a URL on ours (exp://127.0.0.1:8091/--/path)
#   scripts/sim.sh shot <name>       screenshot → docs/media/<name>.png
#   scripts/sim.sh record-start <n>  start recording → docs/media/<n>.mov (PID in .run/record.pid)
#   scripts/sim.sh record-stop       stop our recording
#   scripts/sim.sh shutdown          shut down ours
#   scripts/sim.sh erase             erase ours (only ours)
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="NightCap iPhone"
UDID_FILE=.sim-udid
EXPO_GO_URL="https://github.com/expo/expo-go-releases/releases/download/Expo-Go-54.0.7/Expo-Go-54.0.7.tar.gz"
EXPO_GO_DIR=.data/expo-go-54.0.7

udid() {
  [[ -f $UDID_FILE ]] || { echo "no simulator yet: scripts/sim.sh create" >&2; exit 2; }
  local u
  u=$(tr -d '[:space:]' < $UDID_FILE)
  xcrun simctl list devices | grep -q "$u" || { echo "our simulator $u is gone: scripts/sim.sh create" >&2; exit 2; }
  echo "$u"
}

state() { xcrun simctl list devices | grep "$1" | sed -E 's/.*\((Booted|Shutdown|Creating|Shutting Down)\).*/\1/'; }

case "${1:-}" in
  create)
    if [[ -f $UDID_FILE ]] && xcrun simctl list devices | grep -q "$(cat $UDID_FILE)"; then
      echo "already have $(cat $UDID_FILE)"; exit 0
    fi
    runtime=$(xcrun simctl list runtimes | grep -E '^iOS 26\.' | tail -1 | sed -E 's/.* - (com\.apple\.CoreSimulator\.SimRuntime\.[^ ]+).*/\1/')
    [[ -n $runtime ]] || runtime=$(xcrun simctl list runtimes | grep -E '^iOS ' | tail -1 | sed -E 's/.* - (com\.apple\.CoreSimulator\.SimRuntime\.[^ ]+).*/\1/')
    u=$(xcrun simctl create "$NAME" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro "$runtime")
    echo "$u" > $UDID_FILE
    echo "created $NAME $u ($runtime)"
    ;;
  udid) udid ;;
  boot)
    u=$(udid)
    [[ "$(state "$u")" == "Booted" ]] || xcrun simctl boot "$u"
    xcrun simctl bootstatus "$u" -b >/dev/null
    # Show it if Simulator.app is around (it runs fine headless for screenshots/recording too).
    open -a "$(xcode-select -p)/Applications/Simulator.app" --args -CurrentDeviceUDID "$u" 2>/dev/null || true
    echo "booted $u"
    ;;
  expo-go)
    u=$(udid)
    app=$EXPO_GO_DIR/ExpoGo.app
    if [[ ! -f $app/Info.plist ]]; then
      # The release tarball holds the .app's *contents*, so unpack it into an ExpoGo.app bundle dir.
      mkdir -p "$app"
      curl -fsSL "$EXPO_GO_URL" -o $EXPO_GO_DIR/expo-go.tar.gz
      tar -xzf $EXPO_GO_DIR/expo-go.tar.gz -C "$app"
      rm $EXPO_GO_DIR/expo-go.tar.gz
    fi
    xcrun simctl install "$u" "$app"
    echo "Expo Go installed on $u"
    ;;
  open)
    u=$(udid)
    xcrun simctl openurl "$u" "${2:?url}"
    ;;
  shot)
    u=$(udid)
    mkdir -p docs/media
    xcrun simctl io "$u" screenshot --type=png "docs/media/${2:?name}.png" >/dev/null
    echo "docs/media/$2.png"
    ;;
  record-start)
    u=$(udid)
    mkdir -p docs/media .run
    nohup xcrun simctl io "$u" recordVideo --codec=h264 --force "docs/media/${2:?name}.mov" > .run/record.log 2>&1 &
    echo $! > .run/record.pid
    sleep 1
    echo "recording → docs/media/$2.mov (pid $(cat .run/record.pid))"
    ;;
  record-stop)
    [[ -f .run/record.pid ]] || { echo "not recording"; exit 0; }
    pid=$(cat .run/record.pid)
    kill -INT "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    rm -f .run/record.pid
    echo "recording stopped"
    ;;
  shutdown)
    u=$(udid)
    [[ "$(state "$u")" == "Shutdown" ]] || xcrun simctl shutdown "$u"
    echo "shut down $u"
    ;;
  erase)
    u=$(udid)
    [[ "$(state "$u")" == "Shutdown" ]] || xcrun simctl shutdown "$u"
    xcrun simctl erase "$u"
    echo "erased $u"
    ;;
  *) sed -n '2,16p' "$0"; exit 2 ;;
esac
