"""Compatibility entry point; canonical ASGI module is app.main:app."""

from app.main import app

__all__ = ["app"]
