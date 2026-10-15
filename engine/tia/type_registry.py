"""Canonical Siemens type registry shared with the browser editor."""
from __future__ import annotations
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_REGISTRY_PATH = Path(__file__).resolve().parents[2] / "gui" / "data" / "siemens-type-registry.json"

@lru_cache(maxsize=1)
def registry() -> dict[str, Any]:
    with _REGISTRY_PATH.open(encoding="utf-8") as source:
        data = json.load(source)
    if data.get("schema_version") != 1 or not isinstance(data.get("types"), list):
        raise RuntimeError("Invalid Siemens type registry.")
    return data

@lru_cache(maxsize=1)
def _by_name() -> dict[str, dict[str, Any]]:
    entries: dict[str, dict[str, Any]] = {}
    for entry in registry()["types"]:
        for name in (entry["name"], *entry.get("aliases", [])):
            key = name.casefold()
            if key in entries: raise RuntimeError(f"Duplicate Siemens type registry name: {name}")
            entries[key] = entry
    return entries

def type_entry(name: str | None) -> dict[str, Any] | None:
    return _by_name().get((name or "").strip().casefold())

def is_builtin_type(name: str | None) -> bool:
    return type_entry(name) is not None

def is_declarable_type(name: str | None, family: str | None = None) -> bool:
    entry = type_entry(name)
    return bool(entry and entry.get("declarable") and (not family or family in entry["families"]))

def declarable_types(family: str | None = None) -> list[str]:
    return [entry["name"] for entry in registry()["types"] if entry.get("declarable") and (not family or family in entry["families"])]

def system_type_names() -> set[str]:
    return set(_by_name())
