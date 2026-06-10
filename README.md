# lastprice

A cross-market trading-card **price terminal**. Three things in one zero-dependency app:

1. **Opportunities** — listings priced below market across Collector Crypt,
   Courtyard and Phygitals, with buy/gacha acquisition paths.
2. **Cards** (alt.xyz-style) — per-card **grade ladder** (PSA 10 vs PSA 9 vs Raw
   priced separately) with comp-based value estimates, **sold-price history
   charts**, and **side-by-side cross-market listings** — the differentiator:
   an alt-style value next to three concrete places to buy.
3. **Portfolio** — register the cards you own and see their estimated value in
   real time (server-stored, or browser localStorage in the static export).

> Find a card whose price is spiking, see its true value per grade from sold
> comps, and instantly compare every marketplace selling it.

## Value estimation

Per grade, value = **recency-weighted median** of sold comps within 180 days
(weight `0.5 ** age/45d`), with a p25–p75 band and an n-based confidence tag.
Honest and transparent — surfaced verbatim in the UI, no black box. alt.xyz is
a UX benchmark only (no public API); comps come from sample data in demo mode
and a licensed sold-listings API (PokemonPriceTracker) in live mode.

## Quick start (offline demo — no network needed)

```bash
python -m lastprice --demo
```

Sample output:

```
CARD                                       MARKET           LIST $     MKT $     EDGE      %    24h
Umbreon Vmax [Evolving Skies 215/203] PSA 10  phygitals          900     1,300     +400    31%   +12%
...
```

## Live mode

```bash
export PPT_API_KEY=...        # pokemonpricetracker.com API key (prices + sold comps)
export OPENSEA_API_KEY=...    # for Courtyard listings (OpenSea API)
export SOL_USD=150            # optional: pins SOL->USD (else live oracle/fallback)
python -m lastprice --check                 # verify connectivity + config first
python -m lastprice --live --limit 100
```

Live scans **Collector Crypt + Phygitals + Courtyard**. Options: `--query`,
`--limit`, `--min-spread-pct`, `--min-spread-usd`, `--json`, `--collection`
(CC symbol), `--portfolio-file` (server portfolio storage).

Marketplaces: Collector Crypt + Phygitals are Solana; Courtyard is Polygon via
the OpenSea API (`OPENSEA_API_KEY`, slug `COURTYARD_COLLECTION_SLUG`). Sold
comps come from `PokemonPriceTrackerSalesSource` (live) — its response mapping
is isolated in `_comps_from_response`, verify against the live schema.

### Self-check

`python -m lastprice --check` pings every live endpoint and reports missing
credentials — so a failing live run can be diagnosed as environmental (e.g. an
allowlisted sandbox blocking outbound network) rather than a code bug.

### Alerts

Push new opportunities to console or a Discord webhook, with de-dup so the same
listing/price isn't alerted twice across scheduled runs:

```bash
python -m lastprice --live --alert discord --webhook "$DISCORD_WEBHOOK_URL"
python -m lastprice --demo --alert console --state-file alerts.json
```

### Currency conversion

Marketplaces price in SOL (Magic Eden), ETH/POL (OpenSea/Courtyard), or USDC.
`fx.py` resolves each crypto→USD rate from `<SYM>_USD` env → CoinGecko oracle →
fallback; USDC/USDT pass through. Aliases: WETH→ETH, MATIC→POL.

## Web dashboard

A zero-dependency terminal (pure stdlib server) with three pages — **hash-routed**
so the static export stays a fully working single file (`#/ops`, `#/cards`,
`#/card/<key>`, `#/portfolio`).

- **Opportunities** — Blur-style dense table/grid: stats strip, faceted filters
  (game/grade/market/grader), price sliders, activity tab, buy-vs-gacha drawer.
- **Cards** — searchable grid of base cards; click for a detail page with the
  grade ladder, an SVG sold-price history chart (one line per grade, toggleable),
  and a cross-market live-listings table.
- **Portfolio** — search-and-add holdings with a grade picker; total value,
  unrealized P/L, allocation-by-game. Saved server-side (`--portfolio-file`,
  `POST /api/portfolio`) or in `localStorage` for the static export.

Routes: `/`, `/api/opportunities`, `/api/cards`, `/api/card/{base_key}`,
`/api/catalog`, `/api/activity`, `/api/portfolio` (GET/POST), `/healthz`. A
short-lived snapshot cache (`LASTPRICE_CACHE_TTL`, default 60s) avoids hammering
live APIs. Assets live as real files in `lastprice/web/assets/` and are inlined
at render time into one self-contained HTML.

The legacy dense dashboard still applies to the Opportunities page:
client-side **search**, **sort** (best / edge $ / edge % / 24h / price), faceted
**filters** for game (Pokémon, Riftbound, One Piece, sports, Magic, …),
marketplace and grader, plus **table/grid** views and 20s auto-refresh.
Opportunities are inlined as JSON, so the exported HTML is fully interactive
with no backend.

```bash
python -m lastprice --serve --port 8000        # demo data
python -m lastprice --serve --live --port 8000 # live data (needs API keys)
# open http://localhost:8000
```

Routes: `/` (dashboard), `/api/opportunities` (JSON), `/healthz`.
Static snapshot for static hosting (GitHub Pages, S3, Netlify):

```bash
python -m lastprice --export-html public/index.html
```

### Launch / deploy

Container (works on Render, Railway, Fly.io, Heroku, any Docker host):

```bash
docker build -t lastprice .
docker run -p 8000:8000 lastprice          # -> http://localhost:8000
```

The image binds `$PORT`/`$HOST`, so PaaS platforms that inject `$PORT` work
out of the box (also covered by the `Procfile`). For **live data** in
production, run the container with `--live` and set `PPT_API_KEY`, `SOL_USD`,
and `PHYGITALS_API_BASE` as environment variables:

```bash
docker run -p 8000:8000 -e PPT_API_KEY=... -e SOL_USD=150 \
  lastprice python -m lastprice --serve --live --host 0.0.0.0 --port 8000
```

## How it works

```
[price source]  ──┐
                  ├─► [normalize → CardKey] ─► [ArbitrageEngine] ─► opportunities
[market adapter]──┘        (match across markets)
```

- **`CardKey`** (`models.py`) — canonical identity: name + set + number +
  grader + grade. Same physical card → same key on every market.
- **`normalize.parse_card_title`** — heuristic parser turning raw titles into
  `CardKey`. Extend `KNOWN_SETS` / `GRADERS` to cover more.
- **`ArbitrageEngine`** (`engine.py`) — marketplace-agnostic matching + spread.

## Expanding to other markets

This is the whole design goal. To add a marketplace, implement one method:

```python
from lastprice.sources.base import MarketAdapter
from lastprice.models import Listing
from lastprice.normalize import parse_card_title

class FanaticsAdapter(MarketAdapter):
    name = "fanatics"
    def fetch_listings(self, query=None, limit=50) -> list[Listing]:
        ...  # call the API, map each row to Listing(card_key=parse_card_title(title), ...)
```

then add it to the adapter list in `cli.build_live_engine`. The engine,
matching, and scoring are untouched. Price sources extend the same way via
`PriceSource`.

Magic-Eden-based markets (e.g. Collector Crypt) subclass
`sources/magic_eden.py` and only set a collection symbol + item URL. Markets
with their own API (e.g. Phygitals — `phygitals.com/card/{slug}`, multi-TCG)
get a standalone adapter with field mapping isolated in `_to_listing`.

Current adapters: Collector Crypt (Magic Eden), Phygitals (native API),
sample/offline. Planned: Fanatics Collect, eBay sold-listings.

> **Phygitals note:** its public API schema isn't documented. Configure
> `PHYGITALS_API_BASE` / `PHYGITALS_LISTINGS_PATH` and adjust
> `PhygitalsAdapter._to_listing` to the live response before relying on it.
> The Pokémon-centric set parser also won't detect non-Pokémon sets
> (Riftbound, One Piece); name + number + grade still match cross-market.

## Data sources & legality

- **Price signal:** use a *licensed* API (PokemonPriceTracker, PriceCharting,
  JustTCG). Do **not** scrape alt.xyz — its valuations are proprietary and the
  site blocks bots; contact them for a partnership if you need ALT Value.
- **Listings:** Collector Crypt & Phygitals are Solana NFTs, readable via
  Magic Eden's public API / on-chain RPC. Prefer official APIs.
- Surface results as **deep links** to the marketplace; don't broker trades.

## Tests

```bash
python -m unittest discover -s tests -v
```

## Status

Proof of concept. The matching engine + offline demo run end-to-end today; the
live adapters require network access (blocked in some sandboxes) and an API
key. Price-source response mapping (`pricing/pokemonpricetracker.py`) may need
a small field tweak against the live schema.
