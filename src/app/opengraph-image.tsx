import { ImageResponse } from "next/og";
import { totalLakes } from "@/lib/lakes";

export const alt = "Honey Hole — Wisconsin lake and fishing intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview card for the site root. */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #16273a 0%, #0a1018 55%)",
          color: "#e8eef5",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#38bdf8" }}>
          <div style={{ display: "flex", fontSize: 30, letterSpacing: 2, textTransform: "uppercase" }}>
            Honey Hole · Wisconsin
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 82,
            fontWeight: 700,
            marginTop: 24,
            letterSpacing: -2,
          }}
        >
          Know the water before you go.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            color: "#93a4b8",
            marginTop: 28,
            maxWidth: 900,
          }}
        >
          {`Species, regulations, live conditions and bait suggestions for ${totalLakes().toLocaleString()} Wisconsin lakes.`}
        </div>
        <div style={{ display: "flex", gap: 40, marginTop: 48, fontSize: 26, color: "#93a4b8" }}>
          <div style={{ display: "flex" }}>Built on open Wisconsin DNR data</div>
        </div>
      </div>
    ),
    size,
  );
}
