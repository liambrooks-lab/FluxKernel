"""
web_fetcher.py — Controlled external web access tool for the FluxKernel agent.

Security constraints (enforced on every call):
  - Only https:// scheme allowed (no file://, ftp://, etc.)
  - Max download size: 100 MB
  - Downloads land exclusively inside workspace/ (path-traversal protected)
  - User-Agent is set to FluxKernel/1.0 to be transparent
  - Redirects are followed but limited to 5 hops
"""
import re
from pathlib import Path
from urllib.parse import urlparse
from typing import Any

import httpx
from bs4 import BeautifulSoup

from app.tools.file_manager import WORKSPACE_DIR, _resolve_and_check_path

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
USER_AGENT = "FluxKernel/1.0 (AI-OS research agent; +https://github.com/FluxKernel)"
DEFAULT_TIMEOUT = 30.0
MAX_REDIRECTS = 5

# ── Security Helpers ──────────────────────────────────────────────────────────

def _validate_url(url: str) -> None:
    """Raise ValueError if the URL is not an acceptable https target."""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(
            f"Only https:// URLs are permitted. Got scheme: '{parsed.scheme}'"
        )
    if not parsed.netloc:
        raise ValueError(f"URL has no host: '{url}'")


def _build_client() -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
        max_redirects=MAX_REDIRECTS,
        timeout=DEFAULT_TIMEOUT,
    )


# ── Public API ────────────────────────────────────────────────────────────────

def fetch_url(url: str, save_as: str | None = None) -> dict[str, Any]:
    """
    Fetch the raw text content of an https URL.

    Args:
        url:     Target URL (https:// only).
        save_as: Optional workspace-relative path to persist the response body.

    Returns:
        {"url": str, "status_code": int, "content": str, "saved_to": str | None}
    """
    _validate_url(url)

    with _build_client() as client:
        response = client.get(url)
        response.raise_for_status()
        content = response.text

    saved_to: str | None = None
    if save_as:
        target = _resolve_and_check_path(save_as)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        saved_to = save_as

    return {
        "url": url,
        "status_code": response.status_code,
        "content": content,
        "saved_to": saved_to,
    }


def scrape_page(
    url: str,
    css_selector: str | None = None,
    save_as: str | None = None,
) -> dict[str, Any]:
    """
    Fetch an https URL and return clean text (optionally filtered by a CSS selector).

    Args:
        url:          Target URL (https:// only).
        css_selector: Optional CSS selector to narrow extracted content.
        save_as:      Optional workspace-relative path to save the result.

    Returns:
        {"url": str, "text": str, "saved_to": str | None}
    """
    _validate_url(url)

    with _build_client() as client:
        response = client.get(url)
        response.raise_for_status()
        html = response.text

    soup = BeautifulSoup(html, "lxml")

    if css_selector:
        elements = soup.select(css_selector)
        text = "\n".join(el.get_text(separator=" ", strip=True) for el in elements)
    else:
        # Remove script/style noise before extracting full page text
        for tag in soup(["script", "style", "noscript", "header", "footer", "nav"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        # Collapse excessive blank lines
        text = re.sub(r"\n{3,}", "\n\n", text)

    saved_to: str | None = None
    if save_as:
        target = _resolve_and_check_path(save_as)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        saved_to = save_as

    return {"url": url, "text": text, "saved_to": saved_to}


def download_file(url: str, filename: str) -> dict[str, Any]:
    """
    Stream-download a binary file from an https URL into workspace/<filename>.

    Args:
        url:      Source URL (https:// only).
        filename: Workspace-relative destination path.

    Returns:
        {"url": str, "workspace_path": str, "size_bytes": int}
    """
    _validate_url(url)

    target = _resolve_and_check_path(filename)  # path-traversal protected
    target.parent.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    with _build_client() as client:
        with client.stream("GET", url) as response:
            response.raise_for_status()
            with open(target, "wb") as out_file:
                for chunk in response.iter_bytes(chunk_size=65_536):
                    downloaded += len(chunk)
                    if downloaded > MAX_DOWNLOAD_BYTES:
                        out_file.close()
                        target.unlink(missing_ok=True)
                        raise ValueError(
                            f"Download aborted: exceeded 100 MB safety limit "
                            f"({downloaded / 1_048_576:.1f} MB received)."
                        )
                    out_file.write(chunk)

    return {
        "url": url,
        "workspace_path": filename,
        "size_bytes": downloaded,
    }


def fetch_api(
    url: str,
    headers: dict[str, str] | None = None,
    payload: dict[str, Any] | None = None,
    save_as: str | None = None,
) -> dict[str, Any]:
    """
    Ping an external JSON API (GET or POST).

    Args:
        url:     Target API endpoint (https:// only).
        headers: Optional extra request headers (e.g. Authorization).
        payload: If provided, a POST request is made with this JSON body.
        save_as: Optional workspace-relative path to save the JSON response.

    Returns:
        {"url": str, "status_code": int, "json": Any, "saved_to": str | None}
    """
    _validate_url(url)

    merged_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        merged_headers.update(headers)

    with httpx.Client(
        headers=merged_headers,
        follow_redirects=True,
        max_redirects=MAX_REDIRECTS,
        timeout=DEFAULT_TIMEOUT,
    ) as client:
        if payload is not None:
            response = client.post(url, json=payload)
        else:
            response = client.get(url)
        response.raise_for_status()
        data = response.json()

    saved_to: str | None = None
    if save_as:
        import json as _json
        target = _resolve_and_check_path(save_as)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(_json.dumps(data, indent=2), encoding="utf-8")
        saved_to = save_as

    return {
        "url": url,
        "status_code": response.status_code,
        "json": data,
        "saved_to": saved_to,
    }
