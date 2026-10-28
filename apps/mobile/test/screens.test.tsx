import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet } from "react-native";
import { TARGETS } from "@nightcap/core";
import * as SecureStore from "expo-secure-store";
import { setToken } from "../src/api";
import LiveNight from "../app/night/[id]";
import Album from "../app/album/[id]";
import Join from "../app/join/index";
import Review from "../app/review/[id]";
import { me, nightFixture } from "./fixtures";
import { mockFetch, renderScreen } from "./render";

const router = (globalThis as unknown as { mockRouter: { push: jest.Mock; replace: jest.Mock } }).mockRouter;
const height = (el: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(el.props.style as never) as { width?: number; minHeight?: number; height?: number }) ??
  {};

beforeEach(() => {
  jest.clearAllMocks();
  setToken("t");
});

describe("live night (camera)", () => {
  beforeEach(() => (useLocalSearchParams as jest.Mock).mockReturnValue({ id: "n1" }));

  it("shows one huge shutter (≥ 88pt), the shots left, the code, and develop time", async () => {
    const n = nightFixture();
    mockFetch({ "/nights/n1": { night: n }, "/me": me() });
    renderScreen(<LiveNight />, { "/nights/n1": { night: n } });
    const shutter = await screen.findByTestId("shutter");
    expect(height(shutter).width).toBeGreaterThanOrEqual(TARGETS.nightPrimary);
    expect(screen.getByTestId("shots-left")).toHaveTextContent("17");
    expect(screen.getByText("3917")).toBeTruthy();
    expect(screen.getByText("Develops at 10:00 AM")).toBeTruthy();
    expect(screen.getByTestId("night-roll-count")).toHaveTextContent("19 in the roll");
  });

  it("every tappable on the camera screen meets the night-mode minimum", async () => {
    const n = nightFixture();
    mockFetch({ "/nights/n1": { night: n } });
    renderScreen(<LiveNight />, { "/nights/n1": { night: n } });
    await screen.findByTestId("shutter");
    for (const id of ["night-close", "night-invite", "night-end"]) {
      const el = screen.getByTestId(id);
      const s = height(el);
      expect(Math.max(s.minHeight ?? 0, s.height ?? 0)).toBeGreaterThanOrEqual(TARGETS.nightMin);
    }
  });

  it("when the roll is full, the shutter is replaced by a kind message", async () => {
    const n = nightFixture({ me: { ...nightFixture().me, shotsLeft: 0, shotsTaken: 24 } });
    mockFetch({ "/nights/n1": { night: n } });
    renderScreen(<LiveNight />, { "/nights/n1": { night: n } });
    expect(await screen.findByText("Roll's full.")).toBeTruthy();
    expect(screen.queryByTestId("shutter")).toBeNull();
  });

  it("ending the night needs a deliberate hold, not a tap", async () => {
    const n = nightFixture();
    const calls = mockFetch({
      "/nights/n1": { night: n },
      "POST /nights/n1/end": { night: { ...n, phase: "developing" } },
    });
    renderScreen(<LiveNight />, { "/nights/n1": { night: n } });
    fireEvent.press(await screen.findByTestId("night-end"));
    const hold = screen.getByTestId("night-end-hold");
    fireEvent.press(hold); // a quick tap does nothing
    expect(calls.some((c) => c.path === "/nights/n1/end")).toBe(false);
  });

  it("a non-live night redirects to its album", async () => {
    const n = nightFixture({ phase: "developing" });
    mockFetch({ "/nights/n1": { night: n } });
    renderScreen(<LiveNight />, { "/nights/n1": { night: n } });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/album/n1"));
  });
});

describe("album", () => {
  beforeEach(() => (useLocalSearchParams as jest.Mock).mockReturnValue({ id: "n1" }));

  it("developing: shows when it develops, the roll per person, and the sober check", async () => {
    const n = nightFixture({
      phase: "developing",
      endedAt: "2026-10-31T08:00:00.000Z",
      code: null,
      me: { ...nightFixture().me, readyCountsFrom: "2026-10-31T12:00:00.000Z" },
    });
    mockFetch({ "/nights/n1": { night: n }, "/me": me() });
    renderScreen(<Album />, { "/nights/n1": { night: n }, "/me": me() });
    expect(await screen.findByTestId("developing-title")).toHaveTextContent("Developing…");
    expect(screen.getByText("Ready at 10:00 AM")).toBeTruthy();
    expect(screen.getByText("THE ROLL · 19 SHOTS")).toBeTruthy();
    expect(screen.getAllByText("not up yet")).toHaveLength(3);
    expect(screen.getByText("Get some sleep.")).toBeTruthy();
    expect(screen.queryByTestId("im-good")).toBeNull();
  });

  it("developing in the morning: one big 'I'm good'", async () => {
    const n = nightFixture({
      phase: "developing",
      endedAt: "2026-10-31T08:00:00.000Z",
      me: { ...nightFixture().me, canMarkReady: true },
    });
    const calls = mockFetch({
      "/nights/n1": { night: n },
      "POST /nights/n1/ready": { night: n },
      "/me": me(),
    });
    renderScreen(<Album />, { "/nights/n1": { night: n } });
    fireEvent.press(await screen.findByTestId("im-good"));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path === "/nights/n1/ready")).toBe(true),
    );
  });

  it("unlocked, first open: a hold-to-develop ceremony, then the night in time order", async () => {
    await SecureStore.setItemAsync("nightcap.session.v1", JSON.stringify({ token: "t", userId: "u-maya" }));
    const times = ["2026-10-31T03:00:00.000Z", "2026-10-31T04:10:00.000Z", "2026-10-31T08:30:00.000Z"];
    const shots = ["11111111-1111-4111-8111-111111111111", "t", "j"].map((a, i) => ({
      id: `s${i}`,
      authorId: a,
      takenAt: times[i]!,
      url: `/media/s${i}?v=x`,
      width: 720,
      height: 960,
      mine: i === 0,
      status: "kept",
      hiddenFromOthers: false,
      reactions: {},
      myReaction: null,
      tags: [],
    }));
    const n = nightFixture({
      phase: "unlocked",
      unlockReason: "everyone_ready",
      shots,
      endedAt: "2026-10-31T08:00:00.000Z",
      unlockedAt: "2026-10-31T12:30:00.000Z",
    });
    mockFetch({ "/nights/n1": { night: n } });
    renderScreen(<Album />, { "/nights/n1": { night: n } });
    expect(await screen.findByTestId("reveal-gate")).toBeTruthy();
    expect(screen.getByText("Last night is ready.")).toBeTruthy();
    expect(screen.queryByLabelText(/Photo by/)).toBeNull(); // nothing shown before you develop it
    await act(async () =>
      fireEvent(screen.getByTestId("hold-to-develop"), "accessibilityAction", {
        nativeEvent: { actionName: "activate" },
      }),
    );
    expect(await screen.findByTestId("album-title")).toHaveTextContent("It developed.");
    expect(screen.getByText("EVERYONE WAS UP EARLY")).toBeTruthy();
    expect(screen.getAllByLabelText(/Photo by/)).toHaveLength(3);
    expect(screen.getByText("10 PM")).toBeTruthy();
    expect(screen.getByText("11 PM")).toBeTruthy();
    expect(screen.getByText("AFTER 2 AM")).toBeTruthy();
    expect(screen.getByTestId("album-save-all")).toBeTruthy();
  });
});

describe("join with a code", () => {
  it("joins as soon as 4 digits are in, and shows a generic error otherwise", async () => {
    const calls = mockFetch({ "POST /nights/join": { night: nightFixture() }, "/me": me() });
    renderScreen(<Join />);
    for (const d of ["3", "9", "1", "7"]) fireEvent.press(screen.getByTestId(`key-${d}`));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/night/n1"));
    expect(JSON.parse(String(calls.find((c) => c.path === "/nights/join")!.body))).toEqual({ code: "3917" });
  });
  it("keys are big", () => {
    mockFetch({});
    renderScreen(<Join />);
    const key = screen.getByTestId("key-5");
    expect(height(key).height).toBeGreaterThanOrEqual(56);
  });
  it("wrong code: generic message, digits cleared", async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      text: async () =>
        JSON.stringify({ error: "unavailable", message: "That night isn't available. Check the code?" }),
    })) as never;
    renderScreen(<Join />);
    for (const d of ["1", "1", "1", "1"]) fireEvent.press(screen.getByTestId(`key-${d}`));
    expect(await screen.findByText("That night isn't available. Check the code?")).toBeTruthy();
  });
});

describe("morning review", () => {
  beforeEach(() => (useLocalSearchParams as jest.Mock).mockReturnValue({ id: "n1" }));
  it("one shot at a time; toss waits out an undo toast, keep is immediate", async () => {
    const shots = [0, 1].map((i) => ({
      id: `m${i}`,
      authorId: "11111111-1111-4111-8111-111111111111",
      takenAt: "2026-10-31T03:00:00.000Z",
      url: `/media/m${i}`,
      width: 1,
      height: 1,
      mine: true,
      status: "held",
      hiddenFromOthers: false,
      reactions: {},
      myReaction: null,
      tags: [],
    }));
    const n = nightFixture({ phase: "developing", shots });
    const calls = mockFetch({
      "/nights/n1": { night: n },
      "PATCH /shots/m0": { ok: true },
      "PATCH /shots/m1": { ok: true },
      "/me": me(),
    });
    renderScreen(<Review />, { "/nights/n1": { night: n } });
    expect(await screen.findByText("1 of 2 · only you can see these")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId("review-toss")));
    expect(await screen.findByText("2 of 2 · only you can see these")).toBeTruthy();
    expect(screen.getByText("Tossed. Nobody will ever see it.")).toBeTruthy();
    expect(calls.some((c) => c.path === "/shots/m0")).toBe(false); // not yet: undo window
    await act(async () => fireEvent.press(screen.getByTestId("undo")));
    expect(await screen.findByText("1 of 2 · only you can see these")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId("review-keep")));
    await act(async () => fireEvent.press(screen.getByTestId("review-keep")));
    expect(await screen.findByText("Done.")).toBeTruthy();
    expect(calls.filter((c) => c.method === "PATCH").map((c) => JSON.parse(String(c.body)).status)).toEqual([
      "kept",
      "kept",
    ]);
  });
});
