// Recaps: "On this night" (years ago) and month in review. Only nights you were in.
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { mediaUrl } from "../../src/api";
import { Card, ErrorNote, Gap, IconButton, Loading, Screen, Txt } from "../../src/components/ui";
import { night } from "../../src/theme";
import type { Recaps } from "../../src/types";
import { useApi } from "../../src/useApi";
import { useMe } from "../../src/useMe";

function Month({ m, title }: { m: Recaps["thisMonth"]; title: string }) {
  return (
    <Card mode="dawn" style={{ padding: 0, overflow: "hidden" }}>
      {m.topShotUrl && (
        <Image source={{ uri: mediaUrl(m.topShotUrl)! }} style={{ height: 160 }} contentFit="cover" />
      )}
      <View style={{ padding: 16 }}>
        <Txt v="small" mode="dawn" tone="textDim">
          {title}
        </Txt>
        <Txt v="heading" mode="dawn">
          {m.label}
        </Txt>
        <Txt
          v="label"
          mode="dawn"
          tone="textDim"
        >{`${m.people} people in the photos${m.cities.length ? ` · ${m.cities.join(", ")}` : ""}`}</Txt>
      </View>
    </Card>
  );
}

export default function RecapsScreen() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const q = useApi<Recaps>(`/crews/${crewId}/recaps`);
  const { scale } = useMe();
  return (
    <Screen mode="dawn" padded={false} testID="recaps">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <IconButton label="Back" glyph="‹" scale={scale} mode="dawn" onPress={() => router.back()} />
        <Gap h={12} />
        <Txt v="title" mode="dawn">
          Recaps
        </Txt>
        <Gap h={14} />
        {q.error && <ErrorNote message={q.error.message} mode="dawn" />}
        {!q.data && !q.error && <Loading mode="dawn" />}
        {q.data && (
          <>
            {q.data.onThisNight.map((o) => (
              <View key={o.nightId} style={{ marginBottom: 14 }}>
                <Card
                  mode="dawn"
                  testID="on-this-night"
                  label={`Open ${o.title ?? "that night"}`}
                  onPress={() => router.push(`/album/${o.nightId}`)}
                  style={{ padding: 0, overflow: "hidden" }}
                >
                  {o.coverUrl && (
                    <Image
                      source={{ uri: mediaUrl(o.coverUrl)! }}
                      style={{ height: 200 }}
                      contentFit="cover"
                    />
                  )}
                  <View style={{ padding: 16 }}>
                    <Txt
                      v="small"
                      mode="dawn"
                      tone="textDim"
                    >{`${o.yearsAgo} YEAR${o.yearsAgo === 1 ? "" : "S"} AGO TONIGHT`}</Txt>
                    <Txt v="heading" mode="dawn">
                      {o.title ?? "A night out"}
                    </Txt>
                  </View>
                </Card>
              </View>
            ))}
            {q.data.onThisNight.length === 0 && (
              <Txt v="label" mode="dawn" tone="textDim">
                Nothing from this night in past years (yet).
              </Txt>
            )}
            <Gap h={10} />
            {q.data.thisMonth.nights > 0 && <Month m={q.data.thisMonth} title="THIS MONTH" />}
            <Gap h={14} />
            {q.data.lastMonth.nights > 0 && <Month m={q.data.lastMonth} title="LAST MONTH" />}
          </>
        )}
        <View style={{ height: 1, backgroundColor: night.line, opacity: 0 }} />
      </ScrollView>
    </Screen>
  );
}
