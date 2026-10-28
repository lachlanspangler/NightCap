// Jest setup: mock native modules that don't exist in the test renderer.
/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Heavy: "heavy", Light: "light" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
}));
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
jest.mock("expo-camera", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    CameraView: React.forwardRef((props: object, ref: unknown) =>
      React.createElement(View, { ...props, ref, testID: "camera" }),
    ),
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});
jest.mock("expo-device", () => ({ isDevice: false }));
jest.mock("expo-media-library", () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  saveToLibraryAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  downloadAsync: jest.fn(async (_u: string, to: string) => ({ uri: to })),
  deleteAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("expo-image", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Image: (props: object) =>
      React.createElement(View, { ...props, testID: (props as { testID?: string }).testID ?? "image" }),
  };
});
jest.mock("expo-linear-gradient", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { LinearGradient: (props: object) => React.createElement(View, props) };
});
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  setParams: jest.fn(),
};
jest.mock("expo-router", () => ({
  router: mockRouter,
  useRouter: () => mockRouter,
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: () => null,
  Stack: { Screen: () => null },
}));
(globalThis as unknown as { mockRouter: typeof mockRouter }).mockRouter = mockRouter;
jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    SafeAreaView: (props: object) => React.createElement(View, props),
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => insets,
  };
});
