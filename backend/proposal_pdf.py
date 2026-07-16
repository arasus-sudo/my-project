"""PDF serializer — a real, text-selectable PDF via reportlab.

The old proposal PDF was one rasterised screenshot per slide: no selectable text,
no copy-paste, huge files. This builds the PDF from the same section model as the
DOCX, so the text is a real text layer and the pricing section is a laid-out table.
"""

import io
from typing import Any, Dict, List

from proposal_docx import html_to_blocks, _money


def build_pdf(proposal: Dict[str, Any]) -> bytes:
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem,
    )
    from reportlab.lib.enums import TA_RIGHT

    styles = getSampleStyleSheet()
    ink = colors.HexColor("#141414")
    muted = colors.HexColor("#6B6B6B")

    h_title = ParagraphStyle("PTitle", parent=styles["Title"], textColor=ink, fontSize=24, spaceAfter=4)
    h_sub = ParagraphStyle("PSub", parent=styles["Normal"], textColor=muted, fontSize=11, spaceAfter=18)
    h_sec = ParagraphStyle("PSec", parent=styles["Heading1"], textColor=ink, fontSize=15, spaceBefore=16, spaceAfter=6)
    body = ParagraphStyle("PBody", parent=styles["Normal"], fontSize=10.5, leading=15, spaceAfter=7)
    body_muted = ParagraphStyle("PBodyMuted", parent=body, textColor=muted)
    right = ParagraphStyle("PRight", parent=body, alignment=TA_RIGHT, spaceAfter=0)

    def inline(runs) -> str:
        out = []
        for text, bold, italic in runs:
            t = (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            if t == "\n":
                out.append("<br/>")
                continue
            if bold:
                t = f"<b>{t}</b>"
            if italic:
                t = f"<i>{t}</i>"
            out.append(t)
        return "".join(out)

    story: List[Any] = [Paragraph(proposal.get("topic", "Proposal"), h_title)]
    client = (proposal.get("client_facts") or {}).get("company")
    if client:
        story.append(Paragraph(f"Prepared for {client}", h_sub))
    else:
        story.append(Spacer(1, 12))

    for section in proposal.get("sections", []):
        story.append(Paragraph(section.get("heading", ""), h_sec))

        if section.get("slot") == "pricing_table":
            story += _pricing_flowables(proposal.get("pricing") or {}, body, right)
            for blk in html_to_blocks(section.get("html", "")):
                story.append(Paragraph(inline(blk.runs), body))
            continue

        blocks = html_to_blocks(section.get("html", ""))
        if not blocks:
            story.append(Paragraph("[needs input]", body_muted))
            continue

        bullets: List[Any] = []
        for blk in blocks:
            if blk.kind == "bullet":
                bullets.append(ListItem(Paragraph(inline(blk.runs), body), leftIndent=12))
            else:
                if bullets:
                    story.append(ListFlowable(bullets, bulletType="bullet", start="•"))
                    bullets = []
                story.append(Paragraph(inline(blk.runs), body))
        if bullets:
            story.append(ListFlowable(bullets, bulletType="bullet", start="•"))

    buf = io.BytesIO()
    SimpleDocTemplate(
        buf, pagesize=LETTER, topMargin=0.9 * inch, bottomMargin=0.9 * inch,
        leftMargin=0.9 * inch, rightMargin=0.9 * inch,
        title=proposal.get("topic", "Proposal"),
    ).build(story)
    return buf.getvalue()


def _pricing_flowables(pricing: Dict[str, Any], body, right):
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle, Paragraph, Spacer

    line_items = pricing.get("line_items") or []
    if not line_items:
        return [Paragraph("[needs input: add items to your pricing catalog]", body)]

    cur = pricing.get("currency", "USD")
    data = [["Item", "Qty", "Unit price", "Amount"]]
    for li in line_items:
        name = li["name"] + (f"\n{li['description']}" if li.get("description") else "")
        data.append([name, str(li["qty"]), _money(li["unit_price"], cur), _money(li["line_total"], cur)])

    data.append(["", "", "Subtotal", _money(pricing.get("subtotal", 0), cur)])
    if pricing.get("discount"):
        data.append(["", "", f"Discount ({pricing.get('discount_pct', 0):g}%)",
                     _money(-pricing["discount"], cur)])
    data.append(["", "", "Total", _money(pricing.get("total", 0), cur)])

    n_totals = 2 + (1 if pricing.get("discount") else 0)
    last = len(data) - 1
    t = Table(data, colWidths=[250, 45, 90, 90])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#141414")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#141414")),
        ("LINEABOVE", (2, last - n_totals + 1), (-1, last - n_totals + 1), 0.5, colors.HexColor("#E5E3DF")),
        ("FONTNAME", (2, last), (-1, last), "Helvetica-Bold"),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
    ]))
    return [t, Spacer(1, 10)]
