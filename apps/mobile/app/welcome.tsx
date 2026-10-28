import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "../src/api";
import { FilmTile } from "../src/components/FilmTile";
import { BigButton, ErrorNote, Gap, Screen, Txt } from "../src/components/ui";
import { MOCK } from "../src/config";
import { useSession } from "../src/session";
import { scaleFor } from "../src/theme";

const DEMO = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Maya" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Theo" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Jules" },
];

export default function Welcome() {
  const session = useSession();
  const scale = scaleFor(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const demo = async (id: string, name: string) => {
    setBusy(name);
    setError(null);
    try {
      const r = await api<{ token: string; userId: string }>("POST", "/dev/login", { userId: id });
      await session.signIn(r.token, r.userId);
      router.replace("/(tabs)");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen testID="welcome">
      <View style={{ flex: 1, justifyContent: "center" }}>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 36 }}>
          {[3, 7, 12].map((f, i) => (
            <View
              key={f}
              style={{ transform: [{ rotate: `${(i - 1) * 6}deg` }, { translateY: i === 1 ? -10 : 0 }] }}
            >
              <FilmTile frame={f} size={92} seed={f * 3} />
            </View>
          ))}
        </View>
        <Txt v="hero">NightCap</Txt>
        <Gap h={8} />
        <Txt v="italic" tone="textDim">
          The album from last night.
        </Txt>
        <Gap h={16} />
        <Txt v="body" tone="textDim">
          Everyone snaps into one shared roll. Nobody sees a thing until the morning, when it develops for
          everyone at once.
        </Txt>
      </View>
      {error && <ErrorNote message={error} />}
      <Gap />
      <BigButton
        testID="get-started"
        label="Get started"
        scale={scale}
        onPress={() => router.push("/signup")}
      />
      {MOCK && (
        <>
          <Gap h={14} />
          <Txt v="small" tone="textFaint" center>
            DEMO · TRY IT AS ONE OF THE NIGHT OWLS
          </Txt>
          <Gap h={8} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            {DEMO.map((d) => (
              <BigButton
                key={d.id}
                testID={`demo-${d.name.toLowerCase()}`}
                label={d.name}
                kind="secondary"
                primary={false}
                scale={scale}
                style={{ flex: 1, paddingHorizontal: 8 }}
                busy={busy === d.name}
                onPress={() => demo(d.id, d.name)}
              />
            ))}
          </View>
        </>
      )}
      <Gap h={8} />
    </Screen>
  );
}
