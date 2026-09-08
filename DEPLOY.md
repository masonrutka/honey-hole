# Deploying Sonar

The app is a standard Next.js project with no database, no environment variables
and no API keys. That makes deployment about as simple as it gets: push to
GitHub, import on Vercel, done.

## 1. Push to GitHub

You need to authenticate once. This opens a browser:

```bash
gh auth login
```

Choose: **GitHub.com** → **HTTPS** → **Login with a web browser**, then paste the
code it shows you.

Then create the repo and push:

```bash
gh repo create sonar-wi-fishing --public --source=. --remote=origin --push
```

## 2. Deploy on Vercel

1. Go to **[vercel.com/new](https://vercel.com/new)** and sign in with GitHub.
2. Import the `sonar-wi-fishing` repo.
3. Leave every setting at its default — Vercel detects Next.js automatically.
4. Click **Deploy**.

There is nothing to configure. No environment variables, no build overrides, no
database connection string.

You get a URL like `sonar-wi-fishing.vercel.app` in about a minute. Every push to
`main` redeploys automatically.

## 3. Optional: a custom domain

In the Vercel project → **Settings → Domains**. A `.com` runs about $12/yr.
Worth it if you're putting the link on a résumé.

## Refreshing the data later

The DNR data changes roughly once a season. To update it:

```bash
python3 ingest/01_lakes.py
python3 ingest/02_species.py --limit 0
python3 ingest/03_regulations.py
python3 ingest/04_build_dataset.py
git add src/data && git commit -m "Refresh DNR dataset" && git push
```

The push triggers a redeploy on its own.

## Notes

- **Free tier is plenty.** The app is almost entirely static. The only outbound
  call is to Open-Meteo, cached for an hour per lake, against a 10,000/day
  non-commercial limit.
- **`src/data/*.json` must stay committed** (2.5 MB). The app imports it at build
  time, so Vercel needs it in the repo — it does not run the Python ingest.
- **Node** is pinned to >=20 in `package.json`; Vercel picks a compatible LTS.
