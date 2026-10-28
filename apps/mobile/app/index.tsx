import { Redirect } from "expo-router";
import { Loading, Screen } from "../src/components/ui";
import { useSession } from "../src/session";

export default function Index() {
  const { ready, token } = useSession();
  if (!ready) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  return <Redirect href={token ? "/(tabs)" : "/welcome"} />;
}
