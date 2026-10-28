// Hold-to-confirm (DRUNK_UX): destructive actions need a deliberate hold with a filling bar.
// Hard to do by accident, easy on purpose. The duration grows at night. The amber tone is for
// ceremonies (holding to develop last night's album), not danger.
import { holdToConfirmMs } from "@nightcap/core";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { haptic } from "../haptics";
import { fonts, night, type Scale } from "../theme";

export function HoldButton({
  label,
  onConfirm,
  scale,
  testID,
  hint = "Hold to confirm",
  tone = "danger",
  big = false,
  ms: msOverride,
}: {
  label: string;
  onConfirm: () => void;
  scale: Scale;
  testID?: string;
  hint?: string;
  tone?: "danger" | "amber";
  big?: boolean;
  ms?: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const done = useRef(false);
  const ms = msOverride ?? holdToConfirmMs(scale.nightMode);
  const amber = tone === "amber";

  useEffect(() => () => progress.stopAnimation(), [progress]);

  const start = () => {
    done.current = false;
    setHolding(true);
    haptic.tick();
    Animated.timing(progress, {
      toValue: 1,
      duration: ms,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !done.current) {
        done.current = true;
        setHolding(false);
        amber ? haptic.success() : haptic.warn();
        onConfirm();
        progress.setValue(0);
      }
    });
  };
  const cancel = () => {
    if (done.current) return;
    setHolding(false);
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityActions={[{ name: "activate", label }]}
      onAccessibilityAction={() => onConfirm()}
      onPressIn={start}
      onPressOut={cancel}
      style={{
        minHeight: big ? scale.primary : scale.target,
        borderRadius: 999,
        overflow: "hidden",
        backgroundColor: amber ? "rgba(255,180,77,0.18)" : "#3A1620",
        borderWidth: amber ? 2 : 0,
        borderColor: night.amber,
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          backgroundColor: amber ? night.amber : "rgba(255,122,122,0.45)",
        }}
      />
      <View style={{ paddingHorizontal: 24, alignItems: "center" }}>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: (big ? 20 : 17) * scale.type,
            color: amber ? night.text : night.danger,
            textShadowColor: amber ? "rgba(12,10,20,0.85)" : undefined,
            textShadowRadius: amber ? 6 : 0,
          }}
        >
          {holding ? (amber ? "Developing…" : "Keep holding…") : label}
        </Text>
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 13 * scale.type,
            color: amber ? night.text : night.textDim,
            textShadowColor: amber ? "rgba(12,10,20,0.85)" : undefined,
            textShadowRadius: amber ? 6 : 0,
          }}
        >
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}
