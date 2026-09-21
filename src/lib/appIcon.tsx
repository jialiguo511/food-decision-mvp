// Shared icon design for icon.tsx and apple-icon.tsx — one place to change
// the look instead of two. Three dots for "exactly 3 recommendations," the
// product's core principle (see PRODUCT.md).

import { ImageResponse } from "next/og";

export function renderAppIcon(size: number) {
  const dot = Math.round(size * 0.16);
  const gap = Math.round(size * 0.1);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e2703a",
        }}
      >
        <div style={{ display: "flex", gap }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: dot,
                height: dot,
                borderRadius: "50%",
                background: "#fff",
              }}
            />
          ))}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
