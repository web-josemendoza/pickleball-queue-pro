import { useEffect, useState } from "react";

// The app's own address (without ?view=tv), so the code
// is right wherever the app is published.
export function getJoinUrl(): string {
  return `${window.location.origin}/`;
}

/*
 * Draws a QR code as an image. Resolves to a PNG data URL
 * so the same image can be shown, printed or downloaded.
 */
export function useJoinQrDataUrl(pixels: number) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Loaded on demand: most screens never show a code.
    void import("qrcode")
      .then(({ toDataURL }) =>
        toDataURL(getJoinUrl(), {
          width: pixels,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#020617", light: "#ffffff" },
        })
      )
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      })
      .catch((error) => {
        console.error("Unable to draw QR code:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [pixels]);

  return dataUrl;
}
