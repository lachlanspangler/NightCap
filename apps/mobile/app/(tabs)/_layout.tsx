import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useSession } from "../../src/session";
import { fonts, night } from "../../src/theme";

const icon =
  (glyph: string) =>
  ({ color }: { color: string }) => <Text style={{ fontSize: 22, color }}>{glyph}</Text>;

export default function TabsLayout() {
  const { ready, token } = useSession();
  if (ready && !token) return <Redirect href="/welcome" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: night.surface,
          borderTopColor: night.line,
          height: 88,
          paddingTop: 8,
        },
        tabBarActiveTintColor: night.amber,
        tabBarInactiveTintColor: night.textDim,
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 12 },
        sceneStyle: { backgroundColor: night.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Crews", tabBarIcon: icon("🌙"), tabBarAccessibilityLabel: "Crews" }}
      />
      <Tabs.Screen
        name="city"
        options={{ title: "City Nights", tabBarIcon: icon("🏙"), tabBarAccessibilityLabel: "City Nights" }}
      />
      <Tabs.Screen
        name="you"
        options={{ title: "You", tabBarIcon: icon("☺︎"), tabBarAccessibilityLabel: "You" }}
      />
    </Tabs>
  );
}
