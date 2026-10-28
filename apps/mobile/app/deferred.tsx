// "Ask me in the morning": things night-you asked to do that morning-you gets to confirm.
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api";
import { BigButton, Card, ErrorNote, Gap, IconButton, Loading, Txt } from "../src/components/ui";
import { night } from "../src/theme";
import { useApi } from "../src/useApi";
import { useMe } from "../src/useMe";

const LABEL: Record<string, string> = {
  leave_crew: "Leave a crew",
  remove_member: "Remove someone from a crew",
  delete_account: "Delete your account",
  delete_crew: "Delete a crew",
};

export default function Deferred() {
  const { scale } = useMe();
  const q = useApi<{ deferred: { id: string; action: string; askAt: string; due: boolean }[] }>(
    "/me/deferred",
  );
  const [error, setError] = useState<string | null>(null);
  const answer = async (id: string, confirm: boolean) => {
    setError(null);
    try {
      await api("POST", `/me/deferred/${id}`, { confirm });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: night.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <IconButton label="Back" glyph="‹" scale={scale} onPress={() => router.back()} />
        <Gap h={12} />
        <Txt v="title">From last night</Txt>
        <Txt v="label" tone="textDim">
          You asked us to check with you in the morning. Still want to?
        </Txt>
        <Gap h={16} />
        {error && <ErrorNote message={error} />}
        {!q.data && <Loading />}
        {q.data?.deferred.length === 0 && (
          <Txt v="body" tone="textDim">
            Nothing waiting.
          </Txt>
        )}
        {q.data?.deferred.map((d) => (
          <View key={d.id} style={{ marginBottom: 12 }}>
            <Card>
              <Txt v="heading">{LABEL[d.action] ?? d.action}</Txt>
              <Txt v="label" tone="textDim">
                {d.due
                  ? "It's morning. Your call."
                  : `We'll ask at ${new Date(d.askAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`}
              </Txt>
              <Gap h={12} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <BigButton
                  testID={`deferred-cancel-${d.id}`}
                  label="Never mind"
                  primary={false}
                  scale={scale}
                  style={{ flex: 1 }}
                  onPress={() => answer(d.id, false)}
                />
                <BigButton
                  testID={`deferred-confirm-${d.id}`}
                  label="Yes, do it"
                  kind="danger"
                  primary={false}
                  scale={scale}
                  style={{ flex: 1 }}
                  disabled={!d.due}
                  onPress={() => answer(d.id, true)}
                />
              </View>
            </Card>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
