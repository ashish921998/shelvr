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
    ).toMatchObject({ choices: { p0: "pick", p1: "pass" } });
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
    // A saved ballot from a page before revisions: bare choices.
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
    ).toEqual({ choices: { p0: "pick", p1: "pass" }, revision: 7 });
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

  it("keeps a sent ballot pending until its answer arrives", async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
    );
    render();
    tap("Yes to Bastian");
    await settle();

    // In flight: a tab closed now would still find it on the next visit.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(
      JSON.parse(window.localStorage.getItem("shelvr.planVotePending.tok")!),
    ).toEqual({ choices: { p0: "pick" }, revision: sent.revision });

    await act(async () => {
      answer(new Response("{}", { status: 200 }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(
      window.localStorage.getItem("shelvr.planVotePending.tok"),
    ).toBeNull();
  });

  it("numbers the next ballot above the last saved one, even with the clock behind it", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const ahead = Date.now() + 60 * 60 * 1000;
    window.localStorage.setItem(
      "shelvr.planVote.tok",
      JSON.stringify({ choices: { p1: "pass" }, revision: ahead }),
    );
    render();
    expect(fetchMock).not.toHaveBeenCalled();
    tap("Yes to Bastian");
    await settle();

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).revision).toBe(
      ahead + 1,
    );
  });

  it("never lets an older answer replace a newer pending or saved ballot", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    render();
    tap("Yes to Bastian");
    await settle();
    const mine = JSON.parse(fetchMock.mock.calls[0][1].body).revision as number;
    // Another tab saved and then sent something newer meanwhile.
    const newer = { choices: { p1: "pick" }, revision: mine + 1_000_000 };
    window.localStorage.setItem("shelvr.planVote.tok", JSON.stringify(newer));
    window.localStorage.setItem(
      "shelvr.planVotePending.tok",
      JSON.stringify(newer),
    );
    tap("Yes to Masque");
    await settle();

    expect(
      JSON.parse(window.localStorage.getItem("shelvr.planVote.tok")!),
    ).toMatchObject({ revision: mine + 1_000_000 });
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
