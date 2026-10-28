// You: night mode, what you deferred, who you've blocked, privacy promises, account.
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { HoldButton } from "../../src/components/HoldButton";
import { Avatar, BigButton, Card, ErrorNote, Gap, Loading, Txt } from "../../src/components/ui";
import { useSession } from "../../src/session";
import { fonts, night } from "../../src/theme";
import { useApi } from "../../src/useApi";
import { useMe } from "../../src/useMe";

const PROMISES = [
  [
    "🔒",
    "Friends-only, always",
    "An album is only ever seen by the people who were there. Nothing is public.",
  ],
  [
    "🌅",
    "Nothing posts at night",
    "Everything waits for the morning. You review your shots before anyone sees them.",
  ],
  ["🙈", "Your face, your call", "Anyone in a photo can hide it with one tap. Tags wait for your OK."],
  [
    "📍",
    "No GPS, ever",
    "We strip location data from every photo and never ask where you are. A venue name is only shown to the people in that night.",
  ],
];

export default function You() {
  const { me, scale, refresh } = useMe();
  const session = useSession();
  const blocks = useApi<{ blocks: { userId: string; name: string }[] }>("/blocks");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!me)
    return (
      <View style={{ flex: 1, backgroundColor: night.bg }}>
        <Loading />
      </View>
    );
  const setPref = async (nightModePref: string) => {
    await api("PATCH", "/me", { nightModePref });
    await refresh();
  };
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: night.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar name={me.name} hue={me.hue} size={64} />
          <View>
            <Txt v="title">{me.name}</Txt>
            <Txt
              v="label"
              tone="textDim"
            >{`21+ ✓ · ${me.ageVerified ? "ID verified" : "ID not verified yet"}${me.city ? ` · ${me.city}` : ""}`}</Txt>
          </View>
        </View>
        <Gap h={22} />
        <Card>
          <Txt v="heading">Night mode</Txt>
          <Txt v="label" tone="textDim">
            Bigger buttons, fewer choices, longer undo, and anything permanent waits until morning. On
            automatically 9pm–6am and whenever you&apos;re out.
          </Txt>
          <Gap h={12} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["auto", "always", "never"] as const).map((p) => (
              <Pressable
                key={p}
                testID={`night-mode-${p}`}
                accessibilityRole="button"
                accessibilityLabel={`Night mode ${p}`}
                accessibilityState={{ selected: me.nightModePref === p }}
                onPress={() => void setPref(p)}
                style={{
                  flex: 1,
                  minHeight: scale.target,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: me.nightModePref === p ? "rgba(255,180,77,0.2)" : night.surface2,
                  borderWidth: me.nightModePref === p ? 2 : 0,
                  borderColor: night.amber,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.bodyBold,
                    color: night.text,
                    fontSize: 16,
                    textTransform: "capitalize",
                  }}
                >
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>
          <Gap h={8} />
          <Txt v="small" tone="textFaint">{`Right now: ${me.nightMode ? "on" : "off"}`}</Txt>
        </Card>
        <Gap h={14} />
        {me.pendingDeferred > 0 && (
          <>
            <BigButton
              testID="you-deferred"
              label={`Things to decide (${me.pendingDeferred})`}
              kind="secondary"
              primary={false}
              scale={scale}
              onPress={() => router.push("/deferred")}
            />
            <Gap h={14} />
          </>
        )}
        <Txt v="label" tone="textDim">
          OUR PROMISES
        </Txt>
        <Gap h={8} />
        {PROMISES.map(([icon, title, body]) => (
          <View key={title} style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}>
            <Text style={{ fontSize: 24 }}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Txt v="label">{title}</Txt>
              <Txt v="small" tone="textDim">
                {body}
              </Txt>
            </View>
          </View>
        ))}
        <Gap h={8} />
        <Txt v="label" tone="textDim">
          BLOCKED
        </Txt>
        <Gap h={8} />
        {(blocks.data?.blocks ?? []).length === 0 ? (
          <Txt v="small" tone="textFaint">
            Nobody. Blocking someone hides your photos from each other, keeps them out of nights you&apos;re
            in, and keeps you apart at City Nights. They&apos;re never told.
          </Txt>
        ) : (
          blocks.data!.blocks.map((b) => (
            <View
              key={b.userId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Txt v="label">{b.name}</Txt>
              <BigButton
                label="Unblock"
                kind="secondary"
                primary={false}
                scale={scale}
                onPress={() => void api("DELETE", `/blocks/${b.userId}`)}
              />
            </View>
          ))
        )}
        <Gap h={24} />
        {error && <ErrorNote message={error} />}
        {note && (
          <Txt v="label" tone="accent">
            {note}
          </Txt>
        )}
        <Gap h={8} />
        <BigButton
          testID="you-sign-out"
          label="Sign out"
          kind="secondary"
          primary={false}
          scale={scale}
          onPress={async () => {
            await session.signOut();
            router.replace("/welcome");
          }}
        />
        <Gap h={12} />
        <HoldButton
          testID="you-delete-account"
          label="Delete my account"
          hint="Hold. Deletes photos you took and hides photos you're tagged in."
          scale={scale}
          onConfirm={async () => {
            setError(null);
            try {
              const r = await api<{ deferred?: boolean; askAt?: string }>("DELETE", "/me");
              if (r.deferred) setNote("It's late. We'll ask you again in the morning.");
              else {
                await session.signOut();
                router.replace("/welcome");
              }
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
