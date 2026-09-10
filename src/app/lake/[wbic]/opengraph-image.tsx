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
          background: "linear-gradient(140deg, #16302f 0%, #0b100d 58%)",
          color: "#ecefe8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 2, color: "#d9a441", textTransform: "uppercase" }}>
          Honey Hole · Wisconsin
        </div>
        <div style={{ display: "flex", fontSize: 78, fontWeight: 700, marginTop: 20, letterSpacing: -2 }}>
          {title}
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#98a599", marginTop: 16 }}>
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
                  border: "1px solid #2a352c",
                  background: "rgba(217,164,65,0.10)",
                  color: "#ecefe8",
                }}
              >
                {s.profile.name}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", fontSize: 26, color: "#98a599", marginTop: 44 }}>
          Conditions, bite forecast and what to throw
        </div>
      </div>
    ),
    size,
  );
}
