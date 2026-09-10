import type { Metadata } from "next";
import { totalLakes, coverage } from "@/lib/lakes";

export const metadata: Metadata = {
  title: "About",
  description: "Where Honey Hole's data comes from, and what its ratings do and don't mean.",
};

export default function AboutPage() {
  const count = totalLakes();
  const have = coverage();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 space-y-6">
      <p className="text-[11px] uppercase tracking-[0.2em] text-accent">
        How this works
      </p>
      <h1 className="display mt-3 text-4xl sm:text-5xl font-semibold">
        About Honey Hole
      </h1>

      <p className="text-muted text-pretty">
        Honey Hole pulls together public Wisconsin data that is genuinely useful on the
        water but scattered across several DNR systems: which fish live in a lake,
        what you are allowed to keep, and whether today is worth the trip.
      </p>

      <section className="space-y-2 pt-4">
        <h2 className="rule-tick pt-3 text-[11px] uppercase tracking-[0.18em] text-muted">Where the data comes from</h2>
        <ul className="mt-3 space-y-3.5 text-sm text-muted">
          <li>
            <span className="text-foreground">Lakes.</span> {count.toLocaleString()}{" "}
            named lakes and flowages of 5 acres or more, from the WDNR 24K Hydrography
            layer. Every lake is keyed by its WBIC, the DNR&rsquo;s waterbody id.
          </li>
          <li>
            <span className="text-foreground">Species and lake facts.</span> The DNR
            lake pages, which publish surveyed species with an abundance rating
            for {have.species.toLocaleString()} lakes, plus acreage, maximum
            depth and boat landings.
          </li>
          <li>
            <span className="text-foreground">Regulations.</span> The WDNR lake
            regulations layer — seasons, size limits and bag limits, per species,
            per lake.
          </li>
          <li>
            <span className="text-foreground">Bottom and hydrology.</span> Bottom
            composition (sand, gravel, rock, muck) for{" "}
            {have.bottom.toLocaleString()} lakes and a hydrologic lake type for{" "}
            {have.lakeType.toLocaleString()}. Bottom drives where fish hold; lake
            type stands in for clarity, since seepage and spring lakes run
            clearer than stream-fed drainage lakes.
          </li>
          <li>
            <span className="text-foreground">Stocking.</span> DNR hatchery
            records from 2015, covering {have.stocking.toLocaleString()} lakes.
            These are keyed by waterbody name rather than by id, so they are
            joined by name matching that places 88.6% of records; the rest are
            millponds, quarries and lake chains outside this dataset. Tribal and
            private stocking is not included.
          </li>
          <li>
            <span className="text-foreground">Weather.</span> Open-Meteo, for hourly
            temperature, barometric pressure, wind, cloud cover and precipitation.
          </li>
        </ul>
      </section>

      <section className="space-y-2 pt-4">
        <h2 className="rule-tick pt-3 text-[11px] uppercase tracking-[0.18em] text-muted">How the bite forecast works</h2>
        <p className="text-sm text-muted text-pretty">
          Seven factors are scored and summed against a neutral baseline of 50:
          barometric trend over the last six hours, water temperature against that
          species&rsquo; preferred range, time of day relative to sunrise and sunset,
          wind, cloud cover, solunar moon periods, and precipitation. Each one is
          weighted by how much it actually matters, and the page shows every factor
          with its contribution.
        </p>
        <p className="text-sm text-muted text-pretty">
          Barometric trend carries the most weight, because it is the variable with
          the strongest and best-documented relationship to feeding behaviour. Fish
          feed ahead of an arriving front and shut down behind one.
        </p>
      </section>

      <section className="space-y-2 pt-4">
        <h2 className="rule-tick pt-3 text-[11px] uppercase tracking-[0.18em] text-muted">What this is not</h2>
        <p className="text-sm text-muted text-pretty">
          The bite score is a heuristic built from well-established angling
          relationships. It is not a validated predictive model, and nobody has
          checked it against a catch database. That is exactly why the reasoning is
          always on screen: you should be able to look at the factors, disagree, and
          go fishing anyway.
        </p>
        <p className="text-sm text-muted text-pretty">
          Water temperature is an <span className="text-foreground">estimate</span>{" "}
          derived from recent air temperatures damped by lake size and depth. Most
          Wisconsin inland lakes have no live temperature gauge. A $12 thermometer in
          your boat beats this number every time.
        </p>
        <p className="text-sm text-muted text-pretty">
          Regulations are reproduced from DNR data and can lag rule changes. The
          current regulations pamphlet is always the authority.
        </p>
        <p className="text-sm text-muted text-pretty">
          A lake showing no stocking history means{" "}
          <span className="text-foreground">none was matched</span>, not
          necessarily that none happened — and stocking does not imply a fishery
          has no natural reproduction. Many waters are stocked to supplement it.
        </p>
      </section>
    </div>
  );
}
