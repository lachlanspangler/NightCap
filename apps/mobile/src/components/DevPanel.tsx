// Mock-mode dev panel: act as any demo friend, time travel, make friends snap, reseed.
// Only rendered when EXPO_PUBLIC_MOCK=1 (the API only mounts /dev in mock mode too).
import { formatLocalTime } from "@nightcap/core";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, invalidateAll } from "../api";
import { serverNow, syncServerClock } from "../clock";
import { MOCK } from "../config";
import { devChrome, getFocusedNight, onFocusChange } from "../focus";
import { haptic } from "../haptics";
import { useSession } from "../session";
import { fonts, night, scaleFor } from "../theme";
import { useApi } from "../useApi";
import { Avatar, BigButton, Gap, Txt } from "./ui";

interface DemoUser {
  id: string;
  name: string;
  hue: number;
  city: string;
}

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const session = useSession();
  const users = useApi<{ users: DemoUser[] }>(MOCK ? "/dev/users" : null);
  useEffect(() => onFocusChange(() => force((n) => n + 1)), []);
  if (!MOCK || !devChrome()) return null;
  const scale = scaleFor(false);
  const nightId = getFocusedNight();

  const act = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    setNote(null);
    try {
      const msg = await fn();
      haptic.success();
      setNote(msg ?? `${label}: done`);
      invalidateAll();
    } catch (e) {
      setNote(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  };
  const jump = (j: string) =>
    act(j, async () => {
      const r = await api<{ now: string }>("POST", "/dev/clock", { jump: j });
      syncServerClock(r.now);
      return `Now ${formatLocalTime(new Date(r.now), "America/Chicago")}`;
    });

  return (
    <>
      <Pressable
        testID="dev-pill"
        accessibilityRole="button"
        accessibilityLabel="Open dev panel"
        onPress={() => setOpen(true)}
        style={{
          position: "absolute",
          right: 12,
          top: insets.top + 6,
          backgroundColor: "rgba(155,123,224,0.92)",
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 7,
        }}
      >
        <Text
          style={{ fontFamily: fonts.bodyBlack, fontSize: 12, color: "#140B22", letterSpacing: 1 }}
        >{`DEV · ${formatLocalTime(serverNow(), "America/Chicago")}`}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View
            style={{
              backgroundColor: night.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: "86%",
              paddingBottom: insets.bottom + 12,
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Txt v="title">Dev panel</Txt>
                <Pressable
                  testID="dev-close"
                  accessibilityRole="button"
                  accessibilityLabel="Close dev panel"
                  onPress={() => setOpen(false)}
                  style={{ minHeight: 48, minWidth: 64, alignItems: "flex-end", justifyContent: "center" }}
                >
                  <Text style={{ fontFamily: fonts.bodyBold, color: night.amber, fontSize: 17 }}>Done</Text>
                </Pressable>
              </View>
              <Txt v="small" tone="textDim">
                Mock mode · demo data only · server time drives every countdown
              </Txt>
              <Gap h={18} />
              <Txt v="label" tone="textDim">
                ACT AS
              </Txt>
              <Gap h={8} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {(users.data?.users ?? []).map((u) => (
                  <Pressable
                    key={u.id}
                    testID={`dev-as-${u.name.toLowerCase()}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Act as ${u.name}`}
                    onPress={() =>
                      act(`As ${u.name}`, async () => {
                        const r = await api<{ token: string; userId: string }>("POST", "/dev/login", {
                          userId: u.id,
                        });
                        await session.signIn(r.token, r.userId);
                        return `You're ${u.name} now`;
                      })
                    }
                    style={{ alignItems: "center", width: 64, opacity: session.userId === u.id ? 1 : 0.7 }}
                  >
                    <Avatar
                      name={u.name}
                      hue={u.hue}
                      size={48}
                      ring={session.userId === u.id ? night.amber : undefined}
                    />
                    <Text
                      style={{ fontFamily: fonts.bodySemi, color: night.text, fontSize: 13, marginTop: 4 }}
                    >
                      {u.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Gap h={20} />
              <Txt v="label" tone="textDim">
                TIME TRAVEL
              </Txt>
              <Gap h={8} />
              <View style={{ gap: 10 }}>
                <BigButton
                  testID="dev-jump-morning"
                  label="Skip to 7:05 AM (sober check)"
                  primary={false}
                  kind="secondary"
                  scale={scale}
                  busy={busy === "morning"}
                  onPress={() => jump("morning")}
                />
                <BigButton
                  testID="dev-jump-unlock"
                  label="Skip to 10:00 AM (unlock)"
                  primary={false}
                  kind="secondary"
                  scale={scale}
                  busy={busy === "unlock"}
                  onPress={() => jump("unlock")}
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <BigButton
                    testID="dev-jump-hour"
                    label="+1 hour"
                    primary={false}
                    kind="secondary"
                    scale={scale}
                    style={{ flex: 1 }}
                    onPress={() => jump("hour")}
                  />
                  <BigButton
                    testID="dev-jump-reset"
                    label="Real time"
                    primary={false}
                    kind="secondary"
                    scale={scale}
                    style={{ flex: 1 }}
                    onPress={() => jump("reset")}
                  />
                </View>
              </View>
              <Gap h={20} />
              <Txt v="label" tone="textDim">
                {nightId ? "FRIENDS IN THIS NIGHT" : "OPEN A NIGHT TO SIMULATE FRIENDS"}
              </Txt>
              <Gap h={8} />
              <View style={{ gap: 10 }}>
                <BigButton
                  testID="dev-friends-snap"
                  label="Friends join + snap 3 each"
                  primary={false}
                  kind="secondary"
                  scale={scale}
                  disabled={!nightId}
                  busy={busy === "snap"}
                  onPress={() =>
                    act(
                      "snap",
                      async () =>
                        (
                          await api<{ actions: string[] }>("POST", `/dev/nights/${nightId}/simulate`, {
                            shots: 3,
                          })
                        ).actions.length + " friend actions",
                    )
                  }
                />
                <BigButton
                  testID="dev-friends-ready"
                  label={`Everyone else taps "I'm good"`}
                  primary={false}
                  kind="secondary"
                  scale={scale}
                  disabled={!nightId}
                  busy={busy === "ready"}
                  onPress={() =>
                    act(
                      "ready",
                      async () =>
                        (
                          await api<{ actions: string[] }>("POST", `/dev/nights/${nightId}/simulate`, {
                            shots: 0,
                            ready: true,
                          })
                        ).actions.join(", ") || "nobody to wake up",
                    )
                  }
                />
              </View>
              <Gap h={20} />
              <BigButton
                testID="dev-reseed"
                label="Reseed demo world"
                primary={false}
                kind="danger"
                scale={scale}
                busy={busy === "reseed"}
                onPress={() =>
                  act(
                    "reseed",
                    async () =>
                      `Reseeded: ${(await api<{ shots: number }>("POST", "/dev/reseed")).shots} photos`,
                  )
                }
              />
              {note && (
                <>
                  <Gap h={12} />
                  <Txt v="label" tone="textDim" testID="dev-note">
                    {note}
                  </Txt>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
