import * as Haptics from "expo-haptics";

// Haptics confirm everything (DRUNK_UX): heavy for the shutter, success for saves, light for undo.
const safe = (p: Promise<unknown>) => void p.catch(() => undefined);
export const haptic = {
  shutter: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  tap: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warn: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  tick: () => safe(Haptics.selectionAsync()),
};
