// UI kit. Every tappable gets an accessibility label and a min height from the scale (DRUNK_UX).
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { haptic } from "../haptics";
import { dawn, fonts, night, type, type Scale } from "../theme";

export type Mode = "night" | "dawn";
export const palette = (m: Mode) => (m === "night" ? night : dawn);

export function Screen({
  children,
  mode = "night",
  scroll = false,
  padded = true,
  testID,
  edges = ["top", "bottom"],
}: {
  children: ReactNode;
  mode?: Mode;
  scroll?: boolean;
  padded?: boolean;
  testID?: string;
  edges?: ("top" | "bottom" | "left" | "right")[];
}) {
  const bg = mode === "night" ? night.bg : dawn.bg;
  const inner = <View style={[{ flex: 1 }, padded && { paddingHorizontal: 20 }]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: bg }} testID={testID}>
      <StatusBar style={mode === "night" ? "light" : "dark"} />
      {mode === "dawn" && (
        <LinearGradient
          colors={[...dawn.gradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <SafeAreaView edges={edges} style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[padded && { paddingHorizontal: 20 }, { paddingBottom: 48 }]}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          inner
        )}
      </SafeAreaView>
    </View>
  );
}

type TxtVariant = "hero" | "title" | "heading" | "body" | "label" | "small" | "counter" | "code" | "italic";

const variantStyle: Record<TxtVariant, TextStyle> = {
  hero: { fontFamily: fonts.display, fontSize: type.hero, lineHeight: type.hero * 1.08, letterSpacing: -0.5 },
  title: {
    fontFamily: fonts.display,
    fontSize: type.title,
    lineHeight: type.title * 1.15,
    letterSpacing: -0.3,
  },
  heading: { fontFamily: fonts.bodyBold, fontSize: type.heading, lineHeight: type.heading * 1.25 },
  body: { fontFamily: fonts.body, fontSize: type.body, lineHeight: type.body * 1.45 },
  label: { fontFamily: fonts.bodySemi, fontSize: type.label, lineHeight: type.label * 1.35 },
  small: {
    fontFamily: fonts.bodySemi,
    fontSize: type.small,
    lineHeight: type.small * 1.35,
    letterSpacing: 0.3,
  },
  counter: { fontFamily: fonts.display, fontSize: type.counter, lineHeight: type.counter * 1.05 },
  code: { fontFamily: fonts.display, fontSize: type.code, letterSpacing: 10 },
  italic: { fontFamily: fonts.displayItalic, fontSize: type.heading, lineHeight: type.heading * 1.3 },
};

export function Txt({
  children,
  v = "body",
  mode = "night",
  tone = "text",
  scale,
  style,
  center,
  testID,
  numberOfLines,
}: {
  children: ReactNode;
  v?: TxtVariant;
  mode?: Mode;
  tone?: "text" | "textDim" | "textFaint" | "accent";
  scale?: Scale;
  style?: StyleProp<TextStyle>;
  center?: boolean;
  testID?: string;
  numberOfLines?: number;
}) {
  const p = palette(mode);
  const color = tone === "accent" ? (mode === "night" ? night.amber : dawn.accent) : p[tone];
  const base = variantStyle[v];
  const k = scale?.type ?? 1;
  return (
    <Text
      testID={testID}
      numberOfLines={numberOfLines}
      allowFontScaling
      style={[
        base,
        {
          color,
          fontSize: (base.fontSize ?? 17) * k,
          lineHeight: base.lineHeight ? base.lineHeight * k : undefined,
        },
        center && { textAlign: "center" },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function BigButton({
  label,
  onPress,
  scale,
  mode = "night",
  kind = "primary",
  icon,
  disabled,
  busy,
  testID,
  primary = true,
  style,
}: {
  label: string;
  onPress: () => void;
  scale: Scale;
  mode?: Mode;
  kind?: "primary" | "secondary" | "danger" | "quiet";
  icon?: string;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  /** Primary buttons get the big (88pt at night) target; others the regular minimum. */
  primary?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = palette(mode);
  const bg =
    kind === "primary"
      ? mode === "night"
        ? night.amber
        : dawn.accent
      : kind === "danger"
        ? mode === "night"
          ? "#3A1620"
          : "#FBE0DC"
        : kind === "quiet"
          ? "transparent"
          : mode === "night"
            ? night.surface2
            : "rgba(255,255,255,0.75)";
  const fg =
    kind === "primary"
      ? mode === "night"
        ? night.amberInk
        : dawn.accentInk
      : kind === "danger"
        ? mode === "night"
          ? night.danger
          : dawn.accent
        : p.text;
  const height = primary ? scale.primary : scale.target;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: height,
          backgroundColor: bg,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        kind === "secondary" && { borderWidth: 1, borderColor: mode === "night" ? night.line : dawn.line },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: (primary ? 20 : 17) * scale.type,
            color: fg,
            textAlign: "center",
          }}
        >
          {icon ? `${icon}  ` : ""}
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function IconButton({
  label,
  glyph,
  onPress,
  scale,
  mode = "night",
  testID,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  scale: Scale;
  mode?: Mode;
  testID?: string;
}) {
  const p = palette(mode);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        minWidth: scale.target,
        minHeight: scale.target,
        borderRadius: scale.target / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: mode === "night" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.7)",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontSize: 22 * scale.type, color: p.text }}>{glyph}</Text>
    </Pressable>
  );
}

export function Avatar({
  name,
  hue,
  size = 40,
  ring,
}: {
  name: string;
  hue: number;
  size?: number;
  ring?: string;
}) {
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `hsl(${hue}, 62%, 58%)`,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}
    >
      <Text style={{ fontFamily: fonts.bodyBlack, fontSize: size * 0.42, color: "#160F1C" }}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function AvatarStack({
  people,
  size = 34,
  max = 5,
  ring = night.bg,
}: {
  people: { name: string; hue: number }[];
  size?: number;
  max?: number;
  ring?: string;
}) {
  const shown = people.slice(0, max);
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center" }}
      accessibilityLabel={people.map((p) => p.name).join(", ")}
    >
      {shown.map((p, i) => (
        <View key={`${p.name}${i}`} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar name={p.name} hue={p.hue} size={size} ring={ring} />
        </View>
      ))}
      {people.length > max && (
        <Txt v="small" tone="textDim" style={{ marginLeft: 6 }}>{`+${people.length - max}`}</Txt>
      )}
    </View>
  );
}

export function Card({
  children,
  mode = "night",
  style,
  onPress,
  label,
  testID,
}: {
  children: ReactNode;
  mode?: Mode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  label?: string;
  testID?: string;
}) {
  const bg = mode === "night" ? night.surface : "rgba(255,255,255,0.78)";
  const border = mode === "night" ? night.line : "rgba(255,255,255,0.9)";
  const body = (
    <View
      style={[
        { backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: 22, padding: 18 },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}
    >
      {body}
    </Pressable>
  );
}

export function Pill({
  text,
  mode = "night",
  tone = "amber",
}: {
  text: string;
  mode?: Mode;
  tone?: "amber" | "plum" | "quiet" | "success";
}) {
  const bg =
    tone === "amber"
      ? "rgba(255,180,77,0.16)"
      : tone === "plum"
        ? "rgba(155,123,224,0.18)"
        : tone === "success"
          ? "rgba(123,227,181,0.16)"
          : mode === "night"
            ? night.surface2
            : "rgba(255,255,255,0.7)";
  const fg =
    mode === "dawn"
      ? dawn.text
      : tone === "amber"
        ? night.amber
        : tone === "plum"
          ? "#CDB8FF"
          : tone === "success"
            ? night.success
            : night.textDim;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: fg, letterSpacing: 0.4 }}>{text}</Text>
    </View>
  );
}

export const Gap = ({ h = 12 }: { h?: number }) => <View style={{ height: h }} />;

export function Loading({ mode = "night" }: { mode?: Mode }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={mode === "night" ? night.amber : dawn.accent} size="large" />
    </View>
  );
}

export function ErrorNote({ message, mode = "night" }: { message: string; mode?: Mode }) {
  return (
    <View
      accessibilityRole="alert"
      style={{ padding: 14, borderRadius: 16, backgroundColor: mode === "night" ? "#2A1420" : "#FDE4DF" }}
    >
      <Txt v="label" mode={mode}>
        {message}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
});
