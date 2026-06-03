# lastprice

Cross-market trading-card **arbitrage scanner**. It pulls current card market
prices from a licensed price source and live listings from one or more
marketplaces (Collector Crypt, Phygitals, …), normalizes every card to a
canonical identity, and surfaces **listings priced below market** — with a
deep link straight to the listing.

> Find a Pokémon card whose price is spiking, then instantly see where it's
> listed cheap on Collector Crypt / Phygitals.

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
export PPT_API_KEY=...        # pokemonpricetracker.com API key
export SOL_USD=150            # optional: pins SOL->USD (else live oracle/fallback)
python -m lastprice --check                 # verify connectivity + config first
python -m lastprice --live --limit 100
```

Live scans **Collector Crypt + Phygitals** (both via Magic Eden). Options:
`--query`, `--limit`, `--min-spread-pct`, `--min-spread-usd`, `--json`,
`--collection` (override CC symbol).

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

### Currency (SOL → USD)

Magic Eden lists in SOL. `fx.py` resolves the rate from `SOL_USD` env → live
oracle (`SOL_USD_ORACLE_URL`, default CoinGecko) → `SOL_USD_FALLBACK`. Stable-
coins (USDC/USDT) pass through as USD.

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

Markets that share Magic Eden rails (Collector Crypt, Phygitals) subclass
`sources/magic_eden.py` and only set a collection symbol + item URL.

Current adapters: Collector Crypt, Phygitals (both Magic Eden), sample/offline.
Planned: Fanatics Collect, eBay sold-listings.

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
