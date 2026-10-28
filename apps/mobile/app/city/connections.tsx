// People you met at City Nights and both said yes to.
import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar, Gap, IconButton, Loading, Txt } from "../../src/components/ui";
import { night } from "../../src/theme";
import { useApi } from "../../src/useApi";
import { useMe } from "../../src/useMe";

export default function Connections() {
  const { scale } = useMe();
  const q = useApi<{ connections: { userId: string; name: string; hue: number; since: string }[] }>(
    "/city/connections",
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: night.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <IconButton label="Back" glyph="‹" scale={scale} onPress={() => router.back()} />
        <Gap h={12} />
        <Txt v="title">Kept in touch</Txt>
        <Txt v="label" tone="textDim">
          Only people who said yes back.
        </Txt>
        <Gap h={16} />
        {!q.data && <Loading />}
        {q.data?.connections.length === 0 && (
          <Txt v="body" tone="textDim">
            Nobody yet. Go to a City Night!
          </Txt>
        )}
        {q.data?.connections.map((c) => (
          <View
            key={c.userId}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}
          >
            <Avatar name={c.name} hue={c.hue} size={44} />
            <Txt v="label">{c.name}</Txt>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
