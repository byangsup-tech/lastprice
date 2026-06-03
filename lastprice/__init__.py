"""lastprice — cross-market trading-card arbitrage scanner.

Pulls live card market prices from a pluggable price source and listings from
one or more marketplace adapters (Collector Crypt, Phygitals, ...), normalizes
each card to a canonical key, and surfaces underpriced listings (listing price
well below current market price).

The whole point of the adapter design is expansion: adding a new marketplace
or price source is a single new class implementing `MarketAdapter` /
`PriceSource` — the matching engine never changes.
"""

__version__ = "0.1.0"
