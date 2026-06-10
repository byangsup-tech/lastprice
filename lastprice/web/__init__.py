"""Web dashboard package (pure-stdlib server + inlined single-file SPA)."""
from .render import render_html
from .server import export_html, serve

__all__ = ["render_html", "serve", "export_html"]
