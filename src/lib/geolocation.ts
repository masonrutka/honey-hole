/**
 * Turning a GeolocationPositionError into advice someone can act on.
 *
 * Shared because the home page and the species pages both ask for a location,
 * and the useful part is the same in both: a desktop has no GPS. It positions
 * from Wi-Fi, which the operating system gates separately from the browser, so
 * on macOS a blocked lookup arrives as PERMISSION_DENIED even when the site's
 * own permission is granted. Pointing only at browser settings sends people
 * hunting in the wrong place.
 */

export function isDesktop(): boolean {
  if (typeof navigator === "undefined") return false;
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Why geolocation is unavailable before it is even attempted, or null. */
export function geolocationBlocker(): string | null {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return "This browser cannot share your location.";
  }
  // Browsers refuse geolocation outside a secure context. localhost counts as
  // secure; a LAN IP over plain http does not.
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Location needs a secure connection. Open this over https — it works on the deployed site.";
  }
  return null;
}

export function geolocationMessage(err: GeolocationPositionError): string {
  const desktop = isDesktop();

  if (err.code === err.PERMISSION_DENIED) {
    return (
      "Location permission was denied. Allow it for this site in your browser." +
      (desktop
        ? " On a Mac, also check System Settings → Privacy & Security → Location Services is on for your browser."
        : "")
    );
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return (
      "Your location could not be determined." +
      (desktop
        ? " Desktops locate by Wi-Fi rather than GPS, so this often fails on a wired or VPN connection."
        : "") +
      " Searching by name works either way."
    );
  }
  return "Locating timed out. Try again, or search by name.";
}
