// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  takeSheetTurn,
  useHoldSheetTurns,
  useSheetTurn,
  useSheetTurnsBusy,
} from "./one-time-sheets";

const mock = vi.hoisted(() => ({ settle: [] as (() => void)[] }));
vi.mock("@/lib/entitlement", () => ({
  whenSheetSettled: () =>
    new Promise<void>((resolve) => {
      mock.settle.push(resolve);
    }),
}));

async function settleSheets() {
  await act(async () => {
    for (const resolve of mock.settle.splice(0)) resolve();
  });
}

function wanting(sheet: "letter" | "name", wants = true) {
  return renderHook(({ wants }) => useSheetTurn(sheet, wants), {
    initialProps: { wants },
  });
}

beforeEach(async () => {
  await settleSheets();
});

it("lets one sheet up at a time, primer then letter then name, each after the last has slid away", async () => {
  const name = wanting("name");
  const letter = wanting("letter");
  const primer = takeSheetTurn("primer");
  let primerUp = false;
  void primer.granted.then(() => {
    primerUp = true;
  });
  await settleSheets();
  expect([primerUp, letter.result.current, name.result.current]).toEqual([
    true,
    false,
    false,
  ]);

  act(() => primer.end());
  expect(letter.result.current).toBe(false);
  await settleSheets();
  expect([letter.result.current, name.result.current]).toEqual([true, false]);

  letter.rerender({ wants: false });
  expect(name.result.current).toBe(false);
  await settleSheets();
  expect(name.result.current).toBe(true);
});

it("never opens a sheet over one that is already up", async () => {
  const name = wanting("name");
  await settleSheets();
  expect(name.result.current).toBe(true);

  const primer = takeSheetTurn("primer");
  let primerUp = false;
  void primer.granted.then(() => {
    primerUp = true;
  });
  await settleSheets();
  expect(primerUp).toBe(false);
  expect(name.result.current).toBe(true);

  name.rerender({ wants: false });
  await settleSheets();
  expect(primerUp).toBe(true);
  act(() => primer.end());
});

it("picks who goes next once the settle wait ends, so a sheet that asks during it can still go first", async () => {
  const name = wanting("name");
  const letter = wanting("letter");
  await settleSheets();
  expect([letter.result.current, name.result.current]).toEqual([true, false]);
});

it("lets a sheet that stops waiting leave the line, so it holds nothing back", async () => {
  const busy = renderHook(() => useSheetTurnsBusy());
  const letter = wanting("letter");
  expect(busy.result.current).toBe(true);

  letter.rerender({ wants: false });
  expect(busy.result.current).toBe(false);
  const name = wanting("name");
  await settleSheets();
  expect(name.result.current).toBe(true);

  name.unmount();
  expect(busy.result.current).toBe(false);
});

it("keeps every sheet waiting while the feedback form is open", async () => {
  const form = renderHook(({ open }) => useHoldSheetTurns(open), {
    initialProps: { open: true },
  });
  const busy = renderHook(() => useSheetTurnsBusy());
  const letter = wanting("letter");
  await settleSheets();
  expect(letter.result.current).toBe(false);
  expect(busy.result.current).toBe(true);

  form.rerender({ open: false });
  await settleSheets();
  expect(letter.result.current).toBe(true);
});
