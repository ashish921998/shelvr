// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlanVote from "./PlanVote";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ captureWebAnalyticsEvent: capture }));

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
  capture.mockReset();
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
  vi.restoreAllMocks();
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
      "Saved. Ashish will see your picks in the app.",
    );
    expect(
      JSON.parse(window.localStorage.getItem("shelvr.planVote.tok")!),
    ).toMatchObject({ choices: { p0: "pick", p1: "pass" } });
  });

  it("keeps a second tap made while the first vote is saving", async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (answer = resolve)),
      )
      .mockResolvedValue(new Response("{}", { status: 200 }));
    render();
    tap("Yes to Bastian");
    await settle();
    tap("Yes to Masque");
    await act(async () => {
      answer(new Response("{}", { status: 200 }));
    });
    expect(container.textContent).not.toContain("Saved.");
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      picks: ["p0", "p1"],
    });
    expect(container.textContent).toContain("Saved. Ashish will see");
  });

  it("sends a vote waiting behind a slow one when the page closes, once", async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (answer = resolve)),
      )
      .mockResolvedValue(new Response("{}", { status: 200 }));
    render();
    tap("Yes to Bastian");
    await settle();
    tap("Yes to Masque");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ keepalive: true });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      picks: ["p0", "p1"],
    });
    await act(async () => {
      answer(new Response("{}", { status: 200 }));
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says they will see the picks when the sender has no name", () => {
    act(() => root.render(<PlanVote token="tok" places={places} />));
    expect(container.textContent).toContain(
      "They will see your picks in the app.",
    );
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
    ).toEqual({ choices: { p0: "pick", p1: "pass" }, revision: 7 });
    expect(
      window.localStorage.getItem("shelvr.planVotePending.tok"),
    ).toBeNull();

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

describe("PlanVote name", () => {
  const nameKey = "shelvr.planVoterName.tok";

  function input() {
    return container.querySelector<HTMLInputElement>("#plan-voter-name")!;
  }

  function type(value: string) {
    const field = input();
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      field.focus();
      setValue.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function blur() {
    await act(async () => {
      input().blur();
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  async function wait(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  const body = (call: number) =>
    JSON.parse(fetchMock.mock.calls[call][1].body) as Record<string, unknown>;

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  it("asks for an optional first name and says who sees it", () => {
    render();
    const label = container.querySelector("label")!;
    expect(label.textContent).toBe("Your first name (optional)");
    expect(label.htmlFor).toBe("plan-voter-name");
    expect(input().value).toBe("");
    expect(input().placeholder).toBe("First name");
    expect(input().autocomplete).toBe("given-name");
    expect(input().maxLength).toBe(40);
    expect(container.textContent).toContain(
      "Shown to Ashish next to your votes.",
    );
    const help = input().getAttribute("aria-describedby");
    expect(help && document.getElementById(help)?.textContent).toBe(
      "Shown to Ashish next to your votes.",
    );

    act(() => root.render(<PlanVote token="tok" places={places} />));
    expect(container.textContent).toContain(
      "Shown to them next to your votes.",
    );
  });

  it("fills in the name kept for this link", () => {
    window.localStorage.setItem(nameKey, JSON.stringify("Maya"));
    render();
    expect(input().value).toBe("Maya");
  });

  it("starts empty on another link and sends no name with the first tap", async () => {
    window.localStorage.setItem(
      "shelvr.planVoterName.other",
      JSON.stringify("Maya"),
    );
    render();
    expect(input().value).toBe("");
    tap("Yes to Bastian");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body(0)).not.toHaveProperty("name");
  });

  it("sends nothing for a name typed before any vote, then sends it with the first tap", async () => {
    render();
    type("Maya");
    await wait(2000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(nameKey)!)).toBe("Maya");

    tap("Yes to Bastian");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body(0)).toMatchObject({ name: "Maya", picks: ["p0"] });
  });

  it("resends the same choices with a higher revision once a new name settles, and at once on blur", async () => {
    render();
    tap("Yes to Bastian");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    type("Maya");
    await wait(700);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Saved.");
    await wait(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body(1)).toMatchObject({ name: "Maya", picks: ["p0"], passes: [] });
    expect(body(1).revision as number).toBeGreaterThan(
      body(0).revision as number,
    );
    expect(container.textContent).toContain("Saved. Ashish will see");

    type("Maya Lopez ");
    await blur();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(body(2)).toMatchObject({ name: "Maya Lopez", picks: ["p0"] });
    expect(body(2).revision as number).toBeGreaterThan(
      body(1).revision as number,
    );
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends a cleared name as empty, and keeps it cleared", async () => {
    window.localStorage.setItem(nameKey, JSON.stringify("Maya"));
    render();
    tap("Yes to Bastian");
    await settle();
    expect(body(0)).toMatchObject({ name: "Maya" });

    type("");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body(1)).toMatchObject({ name: "", picks: ["p0"] });
    expect(JSON.parse(window.localStorage.getItem(nameKey)!)).toBe("");
  });

  it("sends one ballot with the name when the page closes before it settles", async () => {
    render();
    tap("Yes to Bastian");
    await settle();
    type("Mia");
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body(1)).toMatchObject({ name: "Mia", picks: ["p0"] });
    await wait(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resends a ballot left by the last visit with this link's name", async () => {
    window.localStorage.setItem(nameKey, JSON.stringify("Maya"));
    window.localStorage.setItem(
      "shelvr.planVotePending.tok",
      JSON.stringify({ choices: { p0: "pick" }, revision: 7 }),
    );
    render();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body(0)).toMatchObject({ name: "Maya", revision: 7 });
  });

  it("reports the first name once, saying whether a vote came first", async () => {
    render();
    type(" ");
    expect(capture).not.toHaveBeenCalled();
    type("M");
    type("Ma");
    expect(capture.mock.calls).toEqual([
      ["plan_vote_named", { with_votes: false }],
    ]);

    act(() => root.unmount());
    root = createRoot(container);
    capture.mockReset();
    render();
    tap("Yes to Bastian");
    type("Sam");
    expect(capture.mock.calls).toEqual([
      ["plan_vote_named", { with_votes: true }],
    ]);
  });

  it("still sends the name when the browser refuses storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => window.localStorage.getItem(nameKey)).toThrow("blocked");
    render();
    type("Maya");
    tap("Yes to Bastian");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body(0)).toMatchObject({ name: "Maya", picks: ["p0"] });
  });
});
