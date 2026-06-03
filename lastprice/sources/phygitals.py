"""Phygitals marketplace adapter.

Phygitals tokenizes physical cards as Solana NFTs (Pokémon, One Piece, sports,
…) on the same Magic Eden marketplace rails, so it reuses
:class:`MagicEdenAdapter`. Set the real collection symbol via
``PHYGITALS_COLLECTION_SYMBOL`` (or pass ``collection_symbol=``); the default
is a placeholder until confirmed against their live collection.

If Phygitals exposes a native listings API instead, override
``fetch_listings`` here — the engine is unaffected.
"""
from __future__ import annotations

from .magic_eden import MagicEdenAdapter


class PhygitalsAdapter(MagicEdenAdapter):
    name = "phygitals"
    default_symbol = "phygitals"
    env_symbol_key = "PHYGITALS_COLLECTION_SYMBOL"

    def item_url(self, mint: str) -> str:
        return f"https://phygitals.com/item/{mint}" if mint else super().item_url(mint)
