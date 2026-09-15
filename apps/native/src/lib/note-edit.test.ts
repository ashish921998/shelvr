import { describe, expect, it, vi } from "vitest";
import { createNoteSaveQueue } from "@/lib/note-edit";

describe("note save queue", () => {
  it("does not write on an empty flush or repeat acknowledged edits", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const queue = createNoteSaveQueue(write, vi.fn());
    await queue.flush();
    expect(write).not.toHaveBeenCalled();
    queue.change({ title: "  Milk run  " });
    await queue.flush();
    await queue.flush();
    expect(write).toHaveBeenCalledExactlyOnceWith({ title: "Milk run" });
  });

  it("keeps blank text local until it is replaced with a valid edit", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const queue = createNoteSaveQueue(write, vi.fn());
    queue.change({ text: "   " });
    await queue.flush();
    expect(write).not.toHaveBeenCalled();
    queue.change({ text: "Buy milk" });
    await queue.flush();
    expect(write).toHaveBeenCalledExactlyOnceWith({ text: "Buy milk" });
  });

  it("retains failed fields and combines them with subsequent edits", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValue(undefined);
    const onError = vi.fn().mockResolvedValue(undefined);
    const queue = createNoteSaveQueue(write, onError);
    queue.change({ title: "" });
    await queue.flush();
    expect(onError).toHaveBeenCalledOnce();
    queue.change({ text: "Buy milk" });
    await queue.flush();
    expect(write).toHaveBeenLastCalledWith({ title: "", text: "Buy milk" });
  });

  it("saves a title while retaining blank text until a valid replacement", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const queue = createNoteSaveQueue(write, vi.fn());
    queue.change({ title: "  New title  ", text: " \n " });
    await queue.flush();
    expect(write).toHaveBeenCalledExactlyOnceWith({ title: "New title" });
    await queue.flush();
    expect(write).toHaveBeenCalledTimes(1);
    queue.change({ text: "Valid replacement" });
    await queue.flush();
    expect(write).toHaveBeenLastCalledWith({ text: "Valid replacement" });
  });

  it("retries a failed title without sending the retained blank text", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValue(undefined);
    const queue = createNoteSaveQueue(write, vi.fn());
    queue.change({ title: "", text: "   " });
    await queue.flush();
    await queue.flush();
    expect(write.mock.calls).toEqual([[{ title: "" }], [{ title: "" }]]);
    queue.change({ text: "Valid replacement" });
    await queue.flush();
    expect(write).toHaveBeenLastCalledWith({ text: "Valid replacement" });
  });
});
