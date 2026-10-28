// "Who's out with you?": the night's code (say it across the bar), a QR to scan, and a link.
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Share, View } from "react-native";
import { api } from "../../src/api";
import { QR } from "../../src/components/QR";
import { BigButton, ErrorNote, Gap, Loading, Screen, Txt } from "../../src/components/ui";
import { haptic } from "../../src/haptics";
import { night } from "../../src/theme";
import { useMe } from "../../src/useMe";

interface Invite {
  code: string | null;
  links: { app: string; web: string };
}

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { scale } = useMe();
  const [inv, setInv] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api<Invite>("POST", `/nights/${id}/invites`).then(setInv, (e) => setError((e as Error).message));
  }, [id]);
  return (
    <Screen testID="invite">
      <Gap h={22} />
      <Txt v="title" center>
        Who&apos;s out with you?
      </Txt>
      <Txt v="label" tone="textDim" center>
        They join tonight&apos;s roll. They&apos;ll only ever see this night.
      </Txt>
      <Gap h={24} />
      {error && <ErrorNote message={error} />}
      {!inv && !error && <Loading />}
      {inv && (
        <View style={{ alignItems: "center" }}>
          <Txt v="small" tone="textDim">
            SAY THE CODE
          </Txt>
          <Txt v="code" tone="accent" testID="invite-code">
            {inv.code ?? "----"}
          </Txt>
          <Gap h={18} />
          <View style={{ padding: 12, borderRadius: 24, backgroundColor: night.text }}>
            <QR value={inv.links.web} size={210} />
          </View>
          <Gap h={8} />
          <Txt v="small" tone="textDim">
            OR SCAN THIS
          </Txt>
        </View>
      )}
      <View style={{ flex: 1 }} />
      {inv && (
        <>
          <BigButton
            testID="invite-share"
            label="Send the link"
            scale={scale}
            onPress={() =>
              void Share.share({
                message: `Join tonight's roll on NightCap. Code ${inv.code ?? ""}: ${inv.links.web}`,
              })
            }
          />
          <Gap h={10} />
          <BigButton
            label={copied ? "Copied" : "Copy link"}
            kind="secondary"
            primary={false}
            scale={scale}
            onPress={async () => {
              await Clipboard.setStringAsync(inv.links.web);
              haptic.success();
              setCopied(true);
            }}
          />
        </>
      )}
      <Gap h={10} />
      <BigButton
        testID="invite-done"
        label="Done"
        kind="quiet"
        primary={false}
        scale={scale}
        onPress={() => router.back()}
      />
    </Screen>
  );
}
