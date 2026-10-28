// An undeveloped frame: amber safelight glow, grain, a frame number. Never derived from the real
// photo (a blurred thumbnail would leak content before the unlock, PRIVACY_SAFETY).
import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { fonts } from "../theme";

function grain(seed: number, n: number) {
  let s = seed >>> 0;
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  return Array.from({ length: n }, () => ({
    x: r() * 100,
    y: r() * 100,
    r: 0.3 + r() * 0.9,
    o: 0.05 + r() * 0.12,
  }));
}

export function FilmTile({
  frame,
  size,
  seed = frame,
  label,
}: {
  frame: number;
  size: number;
  seed?: number;
  label?: string;
}) {
  const dots = useMemo(() => grain(seed * 97 + 13, 46), [seed]);
  const warm = seed % 3;
  const colors =
    warm === 0
      ? (["#5A2A12", "#B5561E", "#3A160C"] as const)
      : warm === 1
        ? (["#4A1A1E", "#A8452A", "#2B0F14"] as const)
        : (["#5E3410", "#C46B22", "#341A08"] as const);
  return (
    <View
      accessibilityLabel={label ?? `Undeveloped frame ${frame}`}
      style={{
        width: size,
        height: size * 1.33,
        borderRadius: 10,
        overflow: "hidden",
        backgroundColor: "#2A140C",
      }}
    >
      <LinearGradient
        colors={[...colors]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1 }}
      />
      <Svg
        style={{ position: "absolute", left: 0, top: 0 }}
        width={size}
        height={size * 1.33}
        viewBox="0 0 100 133"
      >
        {dots.map((d, i) => (
          <Circle key={i} cx={d.x} cy={d.y * 1.33} r={d.r} fill="#FFD9A0" opacity={d.o} />
        ))}
      </Svg>
      {size >= 30 && (
        <Text
          style={{
            position: "absolute",
            left: 7,
            bottom: 5,
            fontFamily: fonts.bodyBold,
            fontSize: Math.max(10, size * 0.11),
            color: "rgba(255,214,160,0.75)",
            letterSpacing: 1,
          }}
        >
          {String(frame).padStart(2, "0")}
        </Text>
      )}
    </View>
  );
}
