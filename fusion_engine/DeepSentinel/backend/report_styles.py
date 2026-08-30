"""How the forensic report PDF looks, and which look is in force.

The report is the artefact that leaves the building. It is attached to every
alert, saved by whoever receives it, and cited later — so what it looks like is
not decoration, and one person's taste should not silently become everyone's.

Three styles, each a palette plus a couple of layout switches. They differ in
appearance only: the same facts, in the same order, with the same wording. A
style cannot add, remove or reword anything, which is what makes it safe to let
people choose one.

Stored the way the thresholds are — a small JSON file beside the runtime
settings, read on each render so a change takes effect on the next alert
without a restart.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path

logger = logging.getLogger(__name__)
_lock = threading.Lock()

DEFAULT = "study"


# Palettes are sRGB 0–1, because that is what a PDF content stream takes.
STYLES: dict[str, dict] = {
    "study": {
        "label": "Study",
        "blurb": "Warm ground, dark masthead, the score as one large number. "
                 "The default.",
        "ground": (0.984, 0.980, 0.973),
        "ink":    (0.115, 0.123, 0.138),
        "muted":  (0.434, 0.445, 0.469),
        "faint":  (0.468, 0.480, 0.504),
        "rule":   (0.850, 0.857, 0.874),
        "wash":   (0.904, 0.909, 0.920),
        "header": (0.125, 0.179, 0.278),
        "masthead": True,
        "hero": True,
        "numbered": True,
    },
    "classic": {
        "label": "Classic",
        "blurb": "White paper, a severity rule across the top, headings without "
                 "numbers. What the report looked like before.",
        "ground": (1.0, 1.0, 1.0),
        "ink":    (0.090, 0.110, 0.120),
        "muted":  (0.370, 0.410, 0.420),
        "faint":  (0.550, 0.590, 0.600),
        "rule":   (0.860, 0.890, 0.890),
        "wash":   (0.930, 0.945, 0.945),
        "header": (0.090, 0.110, 0.120),
        "masthead": False,
        "hero": False,
        "numbered": False,
    },
    "plain": {
        "label": "Plain",
        "blurb": "No fills, no colour beyond the severity. Least ink, cleanest "
                 "photocopy, and the one to pick if it is going in a bundle.",
        "ground": (1.0, 1.0, 1.0),
        "ink":    (0.0, 0.0, 0.0),
        "muted":  (0.35, 0.35, 0.35),
        "faint":  (0.50, 0.50, 0.50),
        "rule":   (0.78, 0.78, 0.78),
        "wash":   (0.90, 0.90, 0.90),
        "header": (0.15, 0.15, 0.15),
        "masthead": False,
        "hero": True,
        "numbered": True,
    },
}


def _path() -> Path:
    from backend import config

    return Path(str(config.get("paths", "runtime_settings"))).with_name(
        "report_style.json")


def selected() -> str:
    """The style in force. Falls back to the default rather than failing a
    render — an unreadable settings file must not cost an alert its report."""
    try:
        raw = json.loads(_path().read_text())
        name = str(raw.get("style") or DEFAULT)
        return name if name in STYLES else DEFAULT
    except FileNotFoundError:
        return DEFAULT
    except Exception as exc:                             # noqa: BLE001
        logger.warning(f"Could not read the report style ({exc}); using {DEFAULT}.")
        return DEFAULT


def resolve(name: str | None = None) -> dict:
    """The style dict to render with, by name or from the stored setting."""
    return STYLES.get(name or selected(), STYLES[DEFAULT])


def choose(name: str, actor: str | None = None) -> dict:
    if name not in STYLES:
        raise ValueError(
            f"Unknown report style {name!r}. Choose one of: "
            + ", ".join(sorted(STYLES)))
    with _lock:
        p = _path()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"style": name, "set_by": actor}, indent=2))
    logger.info(f"Report style set to {name} by {actor}")
    return {"style": name, "label": STYLES[name]["label"]}


def listing() -> list[dict]:
    cur = selected()
    return [
        {"name": k, "label": v["label"], "blurb": v["blurb"],
         "selected": k == cur,
         "preview_url": f"/report-styles/{k}/preview"}
        for k, v in STYLES.items()
    ]
