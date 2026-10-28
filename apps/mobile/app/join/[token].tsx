// Deep link: nightcap://join/<token> (or https://nightcap.app/j/<token>). Redeem, then go there.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "../../src/api";
import { BigButton, ErrorNote, Gap, Loading, Screen, Txt } from "../../src/components/ui";
import { useSession } from "../../src/session";
import { scaleFor } from "../../src/theme";

export default function Redeem() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const session = useSession();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session.ready) return;
    if (!session.token) {
      router.replace("/welcome");
      return;
    }
    if (token === "scan") return;
    api<{ kind: "crew" | "night"; crewId: string | null; nightId: string | null }>(
      "POST",
      "/invites/redeem",
      { token },
    ).then(
      (r) => router.replace(r.kind === "night" ? `/night/${r.nightId}` : `/crew/${r.crewId}`),
      (e) => setError((e as Error).message),
    );
  }, [token, session.ready, session.token]);
  return (
    <Screen>
      <Gap h={60} />
      {error ? (
        <>
          <Txt v="title">Hmm.</Txt>
          <Gap />
          <ErrorNote message={error} />
          <Gap />
          <BigButton label="Go home" scale={scaleFor(false)} onPress={() => router.replace("/(tabs)")} />
        </>
      ) : (
        <Loading />
      )}
    </Screen>
  );
}
