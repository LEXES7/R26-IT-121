"""A small PDF writer, so a forensic report can be attached as a real PDF.

There is no PDF library in this service and adding one would put an install
step on every teammate's machine for a single feature. This does not need one:
the report is text, rules and a table, and PDF's fourteen standard fonts are
guaranteed present in every reader, so nothing has to be embedded. What is left
is the file structure itself, which is small and fully specified.

It produces real text — selectable, searchable, and quotable — rather than an
image of text. A filing that cannot be copied out of is not much of a filing.

Not a general renderer. It lays out one shape of document: a titled report with
a key/value block, headings, paragraphs and a footer, paginated.
"""
from __future__ import annotations

import zlib
from dataclasses import dataclass, field

# Widths per 1000 units for ASCII 32..126, from the Adobe metrics for the two
# standard fonts used here. Baked in rather than measured at runtime so the
# module has no dependency at all.
_W = {
    "Helvetica": (278,278,355,556,556,889,667,222,333,333,389,584,278,333,278,278,556,556,
                  556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,
                  722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,
                  667,944,667,667,611,278,278,278,469,556,222,556,556,500,556,556,278,556,
                  556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,
                  500,334,260,334,584),
    "Helvetica-Bold": (278,333,474,556,556,889,722,278,333,333,389,584,278,333,278,278,556,
                       556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,
                       722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,
                       667,611,722,667,944,667,667,611,333,278,333,584,556,278,556,611,556,
                       611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,
                       611,556,778,556,556,500,389,280,389,584),
}
_W["Courier"] = tuple([600] * 95)

FONTS = {"Helvetica": "F1", "Helvetica-Bold": "F2", "Courier": "F3"}

A4 = (595.28, 841.89)


def text_width(s: str, font: str, size: float) -> float:
    table = _W.get(font, _W["Helvetica"])
    total = 0
    for ch in s:
        c = ord(ch)
        total += table[c - 32] if 32 <= c <= 126 else table[ord("n") - 32]
    return total * size / 1000.0


def wrap(s: str, font: str, size: float, width: float) -> list[str]:
    """Greedy wrap on measured widths, so lines actually fit the column."""
    out, line = [], ""
    for word in s.split():
        trial = f"{line} {word}".strip()
        if line and text_width(trial, font, size) > width:
            out.append(line)
            line = word
            # A single word longer than the column is broken rather than left
            # to run off the page — account ids and hashes do this.
            while text_width(line, font, size) > width and len(line) > 1:
                cut = len(line) - 1
                while cut > 1 and text_width(line[:cut], font, size) > width:
                    cut -= 1
                out.append(line[:cut])
                line = line[cut:]
        else:
            line = trial
    if line:
        out.append(line)
    return out or [""]


def _esc(s: str) -> str:
    """PDF string escaping, and anything non-Latin-1 replaced rather than
    raising — a report should not fail to render over one stray glyph."""
    s = s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    return s.encode("latin-1", "replace").decode("latin-1")


@dataclass
class Page:
    ops: list[str] = field(default_factory=list)


class Document:
    """Accumulates content, flowing onto a new page when the cursor runs out."""

    def __init__(self, size=A4, margin: float = 56.0, footer: str = ""):
        self.w, self.h = size
        self.margin = margin
        self.footer = footer
        self.col = self.w - 2 * margin
        self.pages: list[Page] = []
        self.y = 0.0
        self._new_page()

    # ── page handling ────────────────────────────────────────────────
    def _new_page(self) -> None:
        self.pages.append(Page())
        self.y = self.h - self.margin

    def _room(self, need: float) -> None:
        # The running footer is drawn below the margin line, so content may use
        # the margin itself; only a small gutter is held back.
        if self.y - need < self.margin + 6:
            self._new_page()

    # ── drawing ──────────────────────────────────────────────────────
    def _txt(self, s: str, x: float, y: float, font: str, size: float,
             rgb=(0.09, 0.11, 0.12), spacing: float = 0.0) -> None:
        r, g, b = rgb
        # Tc is text *state* and survives BT/ET, so it is always written —
        # emitting it only when non-zero let one letter-spaced label leak its
        # tracking into every paragraph that followed it.
        op = (f"BT /{FONTS[font]} {size:.2f} Tf {r:.3f} {g:.3f} {b:.3f} rg "
              f"{spacing:.2f} Tc {x:.2f} {y:.2f} Td ({_esc(s)}) Tj ET")
        self.pages[-1].ops.append(op)

    def rule(self, rgb=(0.86, 0.89, 0.89), gap: float = 10.0, weight: float = 0.7) -> None:
        self._room(gap * 2)
        self.y -= gap
        r, g, b = rgb
        self.pages[-1].ops.append(
            f"{r:.3f} {g:.3f} {b:.3f} RG {weight} w {self.margin:.2f} {self.y:.2f} m "
            f"{self.w - self.margin:.2f} {self.y:.2f} l S"
        )
        self.y -= gap

    def band(self, rgb, height: float = 3.0) -> None:
        r, g, b = rgb
        self.pages[-1].ops.append(
            f"{r:.3f} {g:.3f} {b:.3f} rg {self.margin:.2f} {self.y:.2f} "
            f"{self.col:.2f} {height:.2f} re f"
        )
        self.y -= height + 14

    def label(self, s: str, rgb=(0.69, 0.22, 0.17), size: float = 8.0) -> None:
        self._room(size + 8)
        self.y -= size
        self._txt(s.upper(), self.margin, self.y, "Helvetica-Bold", size, rgb, spacing=1.1)
        self.y -= 8

    def heading(self, s: str, size: float = 22.0) -> None:
        for i, line in enumerate(wrap(s, "Helvetica-Bold", size, self.col)):
            self._room(size * 1.25)
            self.y -= size * (1.0 if i == 0 else 1.18)
            self._txt(line, self.margin, self.y, "Helvetica-Bold", size)
        self.y -= 6

    def subheading(self, s: str, size: float = 10.5) -> None:
        self._room(size * 3)
        self.y -= size * 2.1
        self._txt(s, self.margin, self.y, "Helvetica-Bold", size, (0.09, 0.11, 0.12),
                  spacing=0.4)
        self.y -= size * 0.55

    def para(self, s: str, size: float = 10.0, font: str = "Helvetica",
             rgb=(0.18, 0.22, 0.23), leading: float = 1.52,
             keep_together: bool = False) -> None:
        lines = wrap(s, font, size, self.col)
        # A short closing note broken across a page reads as truncated rather
        # than continued, so it can ask to move whole.
        if keep_together:
            self._room(len(lines) * size * leading)
        for line in lines:
            self._room(size * leading)
            self.y -= size * leading
            self._txt(line, self.margin, self.y, font, size, rgb)
        self.y -= size * 0.55

    def kv(self, rows: list[tuple[str, str]], size: float = 9.5) -> None:
        key_col = 150.0
        for k, v in rows:
            self._room(size * 2.2)
            self.y -= size * 1.75
            self._txt(k, self.margin, self.y, "Helvetica", size, (0.37, 0.41, 0.42))
            for i, line in enumerate(wrap(v, "Courier", size, self.col - key_col)):
                if i:
                    self.y -= size * 1.35
                self._txt(line, self.margin + key_col, self.y, "Courier", size)
        self.y -= 6

    # ── output ───────────────────────────────────────────────────────
    def render(self) -> bytes:
        n_pages = len(self.pages)
        objects: list[bytes] = []

        def add(body: bytes) -> int:
            objects.append(body)
            return len(objects)          # 1-based object number

        font_ids = {}
        for name, tag in FONTS.items():
            font_ids[tag] = add(
                b"<< /Type /Font /Subtype /Type1 /BaseFont /" + name.encode()
                + b" /Encoding /WinAnsiEncoding >>"
            )
        font_res = b" ".join(
            b"/" + tag.encode() + b" " + str(font_ids[tag]).encode() + b" 0 R"
            for tag in FONTS.values()
        )

        # Each page costs two objects (its content stream and the page
        # itself), so the Pages node lands right after them.
        pages_id = len(objects) + 2 * n_pages + 1
        page_ids, content_ids = [], []
        for i, page in enumerate(self.pages, start=1):
            ops = list(page.ops)
            if self.footer:
                ops.append(
                    f"BT /F1 7.50 Tf 0.62 0.66 0.67 rg {self.margin:.2f} "
                    f"{self.margin - 16:.2f} Td ({_esc(self.footer)}) Tj ET"
                )
            num = f"{i} / {n_pages}"
            ops.append(
                f"BT /F1 7.50 Tf 0.62 0.66 0.67 rg "
                f"{self.w - self.margin - text_width(num, 'Helvetica', 7.5):.2f} "
                f"{self.margin - 16:.2f} Td ({_esc(num)}) Tj ET"
            )
            stream = zlib.compress("\n".join(ops).encode("latin-1", "replace"))
            cid = add(b"<< /Length " + str(len(stream)).encode()
                      + b" /Filter /FlateDecode >>\nstream\n" + stream + b"\nendstream")
            content_ids.append(cid)
            page_ids.append(add(
                b"<< /Type /Page /Parent " + str(pages_id).encode()
                + b" 0 R /MediaBox [0 0 " + f"{self.w:.2f} {self.h:.2f}".encode()
                + b"] /Resources << /Font << " + font_res
                + b" >> >> /Contents " + str(cid).encode() + b" 0 R >>"
            ))

        kids = b" ".join(str(p).encode() + b" 0 R" for p in page_ids)
        actual_pages_id = add(b"<< /Type /Pages /Kids [" + kids + b"] /Count "
                              + str(n_pages).encode() + b" >>")
        # The page objects were written with a predicted parent id; if the
        # prediction is off the file is broken in a way readers report only as
        # "damaged", so it is asserted rather than hoped for.
        assert actual_pages_id == pages_id, (actual_pages_id, pages_id)
        catalog_id = add(b"<< /Type /Catalog /Pages " + str(pages_id).encode() + b" 0 R >>")

        out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for i, body in enumerate(objects, start=1):
            offsets.append(len(out))
            out += str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n"

        xref_at = len(out)
        out += b"xref\n0 " + str(len(objects) + 1).encode() + b"\n"
        out += b"0000000000 65535 f \n"
        for off in offsets[1:]:
            out += f"{off:010d} 00000 n \n".encode()
        out += (b"trailer\n<< /Size " + str(len(objects) + 1).encode()
                + b" /Root " + str(catalog_id).encode() + b" 0 R >>\nstartxref\n"
                + str(xref_at).encode() + b"\n%%EOF\n")
        return bytes(out)
