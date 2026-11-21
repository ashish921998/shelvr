"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { bubbleLayout, fitWithin, pickMimeType } from "@/lib/recording";
import { formatTime } from "@/lib/time";
import { useUpload } from "@/lib/useUpload";
import { ProgressBar } from "./UploadVideo";

type Props = {
  versionId: Id<"versions">;
  campaignId: Id<"campaigns">;
  currentTime: number;
  onStart: () => void;
};

type Session = {
  recorder: MediaRecorder | null;
  streams: MediaStream[];
  stopDrawing: () => void;
  audio: AudioContext | null;
};

async function openCamera(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: 480, height: 480, facingMode: "user" },
      audio: true,
    });
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return null;
    }
  }
}

function playHidden(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  void video.play();
  return video;
}

function composite(screen: MediaStream, camera: MediaStream | null) {
  const screenVideo = playHidden(screen);
  const cameraVideo =
    camera && camera.getVideoTracks().length > 0 ? playHidden(camera) : null;
  const settings = screen.getVideoTracks()[0]?.getSettings() ?? {};
  const { width, height } = fitWithin(
    settings.width ?? 1280,
    settings.height ?? 720,
    1920,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const bubble = bubbleLayout(width, height);
  const draw = () => {
    context.drawImage(screenVideo, 0, 0, width, height);
    if (cameraVideo && cameraVideo.videoWidth > 0) {
      const side = Math.min(cameraVideo.videoWidth, cameraVideo.videoHeight);
      context.save();
      context.beginPath();
      context.arc(
        bubble.x + bubble.size / 2,
        bubble.y + bubble.size / 2,
        bubble.size / 2,
        0,
        Math.PI * 2,
      );
      context.clip();
      context.drawImage(
        cameraVideo,
        (cameraVideo.videoWidth - side) / 2,
        (cameraVideo.videoHeight - side) / 2,
        side,
        side,
        bubble.x,
        bubble.y,
        bubble.size,
        bubble.size,
      );
      context.restore();
    }
  };
  const timer = window.setInterval(draw, 1000 / 30);
  return {
    stream: canvas.captureStream(30),
    stop: () => window.clearInterval(timer),
  };
}

function mixAudio(sources: MediaStream[]) {
  const withAudio = sources.filter((s) => s.getAudioTracks().length > 0);
  if (withAudio.length === 0) return { tracks: [], context: null };
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  for (const source of withAudio) {
    context.createMediaStreamSource(source).connect(destination);
  }
  return { tracks: destination.stream.getAudioTracks(), context };
}

export default function Recorder({
  versionId,
  campaignId,
  currentTime,
  onStart,
}: Props) {
  const add = useMutation(api.comments.add);
  const { uploadNew, progress, error: uploadError, busy } = useUpload();
  const [phase, setPhase] = useState<
    "idle" | "starting" | "recording" | "review"
  >("idle");
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [moment, setMoment] = useState(0);
  const [clip, setClip] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(
      () => setElapsed((Date.now() - startedAt) / 1000),
      250,
    );
    return () => window.clearInterval(timer);
  }, [phase, startedAt]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const current = session.current;
      const recorder = current?.recorder;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      cleanup();
    };
  }, []);

  function cleanup() {
    const current = session.current;
    if (!current) return;
    current.stopDrawing();
    for (const stream of current.streams) {
      for (const track of stream.getTracks()) track.stop();
    }
    void current.audio?.close();
    session.current = null;
  }

  function begin(screen: MediaStream, camera: MediaStream | null) {
    const { stream: video, stop } = composite(screen, camera);
    const { tracks, context } = mixAudio(camera ? [screen, camera] : [screen]);
    session.current = {
      recorder: null,
      streams: camera ? [screen, camera, video] : [screen, video],
      stopDrawing: stop,
      audio: context,
    };
    const mimeType = pickMimeType((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const recorder = new MediaRecorder(
      new MediaStream([...video.getVideoTracks(), ...tracks]),
      mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : undefined,
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      cleanup();
      const blob = new Blob(chunks, {
        type: recorder.mimeType || "video/webm",
      });
      setClip(blob);
      setPreview(URL.createObjectURL(blob));
      setPhase("review");
    };
    screen.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (recorder.state !== "inactive") recorder.stop();
    });
    session.current.recorder = recorder;
    recorder.start(1000);
  }

  async function start() {
    if (phase !== "idle") return;
    setPhase("starting");
    setError(null);
    onStart();
    setMoment(currentTime);
    let screen: MediaStream;
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions);
    } catch {
      setError("Screen sharing was cancelled.");
      setPhase("idle");
      return;
    }
    session.current = {
      recorder: null,
      streams: [screen],
      stopDrawing: () => {},
      audio: null,
    };
    const camera = await openCamera();
    if (!alive.current) {
      for (const stream of camera ? [screen, camera] : [screen]) {
        for (const track of stream.getTracks()) track.stop();
      }
      return;
    }
    if (screen.getVideoTracks()[0]?.readyState !== "live") {
      for (const stream of camera ? [screen, camera] : [screen]) {
        for (const track of stream.getTracks()) track.stop();
      }
      session.current = null;
      setError("Screen sharing stopped before recording started.");
      setPhase("idle");
      return;
    }
    try {
      begin(screen, camera);
    } catch {
      for (const stream of camera ? [screen, camera] : [screen]) {
        for (const track of stream.getTracks()) track.stop();
      }
      cleanup();
      setError("This browser couldn't start recording.");
      setPhase("idle");
      return;
    }
    setStartedAt(Date.now());
    setElapsed(0);
    setPhase("recording");
  }

  function stopRecording() {
    const recorder = session.current?.recorder;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function discard() {
    setClip(null);
    setPreview(null);
    setNote("");
    setPhase("idle");
  }

  async function post() {
    if (!clip) return;
    const posted = await uploadNew(
      campaignId,
      clip,
      async (mediaId) => {
        await add({ versionId, body: note, timestamp: moment, mediaId });
      },
      { duration: elapsed },
    );
    if (posted) discard();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        disabled={phase !== "idle"}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-pink-300 ring-1 ring-inset ring-pink-400/30 hover:bg-pink-400/10 disabled:opacity-40"
        title="Record your screen and camera, pinned to this moment"
      >
        <span className="h-2 w-2 rounded-full bg-pink-400" />
        Record
      </button>
      {error && <span className="text-xs text-rose-300">{error}</span>}
      {phase === "recording" && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-4 py-2 text-sm shadow-2xl ring-1 ring-white/10">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
          <span className="tabular-nums">{formatTime(elapsed)}</span>
          <span className="text-zinc-500">at {formatTime(moment)}</span>
          <button
            type="button"
            onClick={stopRecording}
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-black"
          >
            Stop
          </button>
        </div>
      )}
      {phase === "review" && preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-2xl space-y-3 rounded-2xl bg-zinc-900 p-5 ring-1 ring-white/10">
            <h3 className="font-medium">
              Your recording, pinned at {formatTime(moment)}
            </h3>
            <video
              src={preview}
              controls
              className="w-full rounded-lg bg-black"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-orange-400"
            />
            <div className="flex items-center justify-end gap-2">
              {busy ? (
                <ProgressBar value={progress ?? 0} />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={discard}
                    className="px-3 py-1.5 text-sm text-zinc-400"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => void post()}
                    className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black"
                  >
                    Post recording
                  </button>
                </>
              )}
            </div>
            {uploadError && (
              <p className="text-sm text-rose-300">{uploadError}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
