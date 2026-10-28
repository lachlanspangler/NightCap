// One photo. Reactions, and consent one tap away: "That's me, hide it", tag answers, report.
// Destructive actions use an undo window (hide) or hold-to-confirm (delete) (DRUNK_UX).
import { REACTIONS, REPORT_LABELS, REPORT_REASONS, type ReportReason } from "@nightcap/core";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, mediaUrl } from "../../../src/api";
import { HoldButton } from "../../../src/components/HoldButton";
import { useUndo } from "../../../src/components/Undo";
import { Avatar, BigButton, ErrorNote, Gap, IconButton, Loading, Txt } from "../../../src/components/ui";
import { haptic } from "../../../src/haptics";
import { fonts, night as N } from "../../../src/theme";
import type { Night } from "../../../src/types";
import { useApi } from "../../../src/useApi";
import { useMe } from "../../../src/useMe";

type Sheet = null | "more" | "tag" | "report";

export default function Photo() {
  const { nightId, shotId } = useLocalSearchParams<{ nightId: string; shotId: string }>();
  const q = useApi<{ night: Night }>(`/nights/${nightId}`);
  const { me, scale } = useMe();
  const withUndo = useUndo();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const n = q.data?.night;
  if (!n)
    return (
      <View style={{ flex: 1, backgroundColor: N.bg }}>
        {q.error ? <ErrorNote message={q.error.message} /> : <Loading />}
      </View>
    );
  const idx = n.shots.findIndex((s) => s.id === shotId);
  const shot = n.shots[idx];
  if (!shot) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: N.bg, padding: 20 }}>
        <Txt v="title">That photo isn&apos;t here anymore.</Txt>
        <Gap />
        <BigButton label="Back" scale={scale} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }
  const author = n.participants.find((p) => p.id === shot.authorId);
  const myTag = n.pendingTagsForMe.find((t) => t.shotId === shot.id);
  const go = (d: number) => {
    const next = n.shots[idx + d];
    if (next) router.setParams({ shotId: next.id });
  };
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    try {
      await fn();
      if (ok) setNote(ok);
      haptic.success();
      await q.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const react = (emoji: string) =>
    run(() =>
      shot.myReaction === emoji
        ? api("DELETE", `/shots/${shot.id}/reaction`)
        : api("PUT", `/shots/${shot.id}/reaction`, { emoji }),
    );
  const hide = () => {
    setSheet(null);
    withUndo(
      "Hidden. Only the person who took it can still see it.",
      async () => {
        await api("POST", `/shots/${shot.id}/hide`);
        router.back();
      },
      me?.nightMode ?? false,
    );
  };
  const report = (reason: ReportReason) =>
    run(async () => {
      setSheet(null);
      const r = await api<{ hidden: boolean }>("POST", `/shots/${shot.id}/report`, { reason });
      if (r.hidden) router.back();
    }, "Thanks. We'll take a look.");
  const save = () =>
    run(async () => {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) throw new Error("NightCap needs permission to add photos to your library.");
      const f = await FileSystem.downloadAsync(
        mediaUrl(shot.url)!,
        `${FileSystem.cacheDirectory}nightcap-${shot.id}.jpg`,
      );
      await MediaLibrary.saveToLibraryAsync(f.uri);
    }, "Saved to your photos ✓");

  return (
    <View style={{ flex: 1, backgroundColor: N.bg }} testID="photo">
      <LinearGradient
        colors={["rgba(255,182,150,0.22)", "rgba(12,10,20,0)"]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: 320 }}
      />
      <Image
        source={{ uri: mediaUrl(shot.url)!, cacheKey: `shot-${shot.id}` }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        transition={120}
      />
      <Pressable
        accessibilityLabel="Previous photo"
        style={{ position: "absolute", left: 0, top: 140, bottom: 260, width: "30%" }}
        onPress={() => go(-1)}
      />
      <Pressable
        accessibilityLabel="Next photo"
        style={{ position: "absolute", right: 0, top: 140, bottom: 260, width: "30%" }}
        onPress={() => go(1)}
      />
      <SafeAreaView style={{ flex: 1, justifyContent: "space-between" }} pointerEvents="box-none">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 }}>
          <IconButton
            testID="photo-close"
            label="Close"
            glyph="✕"
            scale={scale}
            onPress={() => router.back()}
          />
          {author && <Avatar name={author.name} hue={author.hue} size={36} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.bodyBold, color: N.text, fontSize: 16 }}>
              {shot.mine ? "You" : (author?.name ?? "Someone")}
            </Text>
            <Text style={{ fontFamily: fonts.body, color: N.textDim, fontSize: 13 }}>
              {`${new Date(shot.takenAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · ${idx + 1} of ${n.shots.length}`}
            </Text>
          </View>
          <IconButton
            testID="photo-more"
            label="More options"
            glyph="•••"
            scale={scale}
            onPress={() => setSheet(sheet ? null : "more")}
          />
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 10 }}>
          {shot.hiddenFromOthers && (
            <View style={{ backgroundColor: "rgba(12,10,20,0.85)", borderRadius: 18, padding: 14 }}>
              <Txt v="label">Someone in this photo hid it.</Txt>
              <Txt v="small" tone="textDim">
                Only you can see it now. You can delete it, but only they can un-hide it.
              </Txt>
            </View>
          )}
          {myTag && (
            <View
              style={{ backgroundColor: "rgba(12,10,20,0.9)", borderRadius: 22, padding: 16 }}
              testID="tag-prompt"
            >
              <Txt v="heading">{`${n.participants.find((p) => p.id === myTag.taggerId)?.name ?? "Someone"} tagged you`}</Txt>
              <Txt v="small" tone="textDim">
                Your call. Nobody else sees the tag until you keep it.
              </Txt>
              <Gap h={10} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <BigButton
                  testID="tag-keep"
                  label="Keep tag"
                  primary={false}
                  scale={scale}
                  style={{ flex: 1, paddingHorizontal: 6 }}
                  onPress={() => run(() => api("PATCH", `/shots/${shot.id}/tags/me`, { status: "approved" }))}
                />
                <BigButton
                  testID="tag-untag"
                  label="Untag"
                  kind="secondary"
                  primary={false}
                  scale={scale}
                  style={{ flex: 1, paddingHorizontal: 6 }}
                  onPress={() => run(() => api("PATCH", `/shots/${shot.id}/tags/me`, { status: "removed" }))}
                />
                <BigButton
                  testID="tag-hide"
                  label="Hide it"
                  kind="danger"
                  primary={false}
                  scale={scale}
                  style={{ flex: 1, paddingHorizontal: 6 }}
                  onPress={hide}
                />
              </View>
            </View>
          )}
          {note && (
            <Txt v="label" center testID="photo-note">
              {note}
            </Txt>
          )}
          {error && <ErrorNote message={error} />}

          {!shot.mine && !myTag && !sheet && (
            <BigButton
              testID="photo-hide-visible"
              label="That's me, hide it"
              kind="secondary"
              primary={false}
              scale={scale}
              onPress={hide}
            />
          )}
          {sheet === "more" && (
            <View style={{ backgroundColor: "rgba(23,19,31,0.97)", borderRadius: 24, padding: 14, gap: 10 }}>
              {!shot.mine && (
                <BigButton
                  testID="photo-hide"
                  label="That's me, hide it"
                  kind="danger"
                  primary={false}
                  scale={scale}
                  onPress={hide}
                />
              )}
              <BigButton
                testID="photo-tag"
                label="Tag who's in it"
                kind="secondary"
                primary={false}
                scale={scale}
                onPress={() => setSheet("tag")}
              />
              <BigButton
                testID="photo-save"
                label="Save to my photos"
                kind="secondary"
                primary={false}
                scale={scale}
                onPress={save}
              />
              {!shot.mine && (
                <BigButton
                  testID="photo-report"
                  label="Report"
                  kind="secondary"
                  primary={false}
                  scale={scale}
                  onPress={() => setSheet("report")}
                />
              )}
              {shot.mine && (
                <HoldButton
                  testID="photo-delete"
                  label="Delete this photo"
                  hint="Hold to delete for everyone"
                  scale={scale}
                  onConfirm={() =>
                    run(async () => {
                      await api("DELETE", `/shots/${shot.id}`);
                      router.back();
                    })
                  }
                />
              )}
            </View>
          )}
          {sheet === "tag" && (
            <View style={{ backgroundColor: "rgba(23,19,31,0.97)", borderRadius: 24, padding: 14 }}>
              <Txt v="label" tone="textDim">
                WHO&apos;S IN IT? THEY&apos;LL GET TO DECIDE.
              </Txt>
              <Gap h={10} />
              <ScrollView horizontal contentContainerStyle={{ gap: 12 }}>
                {n.participants.map((p) => {
                  const tagged = shot.tags.some((t) => t.userId === p.id);
                  return (
                    <Pressable
                      key={p.id}
                      testID={`tag-${p.name.toLowerCase()}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Tag ${p.name}`}
                      disabled={tagged}
                      onPress={() =>
                        run(
                          () => api("POST", `/shots/${shot.id}/tags`, { userId: p.id }),
                          p.id === me?.id ? "Tagged you." : `Asked ${p.name}.`,
                        )
                      }
                      style={{ alignItems: "center", width: 64, opacity: tagged ? 0.4 : 1, minHeight: 56 }}
                    >
                      <Avatar name={p.name} hue={p.hue} size={48} />
                      <Txt v="small">{p.id === me?.id ? "Me" : p.name}</Txt>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
          {sheet === "report" && (
            <View style={{ backgroundColor: "rgba(23,19,31,0.97)", borderRadius: 24, padding: 14, gap: 8 }}>
              {REPORT_REASONS.map((r) => (
                <BigButton
                  key={r}
                  testID={`report-${r}`}
                  label={REPORT_LABELS[r]}
                  kind="secondary"
                  primary={false}
                  scale={scale}
                  onPress={() => report(r)}
                />
              ))}
            </View>
          )}

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              backgroundColor: "rgba(12,10,20,0.7)",
              borderRadius: 999,
              padding: 6,
            }}
          >
            {REACTIONS.map((e) => (
              <Pressable
                key={e}
                testID={`react-${e}`}
                accessibilityRole="button"
                accessibilityLabel={`React ${e}`}
                accessibilityState={{ selected: shot.myReaction === e }}
                onPress={() => react(e)}
                style={{
                  minWidth: 60,
                  minHeight: 56,
                  borderRadius: 28,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: shot.myReaction === e ? "rgba(255,180,77,0.3)" : "transparent",
                }}
              >
                <Text style={{ fontSize: 26 }}>{e}</Text>
                {(shot.reactions[e] ?? 0) > 0 && (
                  <Text style={{ fontFamily: fonts.bodyBold, color: N.text, fontSize: 11 }}>
                    {shot.reactions[e]}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
