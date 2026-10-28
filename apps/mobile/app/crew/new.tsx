import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { api } from "../../src/api";
import { BigButton, ErrorNote, Gap, Screen, Txt } from "../../src/components/ui";
import { haptic } from "../../src/haptics";
import { fonts, night, scaleFor } from "../../src/theme";
import type { Crew } from "../../src/types";

const EMOJI = ["🦉", "🌙", "🍸", "🎓", "🪩", "🍕", "🔥", "🌃"];

export default function NewCrew() {
  const scale = scaleFor(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🌙");
  const [kind, setKind] = useState<"local" | "long_distance">("local");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ crew: Crew }>("POST", "/crews", { name, emoji, kind });
      haptic.success();
      router.replace(`/crew/${r.crew.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen testID="new-crew">
      <Gap h={20} />
      <Txt v="title">New crew</Txt>
      <Txt v="label" tone="textDim">
        The people you go out with, or the friends you miss.
      </Txt>
      <Gap h={20} />
      <TextInput
        testID="crew-name-input"
        accessibilityLabel="Crew name"
        value={name}
        onChangeText={setName}
        placeholder="Night Owls"
        placeholderTextColor={night.textFaint}
        maxLength={40}
        style={{
          height: 64,
          borderRadius: 18,
          backgroundColor: night.surface2,
          color: night.text,
          fontFamily: fonts.bodySemi,
          fontSize: 22,
          paddingHorizontal: 18,
        }}
      />
      <Gap h={18} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {EMOJI.map((e) => (
          <Pressable
            key={e}
            accessibilityRole="button"
            accessibilityLabel={`Emoji ${e}`}
            accessibilityState={{ selected: emoji === e }}
            onPress={() => {
              haptic.tick();
              setEmoji(e);
            }}
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: emoji === e ? "rgba(255,180,77,0.22)" : night.surface2,
              borderWidth: emoji === e ? 2 : 0,
              borderColor: night.amber,
            }}
          >
            <Text style={{ fontSize: 30 }}>{e}</Text>
          </Pressable>
        ))}
      </View>
      <Gap h={18} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {(
          [
            ["local", "Same city", "Nights out together"],
            ["long_distance", "Long-distance", "Weekly Nightcap, recaps"],
          ] as const
        ).map(([k, title, sub]) => (
          <Pressable
            key={k}
            testID={`crew-kind-${k}`}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityState={{ selected: kind === k }}
            onPress={() => setKind(k)}
            style={{
              flex: 1,
              minHeight: 84,
              padding: 14,
              borderRadius: 20,
              backgroundColor: kind === k ? "rgba(255,180,77,0.16)" : night.surface2,
              borderWidth: kind === k ? 2 : 0,
              borderColor: night.amber,
            }}
          >
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 17, color: night.text }}>{title}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 14, color: night.textDim }}>{sub}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      {error && <ErrorNote message={error} />}
      <Gap />
      <BigButton
        testID="crew-create"
        label="Create crew"
        scale={scale}
        disabled={!name.trim()}
        busy={busy}
        onPress={create}
      />
      <Gap h={8} />
      <BigButton label="Cancel" kind="quiet" primary={false} scale={scale} onPress={() => router.back()} />
    </Screen>
  );
}
