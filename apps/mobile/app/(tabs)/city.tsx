// City Nights: opt-in, verified, public venues, small tables, mutual keep-in-touch (MEET_PEOPLE.md).
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { BigButton, Card, ErrorNote, Gap, Loading, Pill, Txt } from "../../src/components/ui";
import { fonts, night } from "../../src/theme";
import type { CityEvent } from "../../src/types";
import { useApi } from "../../src/useApi";
import { useMe } from "../../src/useMe";

interface CityResp {
  gate: { ok: true } | { ok: false; missing: string };
  city: string | null;
  cities: { id: string; name: string }[];
  codeOfConduct: string[];
  events: CityEvent[];
}

const THEME: Record<string, string> = { trivia: "🧠", karaoke: "🎤", crawl: "🍻", music: "🎸", mingle: "🥂" };

export default function City() {
  const { scale, refresh: refreshMe } = useMe();
  const q = useApi<CityResp>("/city", { pollMs: 30_000 });
  const [city, setCity] = useState("minneapolis");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!q.data)
    return (
      <View style={{ flex: 1, backgroundColor: night.bg }}>
        {q.error ? <ErrorNote message={q.error.message} /> : <Loading />}
      </View>
    );
  const d = q.data;
  const missing = d.gate.ok ? null : d.gate.missing;
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await Promise.all([q.refresh(), refreshMe()]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: night.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
        <Txt v="small" tone="accent">
          CITY NIGHTS
        </Txt>
        <Txt v="title">Meet people, the safe way.</Txt>
        <Gap h={6} />
        <Txt v="label" tone="textDim">
          Small tables at public bars, on a set night. First names only. No DMs. You only stay in touch if you
          both say yes.
        </Txt>
        <Gap h={18} />
        {error && (
          <>
            <ErrorNote message={error} />
            <Gap />
          </>
        )}
        {missing === "not_opted_in" || missing === "no_code_of_conduct" ? (
          <Card testID="city-optin">
            <Txt v="heading">Pick your city</Txt>
            <Gap h={10} />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {d.cities.map((c) => (
                <Pressable
                  key={c.id}
                  testID={`city-${c.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}
                  accessibilityState={{ selected: city === c.id }}
                  onPress={() => setCity(c.id)}
                  style={{
                    minHeight: scale.target,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    justifyContent: "center",
                    backgroundColor: city === c.id ? "rgba(255,180,77,0.2)" : night.surface2,
                    borderWidth: city === c.id ? 2 : 0,
                    borderColor: night.amber,
                  }}
                >
                  <Text style={{ fontFamily: fonts.bodyBold, color: night.text, fontSize: 16 }}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Gap h={16} />
            <Txt v="heading">The deal</Txt>
            <Gap h={6} />
            {d.codeOfConduct.map((line) => (
              <Txt key={line} v="label" tone="textDim" style={{ marginBottom: 6 }}>
                {`· ${line}`}
              </Txt>
            ))}
            <Gap h={8} />
            <Pressable
              testID="city-agree"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agree }}
              accessibilityLabel="I'm in"
              onPress={() => setAgree((a) => !a)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: scale.target }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: night.amber,
                  backgroundColor: agree ? night.amber : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {agree && <Text style={{ color: night.amberInk, fontFamily: fonts.bodyBlack }}>✓</Text>}
              </View>
              <Txt v="label">I&apos;m in.</Txt>
            </Pressable>
            <Gap h={10} />
            <BigButton
              testID="city-join"
              label="Turn on City Nights"
              scale={scale}
              disabled={!agree}
              onPress={() => run(() => api("POST", "/city/join", { city, acceptCodeOfConduct: true }))}
            />
          </Card>
        ) : missing === "not_verified" ? (
          <Card testID="city-verify">
            <Txt v="heading">One more thing: verify you&apos;re 21+</Txt>
            <Txt v="label" tone="textDim">
              Everyone at a City Night is ID-verified. (Prototype: this is a stub. A real ID check comes
              later.)
            </Txt>
            <Gap h={12} />
            <BigButton
              testID="city-verify-btn"
              label="Verify (demo stub)"
              scale={scale}
              onPress={() => run(() => api("POST", "/me/verify-age"))}
            />
          </Card>
        ) : missing ? (
          <ErrorNote message="City Nights are 21+ only." />
        ) : (
          <>
            <Txt v="label" tone="textDim">{`THIS WEEK IN ${(d.city ?? "").toUpperCase()}`}</Txt>
            <Gap h={10} />
            {d.events.length === 0 && (
              <Txt v="body" tone="textDim">
                No City Nights scheduled yet. Check back soon.
              </Txt>
            )}
            {d.events.map((e) => (
              <View key={e.id} style={{ marginBottom: 12 }}>
                <Card
                  testID={`event-${e.theme}`}
                  label={`Open ${e.title}`}
                  onPress={() => router.push(`/city/${e.id}`)}
                  style={e.signedUp ? { borderColor: night.amber } : undefined}
                >
                  <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                    <Text style={{ fontSize: 34 }}>{THEME[e.theme] ?? "🥂"}</Text>
                    <View style={{ flex: 1 }}>
                      <Txt v="heading">{e.title}</Txt>
                      <Txt v="label" tone="textDim">{`${e.venue}${e.area ? ` · ${e.area}` : ""}`}</Txt>
                      <Txt
                        v="small"
                        tone="textDim"
                      >{`${new Date(e.startsAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })} · tables of ${e.tableMin}–${e.tableMax} · ${e.count} going`}</Txt>
                    </View>
                    {e.signedUp && <Pill text={e.table ? "SEATED" : "IN"} />}
                  </View>
                </Card>
              </View>
            ))}
            <Gap h={10} />
            <BigButton
              testID="city-connections"
              label="People you kept in touch with"
              kind="secondary"
              primary={false}
              scale={scale}
              onPress={() => router.push("/city/connections")}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
