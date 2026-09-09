import { ImageResponse } from "next/og";
import { getLake, lakeSpeciesProfiles } from "@/lib/lakes";

export const alt = "Lake details";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Per-lake social card, so a shared link shows the actual water. */
export default async function Image({ params }: { params: Promise<{ wbic: string }> }) {
  const { wbic } = await params;
  const lake = getLake(Number(wbic));

  const title = lake?.name ?? "Wisconsin lakes";
  const species = lake ? lakeSpeciesProfiles(lake).slice(0, 5) : [];

  const facts = lake
    ? [
        `${lake.acres.toLocaleString()} acres`,
        lake.maxDepthFt ? `${lake.maxDepthFt} ft max depth` : null,
        lake.county ? `${lake.county} County` : null,
      ].filter(Boolean)
    : [];

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
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 2, color: "#38bdf8", textTransform: "uppercase" }}>
          Honey Hole · Wisconsin
        </div>
        <div style={{ display: "flex", fontSize: 78, fontWeight: 700, marginTop: 20, letterSpacing: -2 }}>
          {title}
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#93a4b8", marginTop: 16 }}>
          {facts.join("  ·  ")}
        </div>

        {species.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 44 }}>
            {species.map((s) => (
              <div
                key={s.key}
                style={{
                  display: "flex",
                  fontSize: 26,
                  padding: "10px 22px",
                  borderRadius: 999,
                  border: "1px solid #223046",
                  background: "rgba(56,189,248,0.08)",
                  color: "#e8eef5",
                }}
              >
                {s.profile.name}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", fontSize: 26, color: "#93a4b8", marginTop: 44 }}>
          Conditions, bite forecast and what to throw
        </div>
      </div>
    ),
    size,
  );
}
