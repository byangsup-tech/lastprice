"""User portfolio: cards you own, valued in real time against the card index.

Storage is a server-side JSON file (default ``.lastprice_portfolio.json``,
same precedent as the alerts state file) so holdings survive browser changes
and work for the CLI. The static HTML export instead keeps a localStorage
portfolio client-side — handled in the web layer.

Valuation per holding resolves, in order: comp-based grade estimate →
licensed quote → cheapest live ask; each row is tagged with which basis was
used so the UI can show how every number was derived.
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

from .normalize import parse_card_title

DEFAULT_PATH = ".lastprice_portfolio.json"


@dataclass
class Holding:
    id: str
    title: str
    key: str        # full canonical (grade-specific)
    base_key: str
    grade_label: str
    qty: int = 1
    cost_basis_usd: Optional[float] = None
    added_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Portfolio:
    def __init__(self, path: str = DEFAULT_PATH):
        self.path = path
        self._lock = threading.Lock()
        self._holdings: List[Holding] = []
        self._load()

    def _load(self) -> None:
        if not os.path.exists(self.path):
            return
        try:
            with open(self.path, encoding="utf-8") as f:
                self._holdings = [Holding(**h) for h in json.load(f)]
        except Exception:
            self._holdings = []

    def _save(self) -> None:
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump([asdict(h) for h in self._holdings], f, indent=1)

    def add(
        self,
        title: str,
        grader: str = "",
        grade: str = "",
        qty: int = 1,
        cost_basis_usd: Optional[float] = None,
    ) -> Holding:
        """Add a holding. ``grader``/``grade`` override whatever the title says
        (the UI's grade picker passes them explicitly)."""
        key = parse_card_title(title)
        if grader or grade:
            from dataclasses import replace

            key = replace(key, grader=grader.upper(), grade=str(grade))
        h = Holding(
            id=uuid.uuid4().hex[:12],
            title=title,
            key=key.canonical(),
            base_key=key.base_canonical(),
            grade_label=key.grade_label(),
            qty=max(1, int(qty)),
            cost_basis_usd=float(cost_basis_usd) if cost_basis_usd not in (None, "") else None,
        )
        with self._lock:
            self._holdings.append(h)
            self._save()
        return h

    def remove(self, holding_id: str) -> bool:
        with self._lock:
            before = len(self._holdings)
            self._holdings = [h for h in self._holdings if h.id != holding_id]
            if len(self._holdings) != before:
                self._save()
                return True
            return False

    def holdings(self) -> List[Holding]:
        return list(self._holdings)

    def valued(self, card_index: Dict[str, dict]) -> dict:
        """Value every holding against the card index (see module docstring)."""
        rows = []
        total_value = total_cost = 0.0
        by_game: Dict[str, float] = {}
        for h in self._holdings:
            entry = card_index.get(h.base_key)
            grade_row = None
            if entry:
                grade_row = next((r for r in entry["grades"] if r["key"] == h.key), None)

            unit, basis = None, "none"
            if grade_row:
                if grade_row["estimate"]:
                    unit, basis = grade_row["estimate"]["estimate_usd"], "comps"
                elif grade_row["quote_usd"] is not None:
                    unit, basis = grade_row["quote_usd"], "quote"
                elif grade_row["lowest_ask_usd"] is not None:
                    unit, basis = grade_row["lowest_ask_usd"], "ask"

            value = round(unit * h.qty, 2) if unit is not None else None
            game = entry["game"] if entry else "other"
            if value is not None:
                total_value += value
                by_game[game] = by_game.get(game, 0.0) + value
            cost = (h.cost_basis_usd or 0.0) * h.qty
            total_cost += cost

            rows.append({
                "id": h.id,
                "title": h.title,
                "key": h.key,
                "base_key": h.base_key,
                "name": entry["name"] if entry else h.title,
                "game": game,
                "grade_label": h.grade_label,
                "qty": h.qty,
                "cost_basis_usd": h.cost_basis_usd,
                "unit_value_usd": unit,
                "value_usd": value,
                "value_basis": basis,
                "estimate": grade_row["estimate"] if grade_row else None,
                "image": entry["image"] if entry else "",
                "added_at": h.added_at,
            })

        unrealized = round(total_value - total_cost, 2) if total_cost else None
        return {
            "holdings": rows,
            "total_value_usd": round(total_value, 2),
            "total_cost_usd": round(total_cost, 2) if total_cost else None,
            "unrealized_usd": unrealized,
            "unrealized_pct": (
                round(unrealized / total_cost * 100, 1) if total_cost else None
            ),
            "allocation_by_game": {g: round(v, 2) for g, v in sorted(
                by_game.items(), key=lambda kv: -kv[1])},
            "n_holdings": len(rows),
        }
