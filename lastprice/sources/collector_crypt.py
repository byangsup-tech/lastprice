"""Collector Crypt marketplace adapter (via the Magic Eden API).

Collector Crypt NFTs are Solana/Metaplex tokens traded through Magic Eden, so
this is a thin subclass of :class:`MagicEdenAdapter` — only the collection
symbol and the canonical item URL differ.

Requires outbound access to api-mainnet.magiceden.dev. In a locked-down /
allowlisted environment use the sample adapter + ``--demo``.
"""
from __future__ import annotations

from .magic_eden import MagicEdenAdapter


class CollectorCryptAdapter(MagicEdenAdapter):
    name = "collector_crypt"
    default_symbol = "collector_crypt"
    env_symbol_key = "CC_COLLECTION_SYMBOL"

    def item_url(self, mint: str) -> str:
        return f"https://collectorcrypt.com/card/{mint}" if mint else super().item_url(mint)
