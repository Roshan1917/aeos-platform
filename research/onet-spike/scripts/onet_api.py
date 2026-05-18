"""
O*NET Web Services V2 API client.

Matches the official Python sample
(https://github.com/onetcenter/web-services-v2-samples/blob/main/python/OnetWebService.py)
byte-for-byte for auth: same User-Agent, same X-API-Key header, same base URL.

Usage:
    client = OnetClient()                 # reads ONET_API_KEY from .env
    if client.health_check():
        tasks = client.tasks_for_soc("13-1071.00")
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

SPIKE_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(SPIKE_ROOT / ".env")

DEFAULT_BASE = "https://api-v2.onetcenter.org/"


class OnetApiError(RuntimeError):
    pass


class OnetClient:
    def __init__(self, api_key: str | None = None, base_url: str = DEFAULT_BASE):
        self.api_key = api_key or os.environ.get("ONET_API_KEY")
        if not self.api_key:
            raise OnetApiError(
                "ONET_API_KEY not set. Put it in research/onet-spike/.env"
            )
        self.base_url = base_url
        self._headers = {
            "User-Agent": "python-OnetWebService/2.00 (bot)",
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }

    # ------------------------------------------------------------------
    # Low-level GET — returns parsed JSON or raises OnetApiError.
    # ------------------------------------------------------------------
    def _get(self, path: str, **query) -> dict:
        url = self.base_url + path.lstrip("/")
        if query:
            url += "?" + urllib.parse.urlencode(query, doseq=True)
        req = urllib.request.Request(url, headers=self._headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                code = resp.getcode()
                if code != 200:
                    raise OnetApiError(f"{url} returned {code}")
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore")[:200]
            raise OnetApiError(
                f"HTTP {e.code} from {url} — {body!r}"
            ) from None
        except urllib.error.URLError as e:
            raise OnetApiError(f"Network error to {url}: {e.reason}") from None

    # ------------------------------------------------------------------
    # High-level helpers.
    # ------------------------------------------------------------------
    def health_check(self) -> bool:
        """Return True iff the API responds successfully to /about/."""
        try:
            self._get("about/")
            return True
        except OnetApiError:
            return False

    def occupation(self, soc: str) -> dict:
        return self._get(f"online/occupations/{soc}/")

    def tasks_for_soc(self, soc: str) -> list[dict]:
        """Return a normalized list of tasks for the given O*NET-SOC code."""
        data = self._get(f"online/occupations/{soc}/details/tasks")
        raw = data.get("task") or data.get("tasks") or []
        out = []
        for t in raw:
            ratings = {r.get("scale_id", r.get("name")): r for r in (t.get("rating") or t.get("ratings") or [])}
            imp = ratings.get("IM", {}).get("value") or ratings.get("Importance", {}).get("value")
            out.append({
                "task_id": int(t.get("id") or t.get("task_id")),
                "description": t.get("name") or t.get("statement") or t.get("task"),
                "task_type": t.get("type") or t.get("task_type") or "",
                "importance": float(imp) if imp is not None else None,
            })
        out.sort(key=lambda r: (r["importance"] or 0), reverse=True)
        return out

    def skills_for_soc(self, soc: str) -> list[dict]:
        data = self._get(f"online/occupations/{soc}/details/skills")
        raw = data.get("element") or data.get("skills") or []
        out = []
        for s in raw:
            ratings = {r.get("scale_id", r.get("name")): r for r in (s.get("rating") or s.get("ratings") or [])}
            imp = ratings.get("IM", {}).get("value") or ratings.get("Importance", {}).get("value")
            out.append({
                "element_id": s.get("id") or s.get("element_id"),
                "skill": s.get("name") or s.get("element_name"),
                "importance": float(imp) if imp is not None else None,
            })
        out.sort(key=lambda r: (r["importance"] or 0), reverse=True)
        return out

    def knowledge_for_soc(self, soc: str) -> list[dict]:
        data = self._get(f"online/occupations/{soc}/details/knowledge")
        raw = data.get("element") or data.get("knowledge") or []
        out = []
        for s in raw:
            ratings = {r.get("scale_id", r.get("name")): r for r in (s.get("rating") or s.get("ratings") or [])}
            imp = ratings.get("IM", {}).get("value") or ratings.get("Importance", {}).get("value")
            out.append({
                "element_id": s.get("id") or s.get("element_id"),
                "area": s.get("name") or s.get("element_name"),
                "importance": float(imp) if imp is not None else None,
            })
        out.sort(key=lambda r: (r["importance"] or 0), reverse=True)
        return out


if __name__ == "__main__":
    c = OnetClient()
    print(f"Base URL: {c.base_url}")
    print(f"Key tail: ...{c.api_key[-6:]}")
    if c.health_check():
        print("HEALTH: OK — API is responding to your key.")
        tasks = c.tasks_for_soc("13-1071.00")
        print(f"Pulled {len(tasks)} tasks for SOC 13-1071.00")
        for t in tasks[:3]:
            imp = t["importance"]
            print(f"  [{t['task_id']}] imp={imp}  {t['description'][:80]}...")
    else:
        print("HEALTH: FAIL — API not yet activated for your key (403).")
        print("This is normal for newly-approved keys. Retry every 15-30 min.")
