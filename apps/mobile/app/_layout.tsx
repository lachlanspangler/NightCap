import {
  Fraunces_600SemiBold,
  Fraunces_600SemiBold_Italic,
  Fraunces_700Bold,
} from "@expo-google-fonts/fraunces";
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DevPanel } from "../src/components/DevPanel";
import { UndoProvider } from "../src/components/Undo";
import { SessionProvider } from "../src/session";
import { night } from "../src/theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [loaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
    Fraunces_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: night.bg }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: night.bg }}>
      <SafeAreaProvider>
        <SessionProvider>
          <UndoProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: night.bg },
                animation: "fade_from_bottom",
              }}
            >
              <Stack.Screen name="night/[id]" options={{ animation: "fade", gestureEnabled: false }} />
              {/* Not a modal: root-level undo toasts must be able to sit on top of it. */}
              <Stack.Screen name="photo/[nightId]/[shotId]" options={{ animation: "fade" }} />
              <Stack.Screen name="invite/[id]" options={{ presentation: "modal" }} />
              <Stack.Screen name="crew/new" options={{ presentation: "modal" }} />
            </Stack>
            <DevPanel />
          </UndoProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
