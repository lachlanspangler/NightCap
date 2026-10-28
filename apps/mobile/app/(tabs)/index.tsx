// Home: what's happening now (live night, a developed album, things that need you), then crews.
import { localParts } from "@nightcap/core";
import { Image } from "expo-image";
import { router } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mediaUrl } from "../../src/api";
import { serverNow } from "../../src/clock";
import { FilmTile } from "../../src/components/FilmTile";
import { AvatarStack, BigButton, Card, ErrorNote, Gap, Loading, Pill, Txt } from "../../src/components/ui";
import { night } from "../../src/theme";
import type { AlbumSummary, Crew } from "../../src/types";
import { useApi } from "../../src/useApi";
import { useMe } from "../../src/useMe";

function greeting(name: string, tz: string) {
  const h = localParts(serverNow(), tz).hour;
  const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    localParts(serverNow(), tz).weekday
  ];
  if (h >= 5 && h < 12) return `Morning, ${name}.`;
  if (h >= 12 && h < 17) return `Hey ${name}.`;
  if (h >= 17 && h < 21) return `${day} evening, ${name}.`;
  return `${day} night, ${name}.`;
}

export default function Home() {
  const { me, scale } = useMe();
  const crews = useApi<{ crews: Crew[] }>("/crews", { pollMs: 15_000 });
  if (!me || !crews.data) {
    return (
      <View style={{ flex: 1, backgroundColor: night.bg }}>
        {crews.error ? <ErrorNote message={crews.error.message} /> : <Loading />}
      </View>
    );
  }
  const all = crews.data.crews;
  const live = all.find((c) => c.liveNight?.joined);
  const joinable = all.filter((c) => c.liveNight && !c.liveNight.joined);
  const albums = all.flatMap((c) => c.albums.map((a) => ({ ...a, crew: c })));
  const now = serverNow().getTime();
  const developing = albums.filter((a) => a.phase === "developing");
  const fresh = albums.filter(
    (a) =>
      a.phase === "unlocked" &&
      now - Date.parse(a.unlockAt) < 36 * 3_600_000 &&
      now - Date.parse(a.unlockAt) >= 0,
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: night.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => void crews.refresh()} tintColor={night.amber} />
        }
      >
        <Txt v="small" tone="accent">
          NIGHTCAP
        </Txt>
        <Gap h={4} />
        <Txt v="title" scale={scale} testID="home-greeting">
          {greeting(me.name, me.tz)}
        </Txt>
        <Gap h={20} />

        {live?.liveNight && (
          <>
            <Card
              testID="home-live"
              label={`Open the camera for ${live.name}`}
              onPress={() => router.push(`/night/${live.liveNight!.id}`)}
              style={{ borderColor: night.amber, backgroundColor: "#22180F" }}
            >
              <Pill text="● LIVE NOW" />
              <Gap h={10} />
              <Txt v="heading" scale={scale}>{`Out with ${live.emoji} ${live.name}`}</Txt>
              <Txt
                v="label"
                tone="textDim"
              >{`${live.liveNight.people} in the roll · tap for the camera`}</Txt>
            </Card>
            <Gap h={14} />
          </>
        )}

        {joinable.map((c) => (
          <View key={c.id}>
            <Card
              testID={`home-join-${c.id}`}
              label={`Join ${c.name}'s night`}
              onPress={() => router.push(`/crew/${c.id}`)}
            >
              <Pill text="NIGHT STARTED" tone="plum" />
              <Gap h={10} />
              <Txt v="heading" scale={scale}>{`${c.emoji} ${c.name} are out`}</Txt>
              <Txt v="label" tone="textDim">{`${c.liveNight!.people} in the roll. Tap to join.`}</Txt>
            </Card>
            <Gap h={14} />
          </View>
        ))}

        {fresh.map((a) => (
          <View key={a.id}>
            <AlbumHero album={a} crewName={`${a.crew.emoji} ${a.crew.name}`} />
            <Gap h={14} />
          </View>
        ))}

        {developing.map((a) => (
          <View key={a.id}>
            <Card
              testID={`home-developing-${a.id}`}
              label={`${a.title ?? "Last night"} is developing`}
              onPress={() => router.push(`/album/${a.id}`)}
            >
              <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                <FilmTile frame={7} size={56} seed={a.id.charCodeAt(0)} />
                <View style={{ flex: 1 }}>
                  <Txt v="italic">Developing…</Txt>
                  <Txt v="label" tone="textDim">{`${a.title ?? "Last night"} · ${a.crew.name}`}</Txt>
                </View>
              </View>
            </Card>
            <Gap h={14} />
          </View>
        ))}

        {me.pendingTags > 0 && (
          <>
            <Card
              testID="home-tags"
              label="Review photos you're tagged in"
              onPress={() => router.push("/tags")}
            >
              <Txt
                v="heading"
                scale={scale}
              >{`You're in ${me.pendingTags} photo${me.pendingTags === 1 ? "" : "s"}`}</Txt>
              <Txt v="label" tone="textDim">
                Your call: keep the tag, untag, or hide the photo.
              </Txt>
            </Card>
            <Gap h={14} />
          </>
        )}

        {me.pendingDeferred > 0 && (
          <>
            <Card
              testID="home-deferred"
              label="Things you asked us to ask you in the morning"
              onPress={() => router.push("/deferred")}
            >
              <Txt v="heading" scale={scale}>
                From last night
              </Txt>
              <Txt v="label" tone="textDim">
                You asked us to check with you in the morning.
              </Txt>
            </Card>
            <Gap h={14} />
          </>
        )}

        <Gap h={6} />
        <Txt v="label" tone="textDim">
          YOUR CREWS
        </Txt>
        <Gap h={10} />
        {all.map((c) => (
          <View key={c.id}>
            <Card
              testID={`crew-card-${c.name}`}
              label={`Open ${c.name}`}
              onPress={() => router.push(`/crew/${c.id}`)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Txt v="title">{c.emoji}</Txt>
                <View style={{ flex: 1 }}>
                  <Txt v="heading" scale={scale}>
                    {c.name}
                  </Txt>
                  <Txt v="small" tone="textDim">
                    {c.kind === "long_distance"
                      ? `Long-distance · ${c.moment.label}`
                      : `${c.members.length} friends · ${c.albums.length} album${c.albums.length === 1 ? "" : "s"}`}
                  </Txt>
                </View>
                <AvatarStack people={c.members} size={30} max={4} ring={night.surface} />
              </View>
            </Card>
            <Gap h={12} />
          </View>
        ))}
        <Gap h={6} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <BigButton
            testID="home-new-crew"
            label="New crew"
            icon="＋"
            kind="secondary"
            primary={false}
            scale={scale}
            style={{ flex: 1 }}
            onPress={() => router.push("/crew/new")}
          />
          <BigButton
            testID="home-join-code"
            label="Join a night"
            icon="#"
            kind="secondary"
            primary={false}
            scale={scale}
            style={{ flex: 1 }}
            onPress={() => router.push("/join")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AlbumHero({ album, crewName }: { album: AlbumSummary; crewName: string }) {
  return (
    <Card
      testID={`home-album-${album.id}`}
      label={`Open ${album.title ?? "last night's album"}`}
      mode="dawn"
      onPress={() => router.push(`/album/${album.id}`)}
      style={{ padding: 0, overflow: "hidden", backgroundColor: "#FFE3D3" }}
    >
      {album.coverUrl && (
        <Image
          source={{ uri: mediaUrl(album.coverUrl)!, cacheKey: `cover-${album.id}` }}
          style={{ height: 180 }}
          contentFit="cover"
          transition={300}
        />
      )}
      <View style={{ padding: 16 }}>
        <Pill text="DEVELOPED" mode="dawn" tone="quiet" />
        <Gap h={8} />
        <Txt v="heading" mode="dawn">
          {album.title ?? "Last night"}
        </Txt>
        <Txt v="label" mode="dawn" tone="textDim">{`${crewName} · ${album.people} people · tap to open`}</Txt>
      </View>
    </Card>
  );
}
