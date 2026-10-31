import { beforeEach, expect, it, vi } from "vitest";
import { useFixSave } from "./fix-save";

const mock = vi.hoisted(() => ({
  reprocess: vi.fn(),
  deleteItem: vi.fn(),
  success: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: (name: string) =>
    name === "reprocessItem" ? mock.reprocess : mock.deleteItem,
}));
vi.mock("@convex/_generated/api", () => ({
  api: { items: { reprocessItem: "reprocessItem", deleteItem: "deleteItem" } },
}));
vi.mock("react-native", () => ({ Alert: { alert: mock.alert } }));
vi.mock("@/lib/analytics", () => ({ analytics: { itemDeleted: vi.fn() } }));
vi.mock("@/lib/confirm-item-delete", () => ({
  confirmItemDelete: (onConfirm: () => Promise<void>) => onConfirm(),
}));
vi.mock("@/lib/entitlement", () => ({
  usePaywallGuard: () => ({ guard: vi.fn(async () => true) }),
}));
vi.mock("@/lib/haptics", () => ({ haptics: { success: mock.success } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));

const save = { _id: "item1", type: "link" } as Parameters<
  ReturnType<typeof useFixSave>["retry"]
>[0];

beforeEach(() => vi.clearAllMocks());

it("confirms a retry only once the server scheduled it", async () => {
  mock.reprocess.mockResolvedValueOnce(true);
  await useFixSave().retry(save);
  expect(mock.success).toHaveBeenCalledOnce();
  expect(mock.alert).not.toHaveBeenCalled();
});

it("stays quiet and explains when a retry is not scheduled or fails", async () => {
  mock.reprocess.mockResolvedValueOnce(false);
  await useFixSave().retry(save);
  mock.reprocess.mockRejectedValueOnce(new Error("offline"));
  await useFixSave().retry(save);
  expect(mock.success).not.toHaveBeenCalled();
  expect(mock.alert).toHaveBeenCalledTimes(2);
});

it("confirms a delete only after it succeeds", async () => {
  mock.deleteItem.mockResolvedValueOnce(null);
  const onDeleted = vi.fn();
  useFixSave().remove(save, onDeleted);
  await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  expect(mock.success).toHaveBeenCalledOnce();

  mock.success.mockClear();
  mock.alert.mockClear();
  mock.deleteItem.mockRejectedValueOnce(new Error("offline"));
  useFixSave().remove(save);
  await vi.waitFor(() => expect(mock.alert).toHaveBeenCalledOnce());
  expect(mock.success).not.toHaveBeenCalled();
});
