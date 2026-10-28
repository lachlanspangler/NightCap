// One tap from any face: Block, Report, and (for hosts/owners) Remove. Safety actions are never
// deferred to the morning, and Block works everywhere a person appears (privacy review C1).
import { USER_REPORT_REASONS, type UserReportReason } from "@nightcap/core";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { haptic } from "../haptics";
import { fonts, night, scaleFor } from "../theme";
import { HoldButton } from "./HoldButton";
import { Avatar, BigButton, ErrorNote, Gap, Txt } from "./ui";

const REASON_LABEL: Record<UserReportReason, string> = {
  harassment: "Harassment or making me unsafe",
  violence: "Violence or threats",
  under_21: "They're under 21",
  other: "Something else",
};

export interface Person {
  id: string;
  name: string;
  hue: number;
  via?: string;
}

export function PersonSheet({
  person,
  onClose,
  nightId,
  crewId,
  eventId,
  canRemoveFromNight,
  canRemoveFromCrew,
  onDone,
}: {
  person: Person | null;
  onClose: () => void;
  nightId?: string;
  crewId?: string;
  eventId?: string;
  canRemoveFromNight?: boolean;
  canRemoveFromCrew?: boolean;
  onDone?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const scale = scaleFor(true);
  const [mode, setMode] = useState<"menu" | "report">("menu");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setMode("menu");
    setNote(null);
    setError(null);
    onClose();
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError(null);
    try {
      await fn();
      haptic.success();
      setNote(ok);
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!person) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable
        accessibilityLabel="Close"
        onPress={close}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
      />
      <View
        testID="person-sheet"
        style={{
          backgroundColor: night.surface,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 20,
          paddingBottom: insets.bottom + 16,
        }}
      >
        <ScrollView>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Avatar name={person.name} hue={person.hue} size={52} />
            <View style={{ flex: 1 }}>
              <Txt v="heading">{person.name}</Txt>
              {person.via === "code" || person.via === "invite" ? (
                <Txt v="small" tone="textDim">
                  Joined with the {person.via === "code" ? "code" : "link"}
                </Txt>
              ) : null}
            </View>
          </View>
          <Gap h={16} />
          {note && (
            <>
              <Txt v="label" tone="accent" testID="person-note">
                {note}
              </Txt>
              <Gap h={10} />
            </>
          )}
          {error && (
            <>
              <ErrorNote message={error} />
              <Gap h={10} />
            </>
          )}
          {mode === "menu" ? (
            <View style={{ gap: 10 }}>
              {canRemoveFromNight && nightId && (
                <HoldButton
                  testID="person-remove-night"
                  label="Remove from tonight"
                  hint="Hold. They lose the roll and the album, can't rejoin, and the code changes."
                  scale={scale}
                  onConfirm={() =>
                    run(
                      () => api("DELETE", `/nights/${nightId}/members/${person.id}`),
                      `${person.name} is out of tonight.`,
                    )
                  }
                />
              )}
              {canRemoveFromCrew && crewId && (
                <HoldButton
                  testID="person-remove-crew"
                  label="Remove from the crew"
                  hint="Hold. Happens now, even at night."
                  scale={scale}
                  onConfirm={() =>
                    run(
                      () => api("DELETE", `/crews/${crewId}/members/${person.id}`),
                      `${person.name} is out of the crew.`,
                    )
                  }
                />
              )}
              <BigButton
                testID="person-block"
                label={`Block ${person.name}`}
                kind="danger"
                primary={false}
                scale={scale}
                onPress={() =>
                  run(
                    () => api("POST", "/blocks", { userId: person.id }),
                    `Blocked. You won't see each other's photos or nights. They aren't told.`,
                  )
                }
              />
              <BigButton
                testID="person-report"
                label="Report"
                kind="secondary"
                primary={false}
                scale={scale}
                onPress={() => setMode("report")}
              />
              <BigButton label="Done" kind="quiet" primary={false} scale={scale} onPress={close} />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Txt v="label" tone="textDim">
                WHAT HAPPENED? IT&apos;S PRIVATE.
              </Txt>
              {USER_REPORT_REASONS.map((r) => (
                <Pressable
                  key={r}
                  testID={`person-report-${r}`}
                  accessibilityRole="button"
                  accessibilityLabel={REASON_LABEL[r]}
                  onPress={() =>
                    run(async () => {
                      await api("POST", "/reports", { userId: person.id, reason: r, nightId, eventId });
                      setMode("menu");
                    }, "Thanks. We'll look into it. Blocking them too keeps them away.")
                  }
                  style={{
                    minHeight: scale.target,
                    borderRadius: 16,
                    justifyContent: "center",
                    paddingHorizontal: 16,
                    backgroundColor: night.surface2,
                  }}
                >
                  <Text style={{ fontFamily: fonts.bodySemi, fontSize: 17, color: night.text }}>
                    {REASON_LABEL[r]}
                  </Text>
                </Pressable>
              ))}
              <BigButton
                label="Back"
                kind="quiet"
                primary={false}
                scale={scale}
                onPress={() => setMode("menu")}
              />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
