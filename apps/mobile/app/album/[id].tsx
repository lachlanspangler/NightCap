// One night's album. Developing (night palette, countdown, the morning review, "I'm good") →
// unlocked (dawn palette; the first time you open it, every frame develops in front of you).
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError, mediaUrl } from "../../src/api";
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
import { setFocusedNight } from "../../src/focus";
import { haptic } from "../../src/haptics";
import { dawn, fonts, night as N, scaleFor } from "../../src/theme";
import type { Night, Shot } from "../../src/types";
import { useApi } from "../../src/useApi";
import { useMe } from "../../src/useMe";

const revealed = new Set<string>();

export default function Album() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<{ night: Night }>(`/nights/${id}`, { pollMs: 10_000 });
  const n = q.data?.night;
  useEffect(() => {
    setFocusedNight(id);
    return () => setFocusedNight(null);
  }, [id]);
  if (!n)
    return (
      <View style={{ flex: 1, backgroundColor: N.bg }}>
        {q.error ? <ErrorNote message={q.error.message} /> : <Loading />}
      </View>
    );
  if (n.phase === "live") return <StillLive n={n} />;
  if (n.phase === "developing") return <Developing n={n} refresh={q.refresh} />;
  return <Unlocked n={n} />;
}

function Header({ n, mode }: { n: Night; mode: "night" | "dawn" }) {
  const scale = scaleFor(false);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <IconButton
        testID="album-back"
        label="Back"
        glyph="‹"
        scale={scale}
        mode={mode}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
      />
      <View style={{ flex: 1 }}>
        <Txt v="small" mode={mode} tone="textDim">
          {(n.crew
            ? `${n.crew.emoji} ${n.crew.name}`
            : n.kind === "city"
              ? "City Night"
              : "Night"
          ).toUpperCase()}
        </Txt>
        <Txt v="heading" mode={mode} numberOfLines={1}>
          {n.title ?? (n.kind === "moment" ? "Nightcap" : "Last night")}
        </Txt>
      </View>
    </View>
  );
}

function StillLive({ n }: { n: Night }) {
  const scale = scaleFor(true);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: N.bg, padding: 20 }}>
      <Header n={n} mode="night" />
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Txt v="title">It&apos;s still going.</Txt>
        <Txt
          v="body"
          tone="textDim"
        >{`${n.total} in the roll so far. It develops at ${n.unlockAtLabel}.`}</Txt>
      </View>
      {n.me.isParticipant && (
        <BigButton
          label="Open the camera"
          icon="◉"
          scale={scale}
          onPress={() => router.replace(`/night/${n.id}`)}
        />
      )}
    </SafeAreaView>
  );
}

function Developing({ n, refresh }: { n: Night; refresh: () => Promise<void> }) {
  const { scale } = useMe();
  const unlock = useCountdown(n.unlockAt);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = n.shots.filter((s) => s.mine);
  const tossed = mine.filter((s) => s.status === "discarded").length;
  const ready = n.participants.filter((p) => p.ready).length;
  const imGood = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("POST", `/nights/${n.id}/ready`);
      haptic.success();
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  let frame = 0;
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: N.bg }}
      testID="album-developing"
    >
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Header n={n} mode="night" />
        <Gap h={26} />
        <Txt v="hero" testID="developing-title">
          Developing…
        </Txt>
        <Gap h={6} />
        <Txt v="heading" tone="accent" scale={scale}>{`Ready at ${n.unlockAtLabel}`}</Txt>
        <Txt
          v="label"
          tone="textDim"
        >{`${unlock.label === "now" ? "Any minute" : `In ${unlock.label}`}, or earlier once everyone's up and taps "I'm good".`}</Txt>
        <Gap h={22} />
        <Card>
          <Txt v="label" tone="textDim">
            THE ROLL
          </Txt>
          <Gap h={8} />
          <Txt v="title">{`${n.total} shot${n.total === 1 ? "" : "s"} from ${n.participants.filter((p) => p.shots > 0).length} of you`}</Txt>
          <Gap h={14} />
          {n.participants.map((p) => (
            <View
              key={p.id}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}
            >
              <Avatar name={p.name} hue={p.hue} size={40} />
              <View style={{ flex: 1 }}>
                <Txt v="label">{p.name}</Txt>
                <View style={{ flexDirection: "row", gap: 4, marginTop: 4 }}>
                  {Array.from({ length: Math.min(p.shots, 9) }, () => (
                    <FilmTile key={frame} frame={++frame} size={18} seed={frame * 7 + p.hue} />
                  ))}
                  {p.shots > 9 && <Txt v="small" tone="textDim">{`+${p.shots - 9}`}</Txt>}
                </View>
              </View>
              <Txt v="small" tone={p.ready ? "accent" : "textFaint"}>
                {p.ready ? "UP ✓" : "asleep"}
              </Txt>
            </View>
          ))}
        </Card>
        <Gap h={18} />
        {mine.length > 0 && (
          <>
            <BigButton
              testID="review-mine"
              label={`Look through my ${mine.length} shot${mine.length === 1 ? "" : "s"}`}
              kind="secondary"
              primary={false}
              scale={scale}
              onPress={() => router.push(`/review/${n.id}`)}
            />
            <Gap h={6} />
            <Txt v="small" tone="textFaint" center>
              {tossed
                ? `You tossed ${tossed}. Toss anything you'd rather nobody saw.`
                : "Toss anything you'd rather nobody saw. Untouched shots are kept."}
            </Txt>
            <Gap h={18} />
          </>
        )}
        {error && (
          <>
            <ErrorNote message={error} />
            <Gap />
          </>
        )}
        {n.me.ready ? (
          <Card>
            <Txt v="heading">{`You're up. ${ready} of ${n.participants.length} ready.`}</Txt>
            <Txt v="label" tone="textDim">
              It develops the moment everyone&apos;s up, or at {n.unlockAtLabel}.
            </Txt>
          </Card>
        ) : n.me.readyCountsFrom ? (
          <Card>
            <Txt v="heading" scale={scale}>
              Get some sleep.
            </Txt>
            <Txt
              v="label"
              tone="textDim"
            >{`"I'm good" counts from ${n.earliestUnlockLabel}. Nothing you approve at 3am counts.`}</Txt>
          </Card>
        ) : (
          <BigButton testID="im-good" label="I'm up. I'm good." scale={scale} busy={busy} onPress={imGood} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DevelopTile({
  shot,
  size,
  index,
  animate,
  onPress,
  authorHue,
  authorName,
}: {
  shot: Shot;
  size: number;
  index: number;
  animate: boolean;
  onPress: () => void;
  authorHue: number;
  authorName: string;
}) {
  const p = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    const delay = 500 + index * 140;
    const t = setTimeout(() => {
      if (index < 8) haptic.tick();
    }, delay);
    Animated.timing(p, {
      toValue: 1,
      duration: 900,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return () => clearTimeout(t);
  }, [animate, index, p]);
  return (
    <Pressable
      testID={`shot-${index}`}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Photo by ${authorName}`}
      onPress={onPress}
      style={{ width: size, height: size * 1.33, borderRadius: 12, overflow: "hidden" }}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: p,
            transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] }) }],
          },
        ]}
      >
        <Image
          source={{ uri: mediaUrl(shot.url)!, cacheKey: `shot-${shot.id}` }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { opacity: p.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.3, 0] }) },
        ]}
      >
        <FilmTile frame={index + 1} size={size} seed={index * 13 + 5} />
      </Animated.View>
      <View style={{ position: "absolute", left: 6, bottom: 6 }}>
        <Avatar name={authorName} hue={authorHue} size={22} ring="rgba(255,255,255,0.9)" />
      </View>
      {shot.hiddenFromOthers && (
        <View
          style={{
            position: "absolute",
            right: 6,
            top: 6,
            backgroundColor: "rgba(12,10,20,0.75)",
            borderRadius: 8,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}
        >
          <Text style={{ color: N.text, fontFamily: fonts.bodySemi, fontSize: 10 }}>HIDDEN</Text>
        </View>
      )}
    </Pressable>
  );
}

function Unlocked({ n }: { n: Night }) {
  const { width } = useWindowDimensions();
  const scale = scaleFor(false);
  const first = !revealed.has(n.id);
  const [animate] = useState(first);
  const sky = useRef(new Animated.Value(first ? 0 : 1)).current;
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    revealed.add(n.id);
    if (first) {
      haptic.success();
      Animated.timing(sky, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [first, n.id, sky]);
  const cols = 3;
  const gap = 6;
  const size = (width - 40 - gap * (cols - 1)) / cols;
  const people = new Map(n.participants.map((p) => [p.id, p]));
  const authors = new Set(n.shots.map((s) => s.authorId)).size;

  const saveAll = async () => {
    setError(null);
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) {
      setError("NightCap needs permission to add photos to your library.");
      return;
    }
    try {
      for (const [i, s] of n.shots.entries()) {
        setSaving(`Saving ${i + 1} of ${n.shots.length}…`);
        const file = await FileSystem.downloadAsync(
          mediaUrl(s.url)!,
          `${FileSystem.cacheDirectory}nightcap-${s.id}.jpg`,
        );
        await MediaLibrary.saveToLibraryAsync(file.uri);
        void FileSystem.deleteAsync(file.uri, { idempotent: true });
      }
      haptic.success();
      setSaving(`Saved ${n.shots.length} to your photos ✓`);
    } catch (e) {
      setSaving(null);
      setError(`Couldn't save everything: ${(e as Error).message}`);
    }
  };
  const share = () =>
    void Share.share({
      message: `Last night's album is ready: ${n.shots.length} photos from ${authors} ${authors === 1 ? "person" : "people"}. Open NightCap to see it. 🌅`,
    });

  return (
    <View style={{ flex: 1, backgroundColor: N.bg }} testID="album-unlocked">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: sky }]}>
        <LinearGradient
          colors={[...dawn.gradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <Header n={n} mode="dawn" />
          <Gap h={18} />
          <Txt v="hero" mode="dawn" testID="album-title">
            {first ? "It developed." : (n.title ?? "Last night")}
          </Txt>
          <Gap h={4} />
          <Txt
            v="label"
            mode="dawn"
            tone="textDim"
          >{`${n.shots.length} photo${n.shots.length === 1 ? "" : "s"} · ${authors} ${authors === 1 ? "person" : "people"} · ${new Date(n.startedAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}${n.venue ? ` · ${n.venue}` : ""}`}</Txt>
          {n.unlockReason === "everyone_ready" && (
            <>
              <Gap h={8} />
              <Pill text="EVERYONE WAS UP EARLY" mode="dawn" tone="quiet" />
            </>
          )}
          <Gap h={16} />
          {n.pendingTagsForMe.length > 0 && (
            <>
              <Card
                mode="dawn"
                testID="album-tags"
                label="Review photos you're tagged in"
                onPress={() => router.push(`/photo/${n.id}/${n.pendingTagsForMe[0]!.shotId}`)}
              >
                <Txt v="heading" mode="dawn">{`You're tagged in ${n.pendingTagsForMe.length}`}</Txt>
                <Txt v="label" mode="dawn" tone="textDim">
                  Your call: keep the tag, untag, or hide the photo.
                </Txt>
              </Card>
              <Gap h={14} />
            </>
          )}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <BigButton
              testID="album-save-all"
              label="Save all"
              icon="↓"
              mode="dawn"
              primary={false}
              scale={scale}
              style={{ flex: 1 }}
              disabled={!n.shots.length}
              onPress={saveAll}
            />
            <BigButton
              testID="album-share"
              label="Tell the group"
              icon="↗"
              mode="dawn"
              kind="secondary"
              primary={false}
              scale={scale}
              style={{ flex: 1 }}
              onPress={share}
            />
          </View>
          {saving && (
            <>
              <Gap h={8} />
              <Txt v="label" mode="dawn" tone="textDim" center testID="album-saving">
                {saving}
              </Txt>
            </>
          )}
          {error && (
            <>
              <Gap h={8} />
              <ErrorNote message={error} mode="dawn" />
            </>
          )}
          <Gap h={18} />
          {n.shots.length === 0 && (
            <Txt v="body" mode="dawn" tone="textDim">
              Nobody took a photo. Sometimes that&apos;s the best kind of night.
            </Txt>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
            {n.shots.map((s, i) => {
              const a = people.get(s.authorId);
              return (
                <DevelopTile
                  key={s.id}
                  shot={s}
                  size={size}
                  index={i}
                  animate={animate}
                  authorHue={a?.hue ?? 0}
                  authorName={a?.name ?? "Someone"}
                  onPress={() => router.push(`/photo/${n.id}/${s.id}`)}
                />
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
