import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, CameraOff } from "lucide-react";

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
 *
 * - Uses native BarcodeDetector when available.
 * - Falls back to @zxing/browser when not.
 *
 * Props:
 * - open, onOpenChange
 * - onDetected(code: string)
 * - title
 * - formats (optional)
 */
export default function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
  title = "Scan Barcode",
  formats = DEFAULT_FORMATS,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const stopFnRef = useRef(null);

  const [error, setError] = useState("");
  const [active, setActive] = useState(false);

  const canUseBarcodeDetector = useMemo(() => {
    return typeof window !== "undefined" && "BarcodeDetector" in window;
  }, []);

  useEffect(() => {
    if (!open) return;
    setError("");
    setActive(false);
  }, [open]);

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

      if (canUseBarcodeDetector) {
        const detector = new window.BarcodeDetector({ formats });
        const tick = async () => {
          if (!videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            const code = barcodes?.[0]?.rawValue;
            if (code) {
              onDetected?.(String(code));
              onOpenChange(false);
              return;
            }
          } catch {
            // ignore detect errors and keep scanning
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        stopFnRef.current = null;
      } else {
        // ZXing fallback
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
          if (result) {
            const code = result.getText?.() || String(result);
            if (code) {
              onDetected?.(String(code));
              onOpenChange(false);
            }
          }
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
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-2xl overflow-hidden border border-border bg-muted/30">
            <video ref={videoRef} className="w-full aspect-video object-cover" playsInline muted />
          </div>

          <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
            <span>Tip:</span>
            <Badge variant="secondary">Hold steady</Badge>
            <Badge variant="secondary">Good lighting</Badge>
            <Badge variant="secondary">Fill the frame</Badge>
          </div>

          {error ? (
            <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
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

