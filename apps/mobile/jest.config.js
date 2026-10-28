// Screen/component tests (jest-expo + React Native Testing Library). *.test.tsx under test/.
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  testMatch: ["<rootDir>/test/**/*.test.{ts,tsx}"],
  // packages/core lives outside this app: let its imports (babel helpers) resolve from our node_modules.
  moduleDirectories: ["node_modules", "<rootDir>/node_modules"],
  moduleNameMapper: { "^@nightcap/core$": "<rootDir>/../../packages/core/src/index.ts" },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|qrcode-generator)",
  ],
};
