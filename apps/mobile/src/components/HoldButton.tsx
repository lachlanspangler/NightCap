// Hold-to-confirm (DRUNK_UX): destructive actions need a deliberate hold with a filling bar.
// Hard to do by accident, easy on purpose. The duration grows at night.
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
}: {
  label: string;
  onConfirm: () => void;
  scale: Scale;
  testID?: string;
  hint?: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const done = useRef(false);
  const ms = holdToConfirmMs(scale.nightMode);

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
        haptic.warn();
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
        minHeight: scale.target,
        borderRadius: 999,
        overflow: "hidden",
        backgroundColor: "#3A1620",
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
          backgroundColor: "rgba(255,122,122,0.45)",
        }}
      />
      <View style={{ paddingHorizontal: 24, alignItems: "center" }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 17 * scale.type, color: night.danger }}>
          {holding ? "Keep holding…" : label}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 12 * scale.type, color: night.textDim }}>
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}
