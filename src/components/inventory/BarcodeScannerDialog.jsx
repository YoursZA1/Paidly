import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, CameraOff } from "lucide-react";
import { displayPosBarcode } from "@/lib/pos/posBarcode";

const DEFAULT_FORMATS = [
  "ean_13",
  "ean_8",
  "code_128",
  "code_39",
  "upc_a",
  "upc_e",
  "qr_code",
];

/**
 * Camera barcode scanner dialog.
 * Camera permission is requested only when this dialog opens — never on POS mount.
 */
export default function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
  title = "Scan Barcode",
  formats = DEFAULT_FORMATS,
  continuous = false,
  onContinuousChange,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const stopFnRef = useRef(null);
  const lastCodeRef = useRef({ code: "", at: 0 });
  const continuousRef = useRef(continuous);

  const [error, setError] = useState("");
  const [active, setActive] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);

  const canUseBarcodeDetector = useMemo(() => {
    return typeof window !== "undefined" && "BarcodeDetector" in window;
  }, []);

  useEffect(() => {
    if (!open) return;
    setError("");
    setActive(false);
    setManual("");
    lastCodeRef.current = { code: "", at: 0 };
  }, [open]);

  const emitCode = (raw) => {
    const code = displayPosBarcode(raw);
    if (!code) return false;
    const now = Date.now();
    if (code === lastCodeRef.current.code && now - lastCodeRef.current.at < 900) return false;
    lastCodeRef.current = { code, at: now };
    onDetected?.(code);
    return true;
  };

  const stop = async () => {
    setActive(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (typeof stopFnRef.current === "function") {
      try {
        await stopFnRef.current();
      } catch {
        // ignore
      }
    }
    stopFnRef.current = null;

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
    }
    const v = videoRef.current;
    if (v) {
      try {
        v.srcObject = null;
      } catch {
        // ignore
      }
    }
  };

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) throw new Error("Video element not ready");
      v.srcObject = stream;
      await v.play();

      const handleHit = (code) => {
        const ok = emitCode(code);
        if (ok && !continuousRef.current) {
          onOpenChange(false);
        }
      };

      if (canUseBarcodeDetector) {
        const detector = new window.BarcodeDetector({ formats });
        const tick = async () => {
          if (!videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            const code = barcodes?.[0]?.rawValue;
            if (code) {
              handleHit(String(code));
              if (!continuousRef.current) return;
            }
          } catch {
            // keep scanning
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        stopFnRef.current = null;
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        stopFnRef.current = async () => {
          try {
            reader.reset();
          } catch {
            // ignore
          }
        };
        reader.decodeFromVideoElement(videoRef.current, (result) => {
          if (!result) return;
          const code = result.getText?.() || String(result);
          if (code) handleHit(String(code));
        });
      }

      setActive(true);
    } catch (e) {
      console.warn("BarcodeScannerDialog: start failed", e);
      setError(
        "Camera scanning is unavailable. Check browser permissions, or use a USB/Bluetooth barcode scanner."
      );
      await stop();
    }
  };

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    start();
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submitManual = (event) => {
    event?.preventDefault?.();
    const code = displayPosBarcode(manual);
    if (!code) return;
    const ok = emitCode(code);
    setManual("");
    if (ok && !continuousRef.current) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={async (next) => {
        if (!next) await stop();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {active ? <Camera className="w-4 h-4 text-primary" /> : <CameraOff className="w-4 h-4 text-muted-foreground" />}
            {title}
          </DialogTitle>
          <DialogDescription>Align the barcode inside the frame.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg border border-border bg-black">
            <video ref={videoRef} className="aspect-video w-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[42%] w-[72%] rounded-md border-2 border-primary/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">Align barcode inside the frame</p>

          {typeof onContinuousChange === "function" ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={continuous}
                onChange={(e) => onContinuousChange(e.target.checked)}
              />
              Keep scanning
            </label>
          ) : null}

          <form onSubmit={submitManual} className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Enter barcode"
              className="h-11 min-h-11"
              autoComplete="off"
              inputMode="text"
              aria-label="Enter barcode"
            />
            <Button type="submit" variant="outline" className="h-11 min-h-11 shrink-0">
              Add
            </Button>
          </form>

          {error ? (
            <div className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
