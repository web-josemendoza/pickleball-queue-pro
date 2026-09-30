import { getJoinUrl, useJoinQrDataUrl } from "../hooks/useJoinQr";

type JoinQrCodeProps = {
  // Displayed size in CSS pixels; drawn at 2x for sharpness.
  size: number;
  className?: string;
};

export default function JoinQrCode({
  size,
  className = "",
}: JoinQrCodeProps) {
  const dataUrl = useJoinQrDataUrl(size * 2);

  return (
    <div
      className={`overflow-hidden rounded-xl bg-white ${className}`}
      style={{ width: size, height: size }}
    >
      {dataUrl && (
        <img
          src={dataUrl}
          width={size}
          height={size}
          alt={`QR code to open ${getJoinUrl()}`}
        />
      )}
    </div>
  );
}
