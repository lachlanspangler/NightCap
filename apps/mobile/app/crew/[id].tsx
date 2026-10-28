// A crew: start a night (one big tap), join the live one, the albums, invites, and for
// long-distance crews the weekly Nightcap + reunion countdown + recaps.
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Share, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, mediaUrl } from "../../src/api";
import { serverNow } from "../../src/clock";
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
import { haptic } from "../../src/haptics";
import { night } from "../../src/theme";
import type { Crew, Night } from "../../src/types";
import { useApi } from "../../src/useApi";
import { useMe } from "../../src/useMe";

export default function CrewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, scale } = useMe();
  const q = useApi<{ crew: Crew }>(`/crews/${id}`, { pollMs: 10_000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const crew = q.data?.crew;
  if (!crew) {
    return (
      <View style={{ flex: 1, backgroundColor: night.bg }}>
        {q.error ? <ErrorNote message={q.error.message} /> : <Loading />}
      </View>
    );
  }

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ night: Night }>("POST", `/crews/${crew.id}/nights`, {});
      haptic.success();
      router.push(`/night/${r.night.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("POST", `/nights/${crew.liveNight!.id}/join`);
      haptic.success();
      router.push(`/night/${crew.liveNight!.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const invite = async () => {
    try {
      const r = await api<{ links: { web: string }; expiresAt: string }>("POST", `/crews/${crew.id}/invites`);
      await Share.share({ message: `Join ${crew.emoji} ${crew.name} on NightCap: ${r.links.web}` });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const live = crew.liveNight;
  const reunionDays = crew.reunion
    ? Math.max(0, Math.ceil((Date.parse(crew.reunion.at) - serverNow().getTime()) / 86_400_000))
    : null;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: night.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton testID="crew-back" label="Back" glyph="‹" scale={scale} onPress={() => router.back()} />
          <IconButton
            testID="crew-invite"
            label="Invite friends to the crew"
            glyph="＋"
            scale={scale}
            onPress={invite}
          />
        </View>
        <Gap h={10} />
        <Txt v="hero">{crew.emoji}</Txt>
        <Txt v="title" testID="crew-name">
          {crew.name}
        </Txt>
        <Gap h={4} />
        <Txt v="label" tone="textDim">
          {crew.kind === "long_distance" ? "Long-distance crew" : "Local crew"} · {crew.members.length}{" "}
          friends
        </Txt>
        <Gap h={14} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
          {crew.members.map((m) => (
            <View key={m.id} style={{ alignItems: "center", width: 58 }}>
              <Avatar name={m.name} hue={m.hue} size={50} ring={m.id === me?.id ? night.amber : undefined} />
              <Txt v="small" tone="textDim" numberOfLines={1}>
                {m.name}
              </Txt>
            </View>
          ))}
        </ScrollView>
        <Gap h={22} />

        {error && (
          <>
            <ErrorNote message={error} />
            <Gap />
          </>
        )}

        {live ? (
          <Card style={{ borderColor: night.amber, backgroundColor: "#22180F" }}>
            <Pill text="● LIVE NOW" />
            <Gap h={10} />
            <Txt v="heading" scale={scale}>
              {live.title ?? "Tonight"}
            </Txt>
            <Txt
              v="label"
              tone="textDim"
            >{`${live.people} in the roll. Nothing shows until the morning.`}</Txt>
            <Gap h={14} />
            {live.joined ? (
              <BigButton
                testID="crew-open-camera"
                label="Open the camera"
                icon="◉"
                scale={scale}
                onPress={() => router.push(`/night/${live.id}`)}
              />
            ) : (
              <BigButton
                testID="crew-join-night"
                label="Join the night"
                scale={scale}
                busy={busy}
                onPress={join}
              />
            )}
          </Card>
        ) : (
          <>
            <BigButton
              testID="crew-start-night"
              label="Start a night"
              icon="🌙"
              scale={scale}
              busy={busy}
              onPress={start}
            />
            <Gap h={8} />
            <Txt v="small" tone="textFaint" center>
              {`Everyone in ${crew.name} gets a ping. Photos develop at 10am.`}
            </Txt>
          </>
        )}

        {crew.kind === "long_distance" && (
          <>
            <Gap h={18} />
            <Card
              testID="crew-moment"
              label="Open this week's Nightcap"
              onPress={() => router.push(`/moment/${crew.id}`)}
            >
              <Pill text="WEEKLY NIGHTCAP" tone="plum" />
              <Gap h={8} />
              <Txt v="heading" scale={scale}>
                Big night or a quiet one, show us.
              </Txt>
              <Txt v="label" tone="textDim">
                {crew.moment.label}
              </Txt>
            </Card>
            {crew.reunion && (
              <>
                <Gap h={12} />
                <Card testID="crew-reunion">
                  <Txt v="label" tone="textDim">
                    REUNION
                  </Txt>
                  <Txt v="title">{reunionDays === 0 ? "Today!" : `${reunionDays} days`}</Txt>
                  <Txt v="label" tone="textDim">{`until ${crew.reunion.label}`}</Txt>
                </Card>
              </>
            )}
          </>
        )}
        <Gap h={12} />
        <BigButton
          testID="crew-recaps"
          label="Recaps · on this night"
          kind="secondary"
          primary={false}
          scale={scale}
          onPress={() => router.push(`/recaps/${crew.id}`)}
        />

        <Gap h={24} />
        <Txt v="label" tone="textDim">
          ALBUMS
        </Txt>
        <Gap h={10} />
        {crew.albums.length === 0 && (
          <Txt v="body" tone="textDim">
            No albums yet. Start a night and they&apos;ll live here.
          </Txt>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {crew.albums.map((a) => (
            <Pressable
              key={a.id}
              testID={`album-${a.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Open ${a.title ?? "album"}`}
              onPress={() => router.push(`/album/${a.id}`)}
              style={{ width: "47%" }}
            >
              {a.phase === "unlocked" && a.coverUrl ? (
                <Image
                  source={{ uri: mediaUrl(a.coverUrl)!, cacheKey: `cover-${a.id}` }}
                  style={{ width: "100%", aspectRatio: 0.78, borderRadius: 16 }}
                  contentFit="cover"
                  transition={250}
                />
              ) : (
                <FilmTile
                  frame={a.people}
                  size={160}
                  seed={a.id.charCodeAt(2)}
                  label={`${a.title ?? "Album"} is developing`}
                />
              )}
              <Gap h={6} />
              <Txt v="label" numberOfLines={1}>
                {a.title ?? "A night out"}
              </Txt>
              <Txt v="small" tone="textDim">
                {a.phase === "unlocked"
                  ? new Date(a.startedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Developing…"}
              </Txt>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
