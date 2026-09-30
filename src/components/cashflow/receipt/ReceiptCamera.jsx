import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Live camera capture for receipts. Falls back to the device's own camera app (file input with
 * capture="environment") when the browser can't open the camera or permission is refused.
 *
 * @param {{ onCapture: (file: File) => void, onCancel: () => void }} props
 */
export default function ReceiptCamera({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fallbackInputRef = useRef(null);
  const [status, setStatus] = useState("starting"); // starting | live | captured | unavailable
  const [still, setStill] = useState(null); // { file, url }
  const [message, setMessage] = useState("");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async () => {
    setStatus("starting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      setMessage("This browser can't open the camera here.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      setStatus("live");
    } catch (err) {
      setStatus("unavailable");
      setMessage(
        err?.name === "NotAllowedError"
          ? "Camera access was blocked. Allow camera access in your browser settings, or use your phone's camera below."
          : "We couldn't open the camera."
      );
    }
  }, []);

  useEffect(() => {
    void startStream();
    return () => stopStream();
  }, [startStream, stopStream]);

  useEffect(() => () => still?.url && URL.revokeObjectURL(still.url), [still]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
        setStill({ file, url: URL.createObjectURL(blob) });
        setStatus("captured");
        stopStream();
      },
      "image/jpeg",
      0.92
    );
  }, [stopStream]);

  const retake = useCallback(() => {
    setStill(null);
    void startStream();
  }, [startStream]);

  const usePhoto = useCallback(() => {
    if (still?.file) onCapture(still.file);
  }, [onCapture, still]);

  const cancel = useCallback(() => {
    stopStream();
    onCancel();
  }, [onCancel, stopStream]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="relative flex min-h-[18rem] flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
        {status === "captured" && still ? (
          <img src={still.url} alt="Captured receipt" className="max-h-full max-w-full object-contain" />
        ) : (
          <video
            ref={videoRef}
            className={`h-full w-full object-cover ${status === "live" ? "" : "invisible"}`}
            playsInline
            muted
            autoPlay
            aria-label="Camera preview"
          />
        )}

        {status === "live" ? (
          <>
            {/* Framing guide */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-[12%] inset-y-[8%] rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            <p className="pointer-events-none absolute inset-x-0 top-3 text-center text-sm font-medium text-white drop-shadow">
              Fit the whole receipt inside the frame
            </p>
          </>
        ) : null}

        {status === "starting" ? <p className="absolute text-sm text-white/80">Opening camera…</p> : null}

        {status === "unavailable" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-muted p-6 text-center">
            <Camera className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="max-w-xs text-sm text-foreground" role="alert">
              {message}
            </p>
            <Button type="button" size="lg" className="min-h-12 gap-2" onClick={() => fallbackInputRef.current?.click()}>
              <Camera className="h-5 w-5" aria-hidden="true" />
              Take photo with camera app
            </Button>
            <input
              ref={fallbackInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onCapture(file);
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-3 items-center gap-3 pb-[env(safe-area-inset-bottom)]">
        <Button type="button" variant="ghost" className="min-h-12 justify-self-start gap-2" onClick={cancel}>
          <X className="h-5 w-5" aria-hidden="true" />
          Cancel
        </Button>
        {status === "captured" ? (
          <>
            <Button type="button" variant="outline" className="min-h-12 gap-2" onClick={retake}>
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              Retake
            </Button>
            <Button type="button" className="min-h-12 justify-self-end gap-2" onClick={usePhoto} autoFocus>
              <Check className="h-5 w-5" aria-hidden="true" />
              Use photo
            </Button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={capture}
              disabled={status !== "live"}
              aria-label="Capture receipt photo"
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary bg-background shadow-md transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 disabled:opacity-40"
            >
              <span className="h-11 w-11 rounded-full bg-primary" />
            </button>
            <span />
          </>
        )}
      </div>
    </div>
  );
}
