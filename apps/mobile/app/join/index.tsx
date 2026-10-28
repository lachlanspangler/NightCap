// Join a night with its 4-digit code. A big keypad, forgiving input, generic errors (no oracle).
import { normalizeCode } from "@nightcap/core";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../src/api";
import { BigButton, ErrorNote, Gap, IconButton, Screen, Txt } from "../../src/components/ui";
import { haptic } from "../../src/haptics";
import { fonts, night } from "../../src/theme";
import type { Night } from "../../src/types";
import { useMe } from "../../src/useMe";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export default function Join() {
  const { scale } = useMe();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (c: string) => {
    const n = normalizeCode(c);
    if (!n) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ night: Night }>("POST", "/nights/join", { code: n });
      haptic.success();
      router.replace(`/night/${r.night.id}`);
    } catch (e) {
      haptic.warn();
      setError((e as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };
  const press = (k: string) => {
    if (busy) return;
    haptic.tick();
    if (k === "⌫") return setCode((c) => c.slice(0, -1));
    if (!k) return;
    const next = (code + k).slice(0, 4);
    setCode(next);
    if (next.length === 4) void submit(next);
  };
  const size = Math.max(76, scale.primary);
  return (
    <Screen testID="join">
      <Gap h={8} />
      <IconButton label="Back" glyph="‹" scale={scale} onPress={() => router.back()} />
      <Gap h={10} />
      <Txt v="title" center>
        Join a night
      </Txt>
      <Txt v="label" tone="textDim" center>
        Ask whoever started it for the 4-digit code.
      </Txt>
      <Gap h={24} />
      <View
        style={{ flexDirection: "row", justifyContent: "center", gap: 12 }}
        accessibilityLabel={`Code so far ${code.split("").join(" ")}`}
      >
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: 64,
              height: 80,
              borderRadius: 18,
              backgroundColor: night.surface2,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: i === code.length ? night.amber : "transparent",
            }}
          >
            <Text style={{ fontFamily: fonts.display, fontSize: 44, color: night.text }}>
              {code[i] ?? ""}
            </Text>
          </View>
        ))}
      </View>
      <Gap h={14} />
      {error && <ErrorNote message={error} />}
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14 }}>
        {KEYS.map((k, i) => (
          <Pressable
            key={i}
            testID={k === "⌫" ? "key-back" : k ? `key-${k}` : undefined}
            accessibilityRole={k ? "button" : undefined}
            accessibilityLabel={k === "⌫" ? "Delete" : k || undefined}
            disabled={!k}
            onPress={() => press(k)}
            style={({ pressed }) => ({
              width: size,
              height: size * 0.82,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: k ? (pressed ? night.line : night.surface2) : "transparent",
            })}
          >
            <Text style={{ fontFamily: fonts.display, fontSize: 34, color: night.text }}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <Gap h={14} />
      <BigButton
        testID="join-scan"
        label="Scan a QR instead"
        kind="secondary"
        primary={false}
        scale={scale}
        onPress={() => router.push("/join/scan")}
      />
      <Gap h={10} />
    </Screen>
  );
}
