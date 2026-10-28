// The live night: a full-screen camera with one huge shutter (DRUNK_UX). Shots go straight into the
// shared roll; nobody (not even you, besides a counter) sees anything else until the morning.
// On the simulator (no camera) a dev viewfinder cycles generated night photos and uploads them
// through the same API path (ADR 0007).
import { formatLocalTime } from "@nightcap/core";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError } from "../../src/api";
import { HoldButton } from "../../src/components/HoldButton";
import { AvatarStack, BigButton, ErrorNote, Gap, IconButton, Loading, Txt } from "../../src/components/ui";
import { API_URL, MOCK } from "../../src/config";
import { setFocusedNight } from "../../src/focus";
import { haptic } from "../../src/haptics";
import { fonts, night as N, scaleFor } from "../../src/theme";
import type { Night } from "../../src/types";
import { useApi } from "../../src/useApi";

const useDevViewfinder = MOCK && !Device.isDevice;

function DevViewfinder({ frame }: { frame: number }) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          transform: [
            { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1.16] }) },
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-8, 10] }) },
          ],
        },
      ]}
    >
      <Image
        source={{ uri: `${API_URL}/dev/sample/${frame}` }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={400}
      />
    </Animated.View>
  );
}

/** A labelled camera control: words beat glyphs at 1am (design review M1 #10). */
function ChromePill({
  label,
  a11y,
  onPress,
  height,
  testID,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  height: number;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: height,
        paddingHorizontal: 16,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(12,10,20,0.62)",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, color: N.text, fontSize: 16 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function LiveNight() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<{ night: Night }>(`/nights/${id}`, { pollMs: 8_000 });
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("back");
  const [frame, setFrame] = useState(() => Math.floor(Math.random() * 40));
  const [sending, setSending] = useState(0);
  const [taken, setTaken] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  const flash = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const scale = scaleFor(true); // the camera is always night mode
  const n = q.data?.night;

  useEffect(() => {
    setFocusedNight(id);
    return () => setFocusedNight(null);
  }, [id]);
  useEffect(() => {
    if (n && n.phase !== "live") router.replace(`/album/${n.id}`);
  }, [n?.phase, n?.id, n]);
  useEffect(() => {
    if (!useDevViewfinder && perm && !perm.granted && perm.canAskAgain) void requestPerm();
  }, [perm, requestPerm]);

  if (!n) {
    return (
      <View style={{ flex: 1, backgroundColor: N.bg }}>
        {q.error ? <ErrorNote message={q.error.message} /> : <Loading />}
      </View>
    );
  }
  if (!n.me.isParticipant) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: N.bg, padding: 20 }}>
        <Txt v="title">You&apos;re not in this night yet.</Txt>
        <Gap />
        <BigButton label="Back" scale={scale} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const left = taken === null ? n.me.shotsLeft : Math.max(0, n.me.shotsLeft - taken);
  const full = left <= 0;
  const others = n.participants.filter((p) => p.shots > 0).reduce((k, p) => k + p.shots, 0);

  const shoot = async () => {
    if (full) return;
    setError(null);
    haptic.shutter();
    flash.setValue(1);
    Animated.timing(flash, {
      toValue: 0,
      duration: 380,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    setTaken((t) => (t ?? 0) + 1);
    setSending((s) => s + 1);
    try {
      let uri: string;
      if (useDevViewfinder) {
        const target = `${FileSystem.cacheDirectory}nightcap-dev-${Date.now()}.jpg`;
        uri = (await FileSystem.downloadAsync(`${API_URL}/dev/sample/${frame}`, target)).uri;
        setFrame((f) => (f + 1 + Math.floor(Math.random() * 5)) % 48);
      } else {
        const pic = await cam.current?.takePictureAsync({ quality: 0.8, exif: false, skipProcessing: false });
        if (!pic) throw new Error("The camera didn't take that one. Try again?");
        uri = pic.uri;
      }
      const form = new FormData();
      form.append("photo", { uri, name: "shot.jpg", type: "image/jpeg" } as unknown as Blob);
      await api("POST", `/nights/${n.id}/shots`, form);
      if (useDevViewfinder) void FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (e) {
      setTaken((t) => Math.max(0, (t ?? 1) - 1));
      setError(e instanceof ApiError ? e.message : "That one didn't make it. Try again?");
      haptic.warn();
    } finally {
      setSending((s) => s - 1);
      void q.refresh().then(() => setTaken(null));
    }
  };

  const end = async () => {
    try {
      await api("POST", `/nights/${n.id}/end`);
      haptic.success();
      router.replace(`/album/${n.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }} testID="live-night">
      {useDevViewfinder ? (
        <DevViewfinder frame={frame} />
      ) : perm?.granted ? (
        <CameraView ref={cam} style={StyleSheet.absoluteFill} facing={facing} animateShutter={false} />
      ) : (
        <View
          style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", padding: 30 }]}
        >
          <Txt v="heading" center>
            NightCap needs the camera to add to tonight&apos;s roll.
          </Txt>
          <Gap />
          <BigButton label="Allow camera" scale={scale} onPress={() => void requestPerm()} />
        </View>
      )}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(12,10,20,0.18)" }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: "#FFF6E8", opacity: flash }]}
      />

      <SafeAreaView style={{ flex: 1, justifyContent: "space-between" }}>
        {/* Top: who's here, the code, and a way out. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ChromePill
              testID="night-close"
              label="‹ Home"
              a11y="Back to home"
              height={scale.target}
              onPress={() => router.replace("/(tabs)")}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bodyBold, color: N.text, fontSize: 17 }} numberOfLines={1}>
                {n.crew ? `${n.crew.emoji} ${n.crew.name}` : (n.title ?? "Tonight")}
              </Text>
              <Text
                style={{ fontFamily: fonts.body, color: N.textDim, fontSize: 14 }}
              >{`Develops at ${n.unlockAtLabel}`}</Text>
            </View>
            <Pressable
              testID="night-invite"
              accessibilityRole="button"
              accessibilityLabel={`Add people. Night code ${n.code?.split("").join(" ")}`}
              onPress={() => router.push(`/invite/${n.id}`)}
              style={{
                minHeight: scale.target,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: "rgba(12,10,20,0.6)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: fonts.bodyBold, color: N.amber, fontSize: 13 }}>CODE</Text>
              <Text style={{ fontFamily: fonts.display, color: N.text, fontSize: 20, letterSpacing: 3 }}>
                {n.code}
              </Text>
            </Pressable>
          </View>
          <Gap h={10} />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              alignSelf: "flex-start",
              backgroundColor: "rgba(12,10,20,0.6)",
              borderRadius: 999,
              paddingVertical: 6,
              paddingLeft: 6,
              paddingRight: 14,
            }}
          >
            <AvatarStack people={n.participants} size={30} max={6} ring="rgba(12,10,20,0.9)" />
            <Text
              style={{ fontFamily: fonts.bodySemi, color: N.text, fontSize: 14 }}
              testID="night-roll-count"
            >
              {`${n.total} in the roll`}
            </Text>
          </View>
        </View>

        {/* Bottom: counter · shutter · flip/end */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          {error && (
            <>
              <ErrorNote message={error} />
              <Gap h={10} />
            </>
          )}
          {showEnd && (
            <View
              style={{
                backgroundColor: "rgba(12,10,20,0.88)",
                borderRadius: 24,
                padding: 16,
                marginBottom: 14,
              }}
            >
              <Txt v="heading" scale={scale}>
                Wrap up the night?
              </Txt>
              <Txt
                v="label"
                tone="textDim"
              >{`No more shots after this. It still develops at ${formatLocalTime(new Date(n.unlockAt), n.tz)}, or when everyone's up.`}</Txt>
              <Gap h={12} />
              <HoldButton
                testID="night-end-hold"
                label="Hold to end the night"
                scale={scale}
                onConfirm={end}
              />
              <Gap h={8} />
              <BigButton
                label="Keep going"
                kind="quiet"
                primary={false}
                scale={scale}
                onPress={() => setShowEnd(false)}
              />
            </View>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ width: 112 }} accessibilityLabel={`${left} shots left`}>
              <Animated.Text
                testID="shots-left"
                style={{
                  fontFamily: fonts.display,
                  fontSize: 52,
                  color: full ? N.textDim : N.text,
                  transform: [
                    { scale: pop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.18, 1] }) },
                  ],
                }}
              >
                {left}
              </Animated.Text>
              <Text style={{ fontFamily: fonts.bodySemi, color: N.textDim, fontSize: 14, marginTop: -4 }}>
                {sending ? "sending…" : "left"}
              </Text>
            </View>
            {full ? (
              <View style={{ flex: 1, alignItems: "center" }}>
                <Txt v="label" center>
                  Roll&apos;s full.
                </Txt>
                <Txt v="small" tone="textDim" center>
                  You&apos;re in the moment now.
                </Txt>
              </View>
            ) : (
              <Pressable
                testID="shutter"
                accessibilityRole="button"
                accessibilityLabel="Take a photo"
                onPress={shoot}
                style={({ pressed }) => ({
                  width: scale.primary + 8,
                  height: scale.primary + 8,
                  borderRadius: (scale.primary + 8) / 2,
                  borderWidth: 6,
                  borderColor: N.amber,
                  alignItems: "center",
                  justifyContent: "center",
                  transform: [{ scale: pressed ? 0.92 : 1 }],
                })}
              >
                <View
                  style={{
                    width: scale.primary - 14,
                    height: scale.primary - 14,
                    borderRadius: (scale.primary - 14) / 2,
                    backgroundColor: N.text,
                  }}
                />
              </Pressable>
            )}
            <View style={{ width: 112, alignItems: "flex-end", gap: 10 }}>
              {!useDevViewfinder && (
                <IconButton
                  label="Flip camera"
                  glyph="⟲"
                  scale={scale}
                  onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
                />
              )}
              {n.me.canEnd && (
                <ChromePill
                  testID="night-end"
                  label="Wrap up"
                  a11y="Wrap up the night"
                  height={scale.target}
                  onPress={() => setShowEnd(true)}
                />
              )}
            </View>
          </View>
          <Gap h={8} />
          <Text style={{ fontFamily: fonts.bodySemi, color: N.textDim, fontSize: 16, textAlign: "center" }}>
            {others > 0
              ? "Nobody else sees a thing until morning."
              : "Snap away. Nobody else sees a thing until morning."}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
