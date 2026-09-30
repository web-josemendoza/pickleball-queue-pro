import JoinQrCode from "./JoinQrCode";
import { getJoinUrl, useJoinQrDataUrl } from "../hooks/useJoinQr";

type JoinQrModalProps = {
  onClose: () => void;
};

// Large print size for posting at the courts.
const PRINT_PIXELS = 1200;

export default function JoinQrModal({ onClose }: JoinQrModalProps) {
  const printDataUrl = useJoinQrDataUrl(PRINT_PIXELS);
  const url = getJoinUrl();

  const handlePrint = () => {
    if (!printDataUrl) {
      return;
    }

    // A clean page with just the code, so the app behind
    // this window doesn't get printed too.
    const page = window.open("", "_blank");

    if (!page) {
      alert("Allow pop-ups for this site to print the QR code.");
      return;
    }

    page.document.write(`<!doctype html>
<html><head><title>Scan to join open play</title>
<style>
  body { font-family: system-ui, sans-serif; text-align: center; margin: 48px; color: #020617; }
  h1 { font-size: 44px; margin: 0 0 8px; }
  p { font-size: 22px; margin: 0 0 32px; }
  img { width: 460px; height: 460px; }
  .url { font-size: 18px; color: #475569; margin-top: 24px; }
</style></head>
<body>
  <h1>Pickleball Open Play</h1>
  <p>Scan with your phone camera to join the queue</p>
  <img src="${printDataUrl}" alt="QR code" />
  <div class="url">${url}</div>
  <script>window.onload = () => { window.print(); };</script>
</body></html>`);
    page.document.close();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center text-slate-950 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
          Share the app
        </p>

        <h2 className="mt-1 text-2xl font-black">Scan to join</h2>

        <p className="mt-2 text-sm text-slate-500">
          Players point their phone camera here to open the
          app and join the queue.
        </p>

        <JoinQrCode
          size={260}
          className="mx-auto mt-5 ring-1 ring-slate-200"
        />

        <p className="mt-3 break-all text-sm font-bold text-slate-600">
          {url}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!printDataUrl}
            onClick={handlePrint}
            className="rounded-xl bg-slate-950 px-4 py-3 font-black text-white hover:bg-slate-800 disabled:opacity-50"
          >
            PRINT
          </button>

          <a
            href={printDataUrl ?? undefined}
            download="pickleball-join-qr.png"
            aria-disabled={!printDataUrl}
            className="rounded-xl border border-slate-300 px-4 py-3 font-black text-slate-700 hover:bg-slate-50"
          >
            DOWNLOAD
          </a>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl px-4 py-3 font-bold text-slate-500 hover:bg-slate-100"
        >
          Close
        </button>
      </div>
    </div>
  );
}
