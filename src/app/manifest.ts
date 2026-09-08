import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sonar — Wisconsin fishing intelligence",
    short_name: "Sonar",
    description:
      "Species, regulations, conditions and bait suggestions for Wisconsin lakes.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a1018",
    theme_color: "#0a1018",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
