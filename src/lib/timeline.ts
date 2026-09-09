/**
 * Multi-day bite outlook.
 *
 * The single-point forecast answers "how is it right now". This answers "when
 * should I go", which is the question anglers actually ask -- you check on a
 * Wednesday to plan a Saturday.
 *
 * It adds no new data: the hourly weather is already fetched, and biteForecast()
 * is a pure function of a timestamp, so this is a loop over existing code.
 */

import { biteForecast, ratingFor, RATING_FLOOR, type Rating } from "./forecast";
import { estimateWaterTempF, celestialFor, type WeatherBundle } from "./weather";
import type { SpeciesKey } from "./species";

export interface HourScore {
  time: Date;
  score: number;
}

export interface Window {
  start: Date;
  end: Date;
  score: number;
}

export interface DayOutlook {
  /** Local midnight for this day. */
  date: Date;
  sunrise: Date;
  sunset: Date;
  /** Best single hour on the day. */
  peakScore: number;
  rating: Rating;
  /** The strongest run of consecutive good hours, if there is one. */
  best: Window | null;
  /** True when the good stretch covers most of the day, so no window is useful. */
  goodAllDay: boolean;
  hours: HourScore[];
  waterTempF: number;
}

/** Only score daylight-ish hours; nobody plans a trip for 3am. */
const START_HOUR = 4;
const END_HOUR = 22;

/**
 * An hour must clear this to be worth calling a window at all. Tied to the
 * Good band so the text and the colour cannot disagree -- a flat day at 60 was
 * previously labelled "good most of the day" beside a Fair-coloured score.
 */
const WINDOW_FLOOR = RATING_FLOOR.Good;
/**
 * How far below the day's own peak an hour may sit and still count. Without
 * this, a uniformly good day reports its "best window" as 4am-11pm, which
 * tells you nothing. Judging each hour against that day's peak instead of an
 * absolute number keeps the window meaningful on good days and bad ones alike.
 */
const PEAK_TOLERANCE = 12;
/** A window covering this much of the day is really just "good all day". */
const ALL_DAY_FRACTION = 0.7;

export function buildOutlook(
  weather: WeatherBundle,
  lake: { acres: number; maxDepthFt?: number | null },
  species: SpeciesKey,
  lat: number,
  lon: number,
  days = 5,
  /** Hours already past are dropped from today; pass null to keep the full day. */
  now: Date | null = new Date(),
): DayOutlook[] {
  const out: DayOutlook[] = [];
  const maxDays = Math.min(days, weather.sunrise.length - weather.todayIndex);

  for (let d = 0; d < maxDays; d++) {
    const dayIndex = weather.todayIndex + d;
    const sunrise = weather.sunrise[dayIndex];
    const sunset = weather.sunset[dayIndex];
    if (!sunrise || !sunset) continue;

    // Water temperature keeps drifting across the week, so estimate it per day
    // from the daily means available up to that point rather than freezing
    // today's value across the whole outlook.
    const waterTempF = estimateWaterTempF(weather.dailyMeanAirF, lake, dayIndex);

    const celestial = celestialFor(sunrise, lat, lon, sunrise, sunset);

    // Walk the day in local wall-clock hours, derived from sunrise so the day
    // boundary follows the lake's timezone rather than the server's.
    const dayStartUtc =
      Math.floor(
        (sunrise.getTime() + weather.utcOffsetSeconds * 1000) / 86_400_000,
      ) *
        86_400_000 -
      weather.utcOffsetSeconds * 1000;

    const hours: HourScore[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      const at = new Date(dayStartUtc + h * 3_600_000);
      // Today should not advertise a window that has already ended, nor let an
      // elapsed peak win "best day this week".
      if (now && at.getTime() + 3_600_000 <= now.getTime()) continue;
      // Skip hours the weather series does not cover.
      if (
        at.getTime() < new Date(weather.hours[0].time).getTime() ||
        at.getTime() > new Date(weather.hours[weather.hours.length - 1].time).getTime()
      ) {
        continue;
      }
      const { score } = biteForecast({
        hours: weather.hours,
        at,
        celestial,
        species,
        waterTempF,
        lake,
      });
      hours.push({ time: at, score });
    }
    if (hours.length === 0) continue;

    const peakScore = Math.max(...hours.map((h) => h.score));
    const best = bestWindow(hours, peakScore);
    const covered = best
      ? hours.filter(
          (h) => h.time >= best.start && h.time < best.end,
        ).length / hours.length
      : 0;

    out.push({
      date: new Date(dayStartUtc),
      sunrise,
      sunset,
      peakScore,
      rating: ratingFor(peakScore),
      best,
      goodAllDay: covered >= ALL_DAY_FRACTION,
      hours,
      waterTempF,
    });
  }
  return out;
}

/**
 * Longest run of consecutive hours near that day's peak, tie-broken by the
 * strongest average. Returns null on a day with no good stretch at all, which
 * is itself useful information.
 */
export function bestWindow(hours: HourScore[], peak?: number): Window | null {
  const dayPeak = peak ?? Math.max(0, ...hours.map((h) => h.score));
  const threshold = Math.max(WINDOW_FLOOR, dayPeak - PEAK_TOLERANCE);

  let best: { start: number; end: number; avg: number; len: number } | null = null;
  let i = 0;

  while (i < hours.length) {
    if (hours[i].score < threshold) {
      i++;
      continue;
    }
    let j = i;
    let sum = 0;
    while (j < hours.length && hours[j].score >= threshold) {
      sum += hours[j].score;
      j++;
    }
    const len = j - i;
    const avg = sum / len;
    if (!best || len > best.len || (len === best.len && avg > best.avg)) {
      best = { start: i, end: j - 1, avg, len };
    }
    i = j;
  }

  if (!best) return null;
  return {
    start: hours[best.start].time,
    // A window that peaks at 6pm runs through the end of that hour.
    end: new Date(hours[best.end].time.getTime() + 3_600_000),
    score: Math.round(best.avg),
  };
}
