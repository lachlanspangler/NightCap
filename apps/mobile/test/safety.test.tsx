import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { setToken } from "../src/api";
import { PersonSheet } from "../src/components/PersonSheet";
import { WhosHere } from "../src/components/WhosHere";
import { nightFixture } from "./fixtures";
import { mockFetch, renderScreen } from "./render";

beforeEach(() => setToken("t"));

describe("PersonSheet (privacy review C1)", () => {
  it("blocks in one tap, never deferred", async () => {
    const calls = mockFetch({ "POST /blocks": { ok: true } });
    renderScreen(<PersonSheet person={{ id: "u-ex", name: "Ex", hue: 10 }} onClose={() => undefined} />);
    await act(async () => fireEvent.press(screen.getByTestId("person-block")));
    await waitFor(() => expect(calls.find((c) => c.path === "/blocks")).toBeTruthy());
    expect(JSON.parse(String(calls.find((c) => c.path === "/blocks")!.body))).toEqual({ userId: "u-ex" });
    expect(await screen.findByTestId("person-note")).toHaveTextContent(/aren't told/);
  });
  it("reports a person with a reason, privately", async () => {
    const calls = mockFetch({ "POST /reports": { ok: true } });
    renderScreen(
      <PersonSheet person={{ id: "u-x", name: "X", hue: 10 }} eventId="e1" onClose={() => undefined} />,
    );
    fireEvent.press(screen.getByTestId("person-report"));
    await act(async () => fireEvent.press(screen.getByTestId("person-report-harassment")));
    await waitFor(() => expect(calls.find((c) => c.path === "/reports")).toBeTruthy());
    expect(JSON.parse(String(calls.find((c) => c.path === "/reports")!.body))).toMatchObject({
      userId: "u-x",
      reason: "harassment",
      eventId: "e1",
    });
  });
  it("hosts get a hold-to-remove from tonight; others don't", () => {
    mockFetch({});
    const host = renderScreen(
      <PersonSheet
        person={{ id: "u", name: "U", hue: 1 }}
        nightId="n1"
        canRemoveFromNight
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId("person-remove-night")).toBeTruthy();
    host.unmount();
    renderScreen(
      <PersonSheet
        person={{ id: "u", name: "U", hue: 1 }}
        nightId="n1"
        canRemoveFromNight={false}
        onClose={() => undefined}
      />,
    );
    expect(screen.queryByTestId("person-remove-night")).toBeNull();
  });
});

describe("WhosHere", () => {
  it("lists everyone with how they joined; tapping someone opens their options", async () => {
    mockFetch({});
    const n = nightFixture();
    renderScreen(
      <WhosHere n={n} meId="11111111-1111-4111-8111-111111111111" visible onClose={() => undefined} />,
    );
    expect(screen.getByText("Maya (you)")).toBeTruthy();
    expect(screen.getByText("joined with the code")).toBeTruthy();
    fireEvent.press(screen.getByTestId("who-jules"));
    expect(await screen.findByTestId("person-sheet")).toBeTruthy();
    expect(screen.getByTestId("person-remove-night")).toBeTruthy(); // fixture: me.isHost
  });
});
