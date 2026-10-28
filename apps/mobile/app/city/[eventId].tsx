// One City Night: sign up, the table reveal 2h before, the shared roll, safety tools, keep in touch.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Share, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { serverNow } from "../../src/clock";
import { useCountdown } from "../../src/components/Countdown";
import {
  Avatar,
  BigButton,
  Card,
  ErrorNote,
  Gap,
  IconButton,
  Loading,
  Pill,
  Txt,
} from "../../src/components/ui";
import { haptic } from "../../src/haptics";
import { night } from "../../src/theme";
import type { CityEvent } from "../../src/types";
import { useApi } from "../../src/useApi";
import { useMe } from "../../src/useMe";

export default function EventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const q = useApi<{ event: CityEvent }>(`/city/events/${eventId}`, { pollMs: 15_000 });
  const { scale } = useMe();
  const [error, setError] = useState<string | null>(null);
  const reveal = useCountdown(q.data?.event.revealAt);
  const e = q.data?.event;
  if (!e)
    return (
      <View style={{ flex: 1, backgroundColor: night.bg }}>
        {q.error ? <ErrorNote message={q.error.message} /> : <Loading />}
      </View>
    );
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      haptic.success();
      await q.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const when = new Date(e.startsAt).toLocaleString(undefined, {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  const sharePlan = () =>
    void Share.share({
      message: `Heads up: I'm at a NightCap City Night: ${e.title} at ${e.venue}${e.area ? ` (${e.area})` : ""}, ${when}. I'll text you after.`,
    });
  const ended = Date.parse(e.startsAt) + 3 * 3_600_000 < serverNow().getTime();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: night.bg }} testID="city-event">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <IconButton label="Back" glyph="‹" scale={scale} onPress={() => router.back()} />
        <Gap h={12} />
        <Pill text={e.theme.toUpperCase()} tone="plum" />
        <Gap h={8} />
        <Txt v="title">{e.title}</Txt>
        <Txt v="label" tone="textDim">{`${e.venue}${e.area ? ` · ${e.area}` : ""} · ${when}`}</Txt>
        <Txt
          v="small"
          tone="textFaint"
        >{`Public venue · tables of ${e.tableMin}–${e.tableMax} · ${e.count} signed up`}</Txt>
        <Gap h={18} />
        {error && (
          <>
            <ErrorNote message={error} />
            <Gap />
          </>
        )}
        {!e.signedUp ? (
          <>
            <BigButton
              testID="city-signup"
              label="Save me a seat"
              scale={scale}
              onPress={() => run(() => api("POST", `/city/events/${e.id}/signup`, {}))}
            />
            <Gap h={8} />
            <Txt v="small" tone="textFaint" center>
              You&apos;ll see your tablemates&apos; first names 2 hours before. They&apos;ll see yours.
            </Txt>
          </>
        ) : e.table ? (
          <Card testID="city-table">
            <Txt v="label" tone="textDim">{`${e.table.label.toUpperCase()} · YOUR PEOPLE TONIGHT`}</Txt>
            <Gap h={10} />
            {e.table.people.map((p) => (
              <View
                key={p.id}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}
              >
                <Avatar name={p.name} hue={p.hue} size={44} ring={p.me ? night.amber : undefined} />
                <View style={{ flex: 1 }}>
                  <Txt v="label">{p.me ? `${p.name} (you)` : p.name}</Txt>
                  {p.funLine && (
                    <Txt v="small" tone="textDim">
                      {p.funLine}
                    </Txt>
                  )}
                </View>
                {!p.me && ended && (
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <BigButton
                      testID={`kit-yes-${p.name.toLowerCase()}`}
                      label={p.keepInTouch === true ? "✓" : "Yes"}
                      primary={false}
                      scale={scale}
                      onPress={() =>
                        run(() =>
                          api("POST", `/city/events/${e.id}/keep-in-touch`, { userId: p.id, yes: true }),
                        )
                      }
                    />
                    <BigButton
                      label={p.keepInTouch === false ? "✓" : "No"}
                      kind="secondary"
                      primary={false}
                      scale={scale}
                      onPress={() =>
                        run(() =>
                          api("POST", `/city/events/${e.id}/keep-in-touch`, { userId: p.id, yes: false }),
                        )
                      }
                    />
                  </View>
                )}
                {!p.me && !ended && (
                  <BigButton
                    label="Block"
                    kind="quiet"
                    primary={false}
                    scale={scale}
                    onPress={() => run(() => api("POST", "/blocks", { userId: p.id }))}
                  />
                )}
              </View>
            ))}
            {ended && (
              <Txt v="small" tone="textFaint">
                Keep in touch? Only a mutual yes opens contact. A no is never shown.
              </Txt>
            )}
            <Gap h={8} />
            {e.table.nightId && (
              <BigButton
                testID="city-roll"
                label={ended ? "Tonight's album" : "Tonight's roll"}
                icon="◉"
                scale={scale}
                onPress={() =>
                  router.push(ended ? `/album/${e.table!.nightId}` : `/night/${e.table!.nightId}`)
                }
              />
            )}
          </Card>
        ) : e.waitlisted ? (
          <Card>
            <Txt v="heading">Waitlisted this time</Txt>
            <Txt v="label" tone="textDim">
              Not enough seats to make a full table. You&apos;re first in line next time.
            </Txt>
          </Card>
        ) : (
          <Card testID="city-waiting">
            <Txt v="heading">You&apos;re in.</Txt>
            <Txt v="label" tone="textDim">{`Your table is revealed in ${reveal.label}.`}</Txt>
            <Gap h={12} />
            <BigButton
              label="Can't make it"
              kind="secondary"
              primary={false}
              scale={scale}
              onPress={() => run(() => api("DELETE", `/city/events/${e.id}/signup`))}
            />
          </Card>
        )}
        <Gap h={18} />
        <Txt v="label" tone="textDim">
          SAFETY
        </Txt>
        <Gap h={8} />
        <BigButton
          testID="city-share-plan"
          label="Share my plan with a friend"
          kind="secondary"
          primary={false}
          scale={scale}
          onPress={sharePlan}
        />
        <Gap h={8} />
        {e.table && (
          <BigButton
            label="Leave this table"
            kind="danger"
            primary={false}
            scale={scale}
            onPress={() => run(() => api("POST", `/city/tables/${e.table!.id}/leave`))}
          />
        )}
        <Gap h={8} />
        <Txt v="small" tone="textFaint">
          No DMs before or during. Photos from tonight stay with tonight&apos;s table, and still develop in
          the morning.
        </Txt>
      </ScrollView>
    </SafeAreaView>
  );
}
