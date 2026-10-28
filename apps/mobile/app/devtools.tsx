// nightcap://devtools?chrome=0 hides the DEV pill for clean screenshots (mock mode only).
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { setDevChrome } from "../src/focus";

export default function DevTools() {
  const { chrome } = useLocalSearchParams<{ chrome?: string }>();
  useEffect(() => setDevChrome(chrome !== "0"), [chrome]);
  return <Redirect href="/(tabs)" />;
}
