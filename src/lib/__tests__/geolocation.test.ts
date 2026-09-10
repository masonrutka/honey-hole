import { describe, it, expect, vi, afterEach } from "vitest";
import { geolocationMessage } from "../geolocation";

/** Stand-in for the browser's GeolocationPositionError. */
function err(code: number): GeolocationPositionError {
  return {
    code,
    message: "",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

function setAgent(ua: string) {
  vi.stubGlobal("navigator", { userAgent: ua });
}
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

afterEach(() => vi.unstubAllGlobals());

describe("geolocationMessage", () => {
  it("points a desktop user at the OS setting, not just the browser", () => {
    setAgent(MAC);
    const m = geolocationMessage(err(1));
    expect(m).toMatch(/System Settings/);
    expect(m).toMatch(/Location Services/);
  });

  it("does not send a phone user hunting through System Settings", () => {
    setAgent(IPHONE);
    const m = geolocationMessage(err(1));
    expect(m).not.toMatch(/System Settings/);
    expect(m).toMatch(/browser/i);
  });

  it("explains why a desktop lookup fails on a wired or VPN connection", () => {
    setAgent(MAC);
    expect(geolocationMessage(err(2))).toMatch(/Wi-Fi/);
  });

  it("always offers a way forward", () => {
    for (const ua of [MAC, IPHONE]) {
      setAgent(ua);
      for (const code of [1, 2, 3]) {
        expect(geolocationMessage(err(code)).length).toBeGreaterThan(30);
      }
    }
    setAgent(MAC);
    expect(geolocationMessage(err(2))).toMatch(/name/);
    expect(geolocationMessage(err(3))).toMatch(/name/);
  });
});
