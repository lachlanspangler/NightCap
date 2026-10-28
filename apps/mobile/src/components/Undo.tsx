// Undo toasts (DRUNK_UX): actions wait out an undo window before they run (8s at night, 5s by day).
// Shown at the top: at the bottom it sat on the next primary button and caught the next tap.
import { undoWindowMs } from "@nightcap/core";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "../haptics";
import { fonts, night } from "../theme";

interface Pending {
  id: number;
  message: string;
  run: () => Promise<void> | void;
  onUndo?: () => void;
  timer: ReturnType<typeof setTimeout>;
}

const Ctx = createContext<{
  withUndo(message: string, run: () => Promise<void> | void, nightMode: boolean, onUndo?: () => void): void;
} | null>(null);

export function UndoProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const seq = useRef(0);
  const insets = useSafeAreaInsets();

  const ref = useRef<Pending | null>(null);

  const withUndo = useCallback(
    (message: string, run: () => Promise<void> | void, nightMode: boolean, onUndo?: () => void) => {
      const prev = ref.current;
      if (prev) {
        clearTimeout(prev.timer);
        void prev.run(); // a new action commits the previous one
      }
      const id = ++seq.current;
      const timer = setTimeout(() => {
        if (ref.current?.id === id) {
          ref.current = null;
          setPending(null);
        }
        void run();
      }, undoWindowMs(nightMode));
      ref.current = { id, message, run, onUndo, timer };
      setPending(ref.current);
    },
    [],
  );

  const undo = () => {
    if (!ref.current) return;
    clearTimeout(ref.current.timer);
    const undone = ref.current;
    ref.current = null;
    undone.onUndo?.();
    haptic.tap();
    setPending(null);
  };

  return (
    <Ctx.Provider value={{ withUndo }}>
      {children}
      {pending && (
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", left: 16, right: 16, top: insets.top + 8 }}
        >
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: night.surface2,
              borderRadius: 20,
              paddingLeft: 18,
              borderWidth: 1,
              borderColor: night.line,
            }}
          >
            <Text style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 16, color: night.text }}>
              {pending.message}
            </Text>
            <Pressable
              testID="undo"
              accessibilityRole="button"
              accessibilityLabel="Undo"
              onPress={undo}
              style={{ minHeight: 56, minWidth: 96, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontFamily: fonts.bodyBlack, fontSize: 17, color: night.amber }}>UNDO</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Ctx.Provider>
  );
}

export function useUndo() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUndo outside UndoProvider");
  return c.withUndo;
}
