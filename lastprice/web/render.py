"""Render the single-file dashboard by inlining CSS/JS assets + JSON payloads.

Assets live in ``web/assets/`` as real ``.html/.css/.js`` files (editable with
syntax highlighting); at render time they are inlined into one self-contained
HTML document so both the live server and ``--export-html`` produce a single
file with zero external requests.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import List, Optional

from ..cards import build_card_index_from_engine
from ..catalog import build_catalog_from_engine
from ..models import Opportunity

_ASSETS = os.path.join(os.path.dirname(__file__), "assets")


def _asset(name: str) -> str:
    with open(os.path.join(_ASSETS, name), encoding="utf-8") as f:
        return f.read()


def _inline(obj) -> str:
    return json.dumps(obj).replace("<", "\\u003c")


def page_shell() -> str:
    return _asset("index.html").replace("/*__CSS__*/", _asset("app.css")).replace(
        "/*__JS__*/", _asset("app.js")
    )


def payload(opps: List[Opportunity]):
    return [o.to_dict() for o in opps]


def render_html(
    opps: List[Opportunity],
    engine,
    portfolio_value: Optional[dict] = None,
) -> str:
    try:
        catalog = build_catalog_from_engine(engine)
    except Exception:
        catalog = []
    try:
        index = build_card_index_from_engine(engine)
        card_list = list(index.values())
    except Exception:
        card_list = []
    mode = getattr(engine, "mode", "live")
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return (
        page_shell()
        .replace("/*__DATA__*/[]", _inline(payload(opps)))
        .replace("/*__CARDS__*/[]", _inline(catalog))
        .replace("/*__CARDINDEX__*/[]", _inline(card_list))
        .replace("/*__PORTFOLIO__*/null",
                 _inline(portfolio_value) if portfolio_value is not None else "null")
        .replace("__MODE__", mode)
        .replace("__UPDATED__", updated)
    )
