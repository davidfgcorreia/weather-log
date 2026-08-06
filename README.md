# weather-log

A GitHub Action that reads the current temperature every six hours and commits
it. The full history accumulates in [`data/weather.jsonl`](data/weather.jsonl);
[`WEATHER.md`](WEATHER.md) is the human-readable view of the last 48 readings.

Currently logging **Lisbon, Portugal**.

Data comes from [Open-Meteo](https://open-meteo.com), which needs no API key and
no account.

## Logging a different place

Everything that decides *what* gets recorded lives in
[`src/config.ts`](src/config.ts):

```ts
weather: {
  latitude: 38.7223,
  longitude: -9.1393,
  timezone: "Europe/Lisbon",
  label: "Lisbon, Portugal",
}
```

Set `timezone` to the *location's* zone, not your own — Open-Meteo uses it to
report the observation time, and it is what makes `localTime` in each record
mean local to the place being measured.

Fork, change those four values, delete `data/weather.jsonl` and `WEATHER.md` to
start a fresh history, and enable Actions on your fork.

## Running it by hand

```bash
npm install
npm run update      # fetches once, appends to both files, prints the commit subject
npm test            # 21 unit tests, no network
npm run typecheck
```

`npm run update` writes the files but does not commit; the workflow does that
part. You can also trigger a real run from the Actions tab — the workflow has
`workflow_dispatch` enabled.

## How the schedule works

```yaml
- cron: "23 5,11,17,23 * * *"
```

Two things worth knowing if you copy this:

- **GitHub cron is UTC only**, with no timezone setting. These times are chosen
  so one reading lands just after noon in Lisbon while Portugal is on summer
  time. Under winter time they all shift an hour earlier, and cron cannot follow
  that — a DST-correct schedule would need the job to decide for itself whether
  to record.
- **The `:23` offset is deliberate.** Jobs queued on the hour compete with the
  busiest minute on the platform; they get delayed the longest and are the most
  likely to be dropped. GitHub does not guarantee scheduled runs fire at all
  under load, so treat a missing reading as normal rather than as a bug.

## Two notes

**The commits are authored by a person, not by `github-actions[bot]`.** The
bot's address belongs to no GitHub account, so commits made under it are
attributed to nobody. The workflow instead sets the author to a
`users.noreply.github.com` address, which *is* tied to an account, so the
commits are attributed and counted like any other. If you fork this, change
those two lines in [`weather.yml`](.github/workflows/weather.yml) to your own
name and noreply address — find yours under Settings → Emails. Leaving mine
there would author your commits to me.

**A reading with no temperature fails the run rather than committing a null.**
The job exists to record a temperature; four `null °C` entries a day would be
worse than a visible failure. See `toWeatherRecord` in
[`src/format.ts`](src/format.ts).

## Layout

```
src/format.ts    pure formatting and validation — no I/O, and where the tests point
src/update.ts    fetch, append, render
src/store.ts     append-only JSONL read/write
src/config.ts    location and paths — the only file you need to edit
```

## Licence

MIT — see [LICENSE](LICENSE).
