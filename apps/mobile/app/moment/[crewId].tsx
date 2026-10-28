// The weekly Nightcap (long-distance crews): one shot each, whatever your night looks like.
// It reveals when everyone's in, or when the window closes. Couch nights are first-class.
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, mediaUrl } from "../../src/api";
import { useCountdown } from "../../src/components/Countdown";
import { FilmTile } from "../../src/components/FilmTile";
import {
  Avatar,
  BigButton,
  Card,
  ErrorNote,
  Gap,
  IconButton,
  Loading,
  Pill,
  Txt,
} from "../../src/components/ui";
import { API_URL, MOCK } from "../../src/config";
import { haptic } from "../../src/haptics";
import { night as N } from "../../src/theme";
import type { Night } from "../../src/types";
import { useApi } from "../../src/useApi";
import { useMe } from "../../src/useMe";

interface MomentResp {
  window: { opensAt: string; closesAt: string; isOpen: boolean };
  open: Night | null;
  last: Night | null;
}

export default function Moment() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const q = useApi<MomentResp>(`/crews/${crewId}/moment`, { pollMs: 10_000 });
  const { scale } = useMe();
  const { width } = useWindowDimensions();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opens = useCountdown(q.data?.window.opensAt);
  const closes = useCountdown(q.data?.window.closesAt);
  const dev = MOCK && !Device.isDevice;
  if (!q.data)
    return (
      <View style={{ flex: 1, backgroundColor: N.bg }}>
        {q.error ? <ErrorNote message={q.error.message} /> : <Loading />}
      </View>
    );
  const { open, last, window } = q.data;
  const shown = open?.phase === "unlocked" ? open : (last ?? null);
  const posted = open?.me.shotsTaken ? open.me.shotsTaken > 0 : false;

  const snap = async () => {
    if (!open) return;
    setBusy(true);
    setError(null);
    haptic.shutter();
    try {
      let uri: string;
      if (dev)
        uri = (
          await FileSystem.downloadAsync(
            `${API_URL}/dev/sample/${Math.floor(Math.random() * 48)}`,
            `${FileSystem.cacheDirectory}moment-${Date.now()}.jpg`,
          )
        ).uri;
      else {
        if (!perm?.granted) await requestPerm();
        const pic = await cam.current?.takePictureAsync({ quality: 0.8, exif: false });
        if (!pic) throw new Error("No photo taken.");
        uri = pic.uri;
      }
      const form = new FormData();
      form.append("photo", { uri, name: "moment.jpg", type: "image/jpeg" } as unknown as Blob);
      await api("POST", `/nights/${open.id}/shots`, form);
      haptic.success();
      await q.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const size = (width - 40 - 10) / 2;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: N.bg }} testID="moment">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <IconButton label="Back" glyph="‹" scale={scale} onPress={() => router.back()} />
        <Gap h={12} />
        <Pill text="WEEKLY NIGHTCAP" tone="plum" />
        <Gap h={8} />
        <Txt v="title">Big night or a quiet one?</Txt>
        <Txt v="label" tone="textDim">
          One photo each. It reveals when everyone&apos;s in.
        </Txt>
        <Gap h={18} />
        {open && open.phase === "live" ? (
          <Card style={{ borderColor: "#9B7BE0" }}>
            <Txt v="heading">{posted ? "You're in. Waiting on the others." : "It's Nightcap time."}</Txt>
            <Txt
              v="label"
              tone="textDim"
            >{`Closes in ${closes.label}. ${open.participants.filter((p) => p.shots > 0).length} of ${open.participants.length} have posted.`}</Txt>
            <Gap h={12} />
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {open.participants.map((p) => (
                <View key={p.id} style={{ alignItems: "center", width: 60 }}>
                  <Avatar name={p.name} hue={p.hue} size={44} ring={p.shots > 0 ? N.amber : undefined} />
                  <Txt v="small" tone={p.shots > 0 ? "accent" : "textFaint"}>
                    {p.shots > 0 ? "in ✓" : p.name}
                  </Txt>
                </View>
              ))}
            </View>
            <Gap h={14} />
            {!posted && (
              <>
                {!dev && perm?.granted && (
                  <View style={{ height: 260, borderRadius: 20, overflow: "hidden", marginBottom: 12 }}>
                    <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" />
                  </View>
                )}
                <BigButton
                  testID="moment-snap"
                  label="Show us your night"
                  icon="◉"
                  scale={scale}
                  busy={busy}
                  onPress={snap}
                />
              </>
            )}
          </Card>
        ) : (
          <Card>
            <Txt v="heading">{`Next Nightcap in ${opens.label}`}</Txt>
            <Txt v="label" tone="textDim">
              {new Date(window.opensAt).toLocaleString(undefined, {
                weekday: "long",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Txt>
          </Card>
        )}
        {error && (
          <>
            <Gap />
            <ErrorNote message={error} />
          </>
        )}
        {shown && (
          <>
            <Gap h={24} />
            <Txt v="label" tone="textDim">
              {shown === open ? "TONIGHT'S NIGHTCAP" : "LAST TIME"}
            </Txt>
            <Gap h={10} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {shown.participants.map((p, i) => {
                const s = shown.shots.find((x) => x.authorId === p.id);
                return (
                  <View key={p.id} style={{ width: size }}>
                    {s ? (
                      <Image
                        source={{ uri: mediaUrl(s.url)!, cacheKey: `shot-${s.id}` }}
                        style={{ width: size, height: size * 1.33, borderRadius: 16 }}
                        contentFit="cover"
                      />
                    ) : (
                      <FilmTile frame={i + 1} size={size} label={`${p.name} sat this one out`} />
                    )}
                    <Gap h={6} />
                    <Txt v="label">{p.name}</Txt>
                    <Txt v="small" tone="textDim">
                      {s
                        ? new Date(s.takenAt).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "sat this one out"}
                    </Txt>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
