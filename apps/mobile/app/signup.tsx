// Sign-up: first name + date of birth (21+). In mock mode it creates a dev account; prod would use
// Supabase phone OTP / Sign in with Apple (STATUS → Needs from you).
import { checkAge } from "@nightcap/core";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { api } from "../src/api";
import { serverNow } from "../src/clock";
import { BigButton, ErrorNote, Gap, IconButton, Screen, Txt } from "../src/components/ui";
import { MOCK } from "../src/config";
import { useSession } from "../src/session";
import { fonts, night, scaleFor } from "../src/theme";

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";

function Field({
  value,
  onChange,
  placeholder,
  width,
  max,
  testID,
  next,
  refEl,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
  width: number;
  max: number;
  testID: string;
  next?: () => void;
  refEl?: React.RefObject<TextInput | null>;
}) {
  return (
    <TextInput
      ref={refEl}
      testID={testID}
      accessibilityLabel={placeholder}
      value={value}
      onChangeText={(t) => {
        const d = t.replace(/\D/g, "").slice(0, max);
        onChange(d);
        if (d.length === max) next?.();
      }}
      placeholder={placeholder}
      placeholderTextColor={night.textFaint}
      keyboardType="number-pad"
      style={{
        width,
        height: 72,
        borderRadius: 18,
        backgroundColor: night.surface2,
        color: night.text,
        fontFamily: fonts.display,
        fontSize: 30,
        textAlign: "center",
      }}
    />
  );
}

export default function Signup() {
  const session = useSession();
  const scale = scaleFor(false);
  const [name, setName] = useState("");
  const [mm, setMm] = useState("");
  const [dd, setDd] = useState("");
  const [yyyy, setYyyy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dRef = useRef<TextInput>(null);
  const yRef = useRef<TextInput>(null);
  const birthdate = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  const complete = name.trim().length > 0 && mm.length > 0 && dd.length > 0 && yyyy.length === 4;

  const submit = async () => {
    setError(null);
    const age = checkAge(birthdate, serverNow(), tz);
    if (!age.ok) {
      setError(
        age.error === "under_21"
          ? "NightCap is for 21+. Come back on your 21st. We'll save you a seat."
          : "That date doesn't look right.",
      );
      return;
    }
    if (!MOCK) {
      setError("Phone sign-in isn't wired up in this prototype yet.");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ token: string; userId: string }>("POST", "/dev/signup", {
        name: name.trim(),
        birthdate,
        tz,
      });
      await session.signIn(r.token, r.userId);
      router.replace("/(tabs)");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="signup">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Gap h={8} />
        <IconButton label="Back" glyph="‹" scale={scale} onPress={() => router.back()} />
        <Gap h={24} />
        <Txt v="title">What do your friends call you?</Txt>
        <Gap h={14} />
        <TextInput
          testID="signup-name"
          accessibilityLabel="First name"
          value={name}
          onChangeText={setName}
          placeholder="First name"
          placeholderTextColor={night.textFaint}
          autoCapitalize="words"
          maxLength={30}
          style={{
            height: 64,
            borderRadius: 18,
            backgroundColor: night.surface2,
            color: night.text,
            fontFamily: fonts.bodySemi,
            fontSize: 22,
            paddingHorizontal: 18,
          }}
        />
        <Gap h={28} />
        <Txt v="heading">Your birthday</Txt>
        <Txt v="label" tone="textDim">
          NightCap is 21+. We only keep the date to check that, never show it.
        </Txt>
        <Gap h={12} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field
            testID="signup-mm"
            placeholder="MM"
            value={mm}
            onChange={setMm}
            width={84}
            max={2}
            next={() => dRef.current?.focus()}
          />
          <Field
            testID="signup-dd"
            placeholder="DD"
            value={dd}
            onChange={setDd}
            width={84}
            max={2}
            refEl={dRef}
            next={() => yRef.current?.focus()}
          />
          <Field
            testID="signup-yyyy"
            placeholder="YYYY"
            value={yyyy}
            onChange={setYyyy}
            width={130}
            max={4}
            refEl={yRef}
          />
        </View>
        <View style={{ flex: 1 }} />
        {error && <ErrorNote message={error} />}
        <Gap />
        <BigButton
          testID="signup-submit"
          label="I'm 21+, let's go"
          scale={scale}
          disabled={!complete}
          busy={busy}
          onPress={submit}
        />
        <Gap h={10} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
