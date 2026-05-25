"""
Dynamic wage fetcher.

Scrapes the public O*NET Online occupation page to get the current BLS
median hourly wage for a given SOC code. O*NET Online publishes the
latest BLS OES wage data on each occupation's summary page, so this
gives us a live number without needing a separate BLS subscription.

Result is cached on disk in artifacts/wages/{soc}.json with a fetched_at
timestamp. We re-fetch automatically if the cache is older than 30 days.

Public URL pattern:
    https://www.onetonline.org/link/summary/{soc}
The wage section reads, e.g.:
    Median wages (2024) $35.05 hourly, $72,910 annual

We parse those numbers with a regex. No HTML library dependency.

Usage:
    from wage_fetcher import fetch_wage
    info = fetch_wage("13-1071.00")
    # -> {'hourly': 35.05, 'annual': 72910, 'year': '2024',
    #     'source_url': '...', 'fetched_at': '2026-05-19T...'}
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

SPIKE_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = SPIKE_ROOT / "artifacts" / "wages"
CACHE_TTL = timedelta(days=30)

ONET_ONLINE_URL = "https://www.onetonline.org/link/summary/{soc}"
USER_AGENT = "Mozilla/5.0 (Fuzebox-Research/0.1)"

# O*NET online renders the wage section as:
#   <dt>Median wages <small ...>(YEAR)</small></dt>
#   <dd ...>$HOURLY hourly, $ANNUAL annual</dd>
# We allow arbitrary HTML between the label and the values.
WAGE_PATTERN = re.compile(
    r"Median wages.*?\((?P<year>\d{4})\).*?"
    r"\$(?P<hourly>[\d.,]+)\s*hourly[\s,]*"
    r"\$(?P<annual>[\d,]+)\s*annual",
    re.IGNORECASE | re.DOTALL,
)


def _cache_path(soc: str) -> Path:
    return CACHE_DIR / f"{soc}.json"


def _read_cache(soc: str) -> dict | None:
    p = _cache_path(soc)
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text())
        fetched_at = datetime.fromisoformat(data["fetched_at"])
        if datetime.now(timezone.utc) - fetched_at > CACHE_TTL:
            return None
        return data
    except Exception:
        return None


def _write_cache(soc: str, data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(soc).write_text(json.dumps(data, indent=2))


def _scrape(soc: str) -> dict | None:
    url = ONET_ONLINE_URL.format(soc=soc)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return None

    m = WAGE_PATTERN.search(html)
    if not m:
        return None
    try:
        hourly = float(m.group("hourly").replace(",", ""))
        annual = int(m.group("annual").replace(",", ""))
    except ValueError:
        return None
    return {
        "soc": soc,
        "hourly": hourly,
        "annual": annual,
        "year": m.group("year"),
        "source": "O*NET Online (which republishes BLS OES median wages)",
        "source_url": url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def fetch_wage(soc: str, *, force_refresh: bool = False) -> dict | None:
    """
    Return live wage info for the SOC, or None if the live fetch failed and
    no cache is available.

    The returned dict has: hourly (float), annual (int), year (str),
    source (str), source_url (str), fetched_at (ISO timestamp).
    """
    if not force_refresh:
        cached = _read_cache(soc)
        if cached is not None:
            return cached

    fresh = _scrape(soc)
    if fresh is not None:
        _write_cache(soc, fresh)
        return fresh

    # Live fetch failed; surface stale cache if we have it, otherwise None.
    stale = None
    p = _cache_path(soc)
    if p.exists():
        try:
            stale = json.loads(p.read_text())
            stale["stale"] = True
        except Exception:
            stale = None
    return stale


if __name__ == "__main__":
    import sys
    soc = sys.argv[1] if len(sys.argv) > 1 else "13-1071.00"
    info = fetch_wage(soc, force_refresh=True)
    print(json.dumps(info, indent=2))
