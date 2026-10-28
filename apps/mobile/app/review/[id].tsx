// The morning review ("hold until morning"): your own shots, one at a time, two huge buttons.
// Untouched shots are kept; tossed ones are never revealed and their media is deleted at the unlock.
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, mediaUrl } from "../../src/api";
import { BigButton, ErrorNote, Gap, IconButton, Loading, Txt } from "../../src/components/ui";
import { haptic } from "../../src/haptics";
import { night as N } from "../../src/theme";
import type { Night } from "../../src/types";
import { useApi } from "../../src/useApi";
import { useMe } from "../../src/useMe";

export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<{ night: Night }>(`/nights/${id}`);
  const { scale } = useMe();
  const [i, setI] = useState(0);
  const [history, setHistory] = useState<{ id: string; prev: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const n = q.data?.night;
  if (!n)
    return (
      <View style={{ flex: 1, backgroundColor: N.bg }}>
        {q.error ? <ErrorNote message={q.error.message} /> : <Loading />}
      </View>
    );
  const mine = n.shots.filter((s) => s.mine);
  const shot = mine[i];
  const locked = n.phase === "unlocked";

  const decide = async (status: "kept" | "discarded") => {
    if (!shot) return;
    setError(null);
    status === "discarded" ? haptic.warn() : haptic.tap();
    try {
      await api("PATCH", `/shots/${shot.id}`, { status });
      setHistory((h) => [...h, { id: shot.id, prev: shot.status }]);
      setI((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const undo = async () => {
    const last = history.at(-1);
    if (!last) return;
    try {
      await api("PATCH", `/shots/${last.id}`, { status: last.prev === "discarded" ? "discarded" : "kept" });
      setHistory((h) => h.slice(0, -1));
      setI((x) => Math.max(0, x - 1));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: N.bg }} testID="review">
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 12 }}>
        <IconButton
          testID="review-close"
          label="Done reviewing"
          glyph="✕"
          scale={scale}
          onPress={() => router.back()}
        />
        <View style={{ flex: 1 }}>
          <Txt v="label">Your shots from last night</Txt>
          <Txt v="small" tone="textDim">
            {shot ? `${i + 1} of ${mine.length} · only you can see these` : `All ${mine.length} looked at`}
          </Txt>
        </View>
        {history.length > 0 && (
          <IconButton testID="review-undo" label="Undo last choice" glyph="↶" scale={scale} onPress={undo} />
        )}
      </View>
      <Gap h={12} />
      {shot ? (
        <>
          <View
            style={{
              flex: 1,
              marginHorizontal: 16,
              borderRadius: 24,
              overflow: "hidden",
              backgroundColor: N.surface,
            }}
          >
            <Image
              source={{ uri: mediaUrl(shot.url)!, cacheKey: `shot-${shot.id}` }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
            />
            {shot.status === "discarded" && (
              <View
                style={{
                  position: "absolute",
                  top: 14,
                  left: 14,
                  backgroundColor: "rgba(12,10,20,0.8)",
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Txt v="small">TOSSED EARLIER</Txt>
              </View>
            )}
          </View>
          <Gap h={14} />
          {error && (
            <View style={{ paddingHorizontal: 16 }}>
              <ErrorNote message={error} />
              <Gap h={8} />
            </View>
          )}
          {locked ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Txt v="label" tone="textDim" center>
                It&apos;s developed. Open the photo to delete it instead.
              </Txt>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingBottom: 8 }}>
              <BigButton
                testID="review-toss"
                label="Toss"
                kind="danger"
                scale={scale}
                style={{ flex: 1 }}
                onPress={() => decide("discarded")}
              />
              <BigButton
                testID="review-keep"
                label="Keep"
                scale={scale}
                style={{ flex: 1 }}
                onPress={() => decide("kept")}
              />
            </View>
          )}
        </>
      ) : (
        <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
          <Txt v="title">Done.</Txt>
          <Gap h={6} />
          <Txt v="body" tone="textDim">
            {mine.filter((s) => s.status === "discarded").length
              ? `You tossed ${mine.filter((s) => s.status === "discarded").length}. Nobody will ever see those.`
              : "Keeping all of them. Future you approves."}
          </Txt>
          <Gap h={20} />
          <BigButton
            testID="review-done"
            label="Back to the album"
            scale={scale}
            onPress={() => router.back()}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
