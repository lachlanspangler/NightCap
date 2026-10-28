// Every photo someone tagged you in, waiting for your call.
import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BigButton, Card, Gap, IconButton, Loading, Txt } from "../src/components/ui";
import { night } from "../src/theme";
import { useApi } from "../src/useApi";
import { useMe } from "../src/useMe";

export default function Tags() {
  const { scale } = useMe();
  const q = useApi<{ tags: { shotId: string; taggerName: string | null; nightId: string }[] }>("/me/tags");
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: night.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <IconButton label="Back" glyph="‹" scale={scale} onPress={() => router.back()} />
        <Gap h={12} />
        <Txt v="title">You&apos;re in these</Txt>
        <Txt v="label" tone="textDim">
          Keep the tag, untag, or hide the photo. Nobody sees a tag until you keep it.
        </Txt>
        <Gap h={16} />
        {!q.data && <Loading />}
        {q.data?.tags.length === 0 && (
          <Txt v="body" tone="textDim">
            All sorted.
          </Txt>
        )}
        {q.data?.tags.map((t) => (
          <View key={t.shotId} style={{ marginBottom: 12 }}>
            <Card
              testID={`tag-row-${t.shotId}`}
              label="Open photo"
              onPress={() => router.push(`/photo/${t.nightId}/${t.shotId}`)}
            >
              <Txt v="heading">{`${t.taggerName ?? "Someone"} tagged you`}</Txt>
              <Txt v="label" tone="textDim">
                Tap to see it and decide.
              </Txt>
            </Card>
          </View>
        ))}
        <Gap />
        <BigButton
          label="Done"
          kind="secondary"
          primary={false}
          scale={scale}
          onPress={() => router.back()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
