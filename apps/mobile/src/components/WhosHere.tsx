// "Who's here": everyone in tonight's roll, each one tap from Block / Report / Remove.
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, night } from "../theme";
import type { Night } from "../types";
import { PersonSheet, type Person } from "./PersonSheet";
import { Avatar, Gap, Txt } from "./ui";

export function WhosHere({
  n,
  meId,
  visible,
  onClose,
  onChanged,
}: {
  n: Night;
  meId: string | null;
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [person, setPerson] = useState<Person | null>(null);
  return (
    <>
      <Modal visible={visible && !person} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
        />
        <View
          testID="whos-here"
          style={{
            backgroundColor: night.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 20,
            paddingBottom: insets.bottom + 16,
            maxHeight: "70%",
          }}
        >
          <Txt v="heading">{`Who's here · ${n.participants.length}`}</Txt>
          <Txt v="small" tone="textDim">
            Tap anyone to block or report them{n.me.isHost ? ", or remove them from tonight" : ""}.
          </Txt>
          <Gap h={12} />
          <ScrollView>
            {n.participants.map((p) => (
              <Pressable
                key={p.id}
                testID={`who-${p.name.toLowerCase()}`}
                accessibilityRole="button"
                accessibilityLabel={p.id === meId ? `${p.name} (you)` : `${p.name}, options`}
                disabled={p.id === meId}
                onPress={() => setPerson({ id: p.id, name: p.name, hue: p.hue, via: p.via })}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60 }}
              >
                <Avatar name={p.name} hue={p.hue} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.bodyBold, color: night.text, fontSize: 17 }}>
                    {p.id === meId ? `${p.name} (you)` : p.name}
                  </Text>
                  <Text style={{ fontFamily: fonts.body, color: night.textDim, fontSize: 14 }}>
                    {p.via === "starter"
                      ? "started the night"
                      : p.via === "code"
                        ? "joined with the code"
                        : p.via === "invite"
                          ? "joined with a link"
                          : "from the crew"}
                  </Text>
                </View>
                {p.id !== meId && <Text style={{ color: night.textDim, fontSize: 22 }}>›</Text>}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
      <PersonSheet
        person={person}
        nightId={n.id}
        canRemoveFromNight={n.me.isHost}
        onClose={() => setPerson(null)}
        onDone={onChanged}
      />
    </>
  );
}
