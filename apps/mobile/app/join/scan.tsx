// Scan a friend's QR to join their night.
import { parseInviteInput } from "@nightcap/core";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Device from "expo-device";
import { router } from "expo-router";
import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BigButton, Gap, Txt } from "../../src/components/ui";
import { haptic } from "../../src/haptics";
import { night, scaleFor } from "../../src/theme";

export default function Scan() {
  const [perm, request] = useCameraPermissions();
  const done = useRef(false);
  const scale = scaleFor(true);
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {Device.isDevice && perm?.granted && (
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            const token = parseInviteInput(data);
            if (!token || done.current) return;
            done.current = true;
            haptic.success();
            router.replace(`/join/${token}`);
          }}
        />
      )}
      <SafeAreaView style={{ flex: 1, padding: 20, justifyContent: "space-between" }}>
        <Txt v="title">Point at their QR</Txt>
        <View
          style={{
            alignSelf: "center",
            width: 240,
            height: 240,
            borderRadius: 28,
            borderWidth: 4,
            borderColor: night.amber,
          }}
        />
        <View>
          {!Device.isDevice && (
            <Txt v="label" tone="textDim" center>
              The simulator has no camera. Use the 4-digit code instead.
            </Txt>
          )}
          {Device.isDevice && !perm?.granted && (
            <BigButton label="Allow camera" scale={scale} onPress={() => void request()} />
          )}
          <Gap />
          <BigButton
            label="Use the code instead"
            kind="secondary"
            primary={false}
            scale={scale}
            onPress={() => router.back()}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
