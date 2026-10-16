// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlanVote from "./PlanVote";

const places = [
  { key: "p0", name: "Bastian", why: "Seafood" },
  { key: "p1", name: "Masque", why: "Tasting menu" },
];

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function render() {
  act(() =>
    root.render(<PlanVote token="tok" places={places} senderName="Ashish" />),
  );
}

function tap(label: string) {
  act(() => {
    container
      .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
      .click();
  });
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
}

describe("PlanVote", () => {
  it("sends a burst of taps as one vote and remembers it once saved", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    render();
    tap("Yes to Bastian");
    tap("Not Bastian");
    tap("Yes to Bastian");
    tap("Not Masque");
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      token: "tok",
      picks: ["p0"],
      passes: ["p1"],
    });
    expect(container.textContent).toContain(
      "Saved. Ashish sees your picks in the app.",
    );
    expect(
      JSON.parse(window.localStorage.getItem("shelvr.planVote.tok")!),
    ).toEqual({ p0: "pick", p1: "pass" });
  });

  it("numbers each ballot above the last", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    render();
    tap("Yes to Bastian");
    await settle();
    tap("Yes to Masque");
    await settle();

    const revisions = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(init.body).revision as number,
    );
    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toBeGreaterThan(revisions[0]);
  });

  it("sends a vote still settling when the page closes, and keeps it until seen saved", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    render();
    tap("Yes to Bastian");
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ keepalive: true });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toMatchObject({ picks: ["p0"] });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The answer never reaches a closing page, so the ballot waits for the
    // next visit rather than being remembered as saved.
    expect(window.localStorage.getItem("shelvr.planVote.tok")).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem("shelvr.planVotePending.tok")!),
    ).toEqual({ choices: { p0: "pick" }, revision: sent.revision });
  });

  it("shows and resends a ballot that left with the last visit", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    window.localStorage.setItem(
      "shelvr.planVote.tok",
      JSON.stringify({ p1: "pass" }),
    );
    window.localStorage.setItem(
      "shelvr.planVotePending.tok",
      JSON.stringify({ choices: { p0: "pick", p1: "pass" }, revision: 7 }),
    );
    render();

    expect(
      container.querySelector('button[aria-label="Yes to Bastian"]'),
    ).toHaveProperty("ariaPressed", "true");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      picks: ["p0"],
      passes: ["p1"],
      revision: 7,
    });
    expect(
      JSON.parse(window.localStorage.getItem("shelvr.planVote.tok")!),
    ).toEqual({ p0: "pick", p1: "pass" });
    expect(
      window.localStorage.getItem("shelvr.planVotePending.tok"),
    ).toBeNull();

    // The next tap numbers itself above the resent ballot.
    tap("Yes to Masque");
    await settle();
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body).revision,
    ).toBeGreaterThan(7);
  });

  it("does not remember a vote the server refused", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "This shortlist has closed." }), {
        status: 404,
      }),
    );
    render();
    tap("Yes to Bastian");
    await settle();

    expect(container.textContent).toContain("This shortlist has closed.");
    expect(window.localStorage.getItem("shelvr.planVote.tok")).toBeNull();
  });
});
