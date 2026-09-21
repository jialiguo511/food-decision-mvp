import { renderAppIcon } from "@/lib/appIcon";

// 180x180 is Apple's recommended apple-touch-icon size for current iPhones;
// Safari scales it down for older/smaller devices.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderAppIcon(size.width);
}
