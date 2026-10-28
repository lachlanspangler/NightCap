// One night's album.
//  · developing (night palette): the countdown is the hero; at 3am "Get some sleep", in the morning
//    a sticky "I'm up. I'm good." bar. Your own shots can be reviewed (hold until morning).
//  · unlocked, first time (design review M1 #1): the reveal is its own moment. A contact sheet of
//    undeveloped frames and "Hold to develop"; the sky goes ink → dawn and each frame develops in
//    time order, with a haptic tick. Remembered per user, so it happens once.
//  · unlocked (dawn palette): the night in time order with hour dividers, Save all, Tell the group.
import { localParts } from "@nightcap/core";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError, mediaUrl } from "../../src/api";
import { useCountdown } from "../../src/components/Countdown";
import { FilmTile } from "../../src/components/FilmTile";
import { HoldButton } from "../../src/components/HoldButton";
import { WhosHere } from "../../src/components/WhosHere";
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
import { loadRevealed, markRevealed } from "../../src/revealed";
import { useSession } from "../../src/session";
import { dawn, fonts, night as N, scaleFor } from "../../src/theme";
import type { Night, Shot } from "../../src/types";
import { useApi } from "../../src/useApi";
import { useMe } from "../../src/useMe";

export default function Album() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<{ night: Night }>(`/nights/${id}`, { pollMs: 10_000 });
  const n = q.data?.night;
  useEffect(() => {
    setFocusedNight(id);
    return () => setFocusedNight(null);
  }, [id]);
  if (!n) {
    return (
      <View style={{ flex: 1, backgroundColor: N.bg }}>
        {q.error ? <ErrorNote message={q.error.message} /> : <Loading />}
      </View>
    );
  }
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
          {mode === "dawn"
            ? new Date(n.startedAt).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : (n.title ?? (n.kind === "moment" ? "Nightcap" : "Last night"))}
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
          scale={scale}
        >{`${n.total} in the roll so far. It develops at ${n.unlockAtLabel}.`}</Txt>
      </View>
      {n.me.isParticipant && (
        <BigButton
          label="Back to the camera"
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
  const insets = useSafeAreaInsets();
  const unlock = useCountdown(n.unlockAt);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState(false);
  const session = useSession();
  const mine = n.shots.filter((s) => s.mine);
  const tossed = mine.filter((s) => s.status === "discarded").length;
  const ready = n.participants.filter((p) => p.ready).length;
  const asleep = !!n.me.readyCountsFrom && !n.me.ready;
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
  const sticky = n.me.canMarkReady && !n.me.ready;
  return (
    <View style={{ flex: 1, backgroundColor: N.bg }} testID="album-developing">
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: sticky ? 140 : 40 }}>
          <Header n={n} mode="night" />
          <Gap h={22} />
          <Txt v="italic" tone="textDim" testID="developing-title">
            Developing…
          </Txt>
          <Text
            style={{ fontFamily: fonts.display, fontSize: 64, lineHeight: 70, color: N.text }}
            accessibilityLabel={`Develops in ${unlock.label}`}
          >
            {unlock.label === "now" ? "Any minute" : unlock.label}
          </Text>
          <Txt v="heading" tone="accent" scale={scale}>{`Ready at ${n.unlockAtLabel}`}</Txt>
          <Txt v="body" tone="textDim" scale={scale}>
            or earlier, once everyone&apos;s up.
          </Txt>
          <Gap h={20} />
          {asleep && (
            <>
              <Card testID="get-some-sleep" style={{ borderColor: N.plum }}>
                <Txt v="title">Get some sleep.</Txt>
                <Txt
                  v="body"
                  tone="textDim"
                  scale={scale}
                >{`Nothing you approve at 3am counts. Come back after ${n.earliestUnlockLabel}.`}</Txt>
              </Card>
              <Gap h={16} />
            </>
          )}
          {n.me.ready && (
            <>
              <Card testID="you-are-up">
                <Txt
                  v="heading"
                  scale={scale}
                >{`You're up. ${ready} of ${n.participants.length} ready.`}</Txt>
                <Txt
                  v="body"
                  tone="textDim"
                  scale={scale}
                >{`It develops the moment everyone's up, or at ${n.unlockAtLabel}.`}</Txt>
              </Card>
              <Gap h={16} />
            </>
          )}
          <Card>
            <Txt v="label" tone="textDim">{`THE ROLL · ${n.total} SHOT${n.total === 1 ? "" : "S"}`}</Txt>
            <Gap h={10} />
            {n.participants.map((p) => (
              <View
                key={p.id}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}
              >
                <Avatar name={p.name} hue={p.hue} size={36} />
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Txt v="label" scale={scale}>
                    {p.name}
                  </Txt>
                  <View style={{ flexDirection: "row", gap: 3 }}>
                    {Array.from({ length: Math.min(p.shots, 6) }, () => (
                      <FilmTile key={frame} frame={++frame} size={14} seed={frame * 7 + p.hue} />
                    ))}
                  </View>
                  <Txt v="small" tone="textDim">{`${p.shots}`}</Txt>
                </View>
                <Txt v="small" tone={p.ready ? "accent" : "textFaint"}>
                  {p.ready ? "UP ✓" : "not up yet"}
                </Txt>
              </View>
            ))}
          </Card>
          <Gap h={16} />
          <BigButton
            testID="album-whos-here"
            label="Who was out · block or report"
            kind="quiet"
            primary={false}
            scale={scale}
            onPress={() => setWho(true)}
          />
          <WhosHere
            n={n}
            meId={session.userId}
            visible={who}
            onClose={() => setWho(false)}
            onChanged={() => void refresh()}
          />
          <Gap h={8} />
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
              <Txt v="label" tone="textFaint" center>
                {tossed
                  ? `You tossed ${tossed}. Nobody will ever see those.`
                  : "Only you can see your own shots. Toss anything you'd rather nobody saw."}
              </Txt>
            </>
          )}
          {error && (
            <>
              <Gap />
              <ErrorNote message={error} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      {sticky && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: insets.bottom + 12,
            backgroundColor: "rgba(12,10,20,0.94)",
            borderTopWidth: 1,
            borderTopColor: N.line,
          }}
        >
          <BigButton testID="im-good" label="I'm up. I'm good." scale={scale} busy={busy} onPress={imGood} />
        </View>
      )}
    </View>
  );
}

/** Hour dividers for the night's arc: "9 PM", "10 PM", … then "After 2 AM" for the late tail. */
export function hourLabel(iso: string, tz: string) {
  const h = localParts(new Date(iso), tz).hour;
  if (h >= 2 && h < 12) return "After 2 AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? "AM" : "PM"}`;
}

function DevelopTile({
  shot,
  size,
  index,
  start,
  onPress,
  authorHue,
  authorName,
}: {
  shot: Shot;
  size: number;
  index: number;
  start: boolean;
  onPress: () => void;
  authorHue: number;
  authorName: string;
}) {
  const p = useRef(new Animated.Value(start ? 0 : 1)).current;
  const wasStarted = useRef(!start);
  useEffect(() => {
    if (!start || wasStarted.current) return;
    wasStarted.current = true;
    const delay = 900 + index * 260;
    const t = setTimeout(() => haptic.tick(), delay + 300);
    Animated.timing(p, {
      toValue: 1,
      duration: 1100,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return () => clearTimeout(t);
  }, [start, index, p]);
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
            transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1.15, 1] }) }],
          },
        ]}
      >
        <Image
          cachePolicy="memory"
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
          { opacity: p.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.35, 0] }) },
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
  const session = useSession();
  const [stage, setStage] = useState<"checking" | "gate" | "developing" | "done">("checking");
  const [justRevealed, setJustRevealed] = useState(false);
  const sky = useRef(new Animated.Value(0)).current;
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session.userId) return;
    void loadRevealed(session.userId).then((set) => {
      if (set.has(n.id)) {
        sky.setValue(1);
        setStage("done");
      } else setStage(n.shots.length ? "gate" : "done");
    });
  }, [session.userId, n.id, n.shots.length, sky]);
  const develop = () => {
    setJustRevealed(true);
    setStage("developing");
    Animated.timing(sky, {
      toValue: 1,
      duration: 3000,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
    if (session.userId) void markRevealed(session.userId, n.id);
    setTimeout(() => setStage("done"), 900 + n.shots.length * 260 + 1200);
  };
  const cols = 3;
  const gap = 6;
  const size = (width - 40 - gap * (cols - 1)) / cols;
  const people = new Map(n.participants.map((p) => [p.id, p]));
  const authors = new Set(n.shots.map((s) => s.authorId)).size;
  const groups = useMemo(() => {
    const out: { label: string; shots: { shot: Shot; index: number }[] }[] = [];
    n.shots.forEach((shot, index) => {
      const label = hourLabel(shot.takenAt, n.tz);
      const last = out.at(-1);
      if (last?.label === label) last.shots.push({ shot, index });
      else out.push({ label, shots: [{ shot, index }] });
    });
    return out;
  }, [n.shots, n.tz]);

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
      message: `Last night developed: ${n.shots.length} photos from ${authors} ${authors === 1 ? "person" : "people"}. Open NightCap to see it. 🌅`,
    });

  if (stage === "checking") return <View style={{ flex: 1, backgroundColor: N.bg }} />;

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

      {stage === "gate" ? (
        <SafeAreaView style={{ flex: 1, padding: 20 }} testID="reveal-gate">
          <Header n={n} mode="night" />
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Txt v="italic" tone="accent">
              Good morning.
            </Txt>
            <Txt v="hero">Last night is ready.</Txt>
            <Gap h={6} />
            <Txt
              v="body"
              tone="textDim"
              scale={scaleFor(true)}
            >{`${n.shots.length} photos from ${authors} of you. Nobody's seen them yet.`}</Txt>
            <Gap h={24} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {n.shots.slice(0, 12).map((s, i) => (
                <View key={s.id} style={{ transform: [{ rotate: `${((i * 37) % 9) - 4}deg` }] }}>
                  <FilmTile frame={i + 1} size={(width - 40 - 18) / 4} seed={i * 13 + 5} />
                </View>
              ))}
            </View>
          </View>
          <HoldButton
            testID="hold-to-develop"
            label="Hold to develop"
            hint="Keep holding. It's worth it."
            tone="amber"
            big
            ms={1400}
            scale={scaleFor(true)}
            onConfirm={develop}
          />
          <Gap h={8} />
        </SafeAreaView>
      ) : (
        <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            <Header n={n} mode="dawn" />
            <Gap h={18} />
            <Txt v="hero" mode="dawn" testID="album-title">
              {justRevealed ? "It developed." : (n.title ?? "Last night")}
            </Txt>
            <Gap h={4} />
            <Txt
              v="label"
              mode="dawn"
              tone="textDim"
            >{`${n.shots.length} photo${n.shots.length === 1 ? "" : "s"} from ${authors} of you${n.venue ? ` · ${n.venue}` : ""}`}</Txt>
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
                  <Txt v="heading" mode="dawn">{`You're tagged in ${n.pendingTagsForMe.length} ›`}</Txt>
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
            {n.shots.length === 0 && (
              <>
                <Gap h={18} />
                <Txt v="body" mode="dawn" tone="textDim">
                  Nobody took a photo. Sometimes that&apos;s the best kind of night.
                </Txt>
              </>
            )}
            {groups.map((g) => (
              <View key={`${g.label}-${g.shots[0]!.index}`}>
                <Gap h={18} />
                <Txt v="small" mode="dawn" tone="textDim">
                  {g.label.toUpperCase()}
                </Txt>
                <Gap h={8} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
                  {g.shots.map(({ shot, index }) => {
                    const a = people.get(shot.authorId);
                    return (
                      <DevelopTile
                        key={shot.id}
                        shot={shot}
                        size={size}
                        index={index}
                        start={stage === "developing"}
                        authorHue={a?.hue ?? 0}
                        authorName={a?.name ?? "Someone"}
                        onPress={() => router.push(`/photo/${n.id}/${shot.id}`)}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      )}
    </View>
  );
}
