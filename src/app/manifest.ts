import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Honey Hole — Wisconsin fishing intelligence",
    short_name: "Honey Hole",
    description:
      "Species, regulations, conditions and bait suggestions for Wisconsin lakes.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b100d",
    theme_color: "#0b100d",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
