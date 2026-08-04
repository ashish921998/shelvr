"use client";

import { Fragment, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useMutation } from "convex/react";

type ItemType = "link" | "note";

export default function CreateItem() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ItemType>("link");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const cancelButtonRef = useRef(null);
  const createItem = useMutation(api.items.createItem);

  const onCreate = async () => {
    setSaving(true);
    try {
      if (type === "link") {
        if (!url.trim()) return;
        await createItem({ type: "link", url: url.trim() });
      } else {
        if (!note.trim()) return;
        await createItem({ type: "note", note: note.trim() });
      }
      setUrl("");
      setNote("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex justify-center items-center">
        <button
          onClick={() => setOpen(true)}
          className="button text-white flex gap-3 justify-center items-center text-center px-8 sm:px-12 py-3 rounded-xl"
        >
          <span className="text-lg sm:text-xl font-medium">Save something</span>
        </button>
      </div>

      <Transition.Root show={open} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          initialFocus={cancelButtonRef}
          onClose={setOpen}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-2 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-[560px]">
                  <div className="bg-white px-5 pb-4 pt-6 sm:p-8">
                    <Dialog.Title className="text-[#2A2118] text-2xl font-semibold tracking-tight mb-6">
                      Save something
                    </Dialog.Title>

                    <div className="flex gap-2 mb-5">
                      {(["link", "note"] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setType(value)}
                          className={`px-4 py-2 rounded-full text-sm font-medium capitalize ${
                            type === value
                              ? "bg-[#C47B2C] text-white"
                              : "bg-[#F3E3D0] text-[#8A4F12]"
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>

                    {type === "link" ? (
                      <div className="space-y-2">
                        <label className="text-[#2A2118] font-medium">URL</label>
                        <input
                          type="url"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          placeholder="https://…"
                          className="w-full rounded-xl border border-[#D0D5DD] px-3.5 py-2.5 text-[#2A2118]"
                        />
                        <p className="text-sm text-[#9A7B5C]">
                          Amber fetches the page, extracts the article, and
                          files it into spaces.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-[#2A2118] font-medium">Note</label>
                        <textarea
                          rows={7}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Capture a thought, quote, or reminder…"
                          className="w-full rounded-xl border border-[#D0D5DD] px-3.5 py-2.5 text-[#2A2118]"
                        />
                      </div>
                    )}
                  </div>
                  <div className="px-5 py-4 mb-2 flex justify-center">
                    <button
                      type="button"
                      className="button text-white text-lg font-semibold px-16 py-2.5 rounded-xl disabled:opacity-60"
                      onClick={onCreate}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
}
