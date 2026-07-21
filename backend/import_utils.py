"""Shared CSV/XLSX row-parsing helpers for every bulk-import feature in the
suite (Social EQ's content-brief importer, CRM's lead/list importer, and any
future one). Extracted from social_eq.py so the parsing logic exists in
exactly one place.
"""

import csv
import io
from datetime import datetime, timezone
from typing import Dict, List, Optional


def _parse_rows(raw: bytes, filename: str) -> List[Dict[str, str]]:
    filename = (filename or "").lower()
    if filename.endswith(".xlsx"):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        rows_iter = ws.iter_rows(values_only=True)
        headers = [str(h or "").strip().lower() for h in next(rows_iter, [])]
        out = []
        for row in rows_iter:
            if not any(row):
                continue
            out.append({headers[i]: ("" if v is None else str(v)) for i, v in enumerate(row) if i < len(headers)})
        return out
    # default: CSV (utf-8-sig strips a BOM Excel likes to add)
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return [{(k or "").strip().lower(): (v or "").strip() for k, v in row.items()} for row in reader]


def _parse_date(value: str) -> Optional[str]:
    value = (value or "").strip()
    if not value:
        return None
    try:
        from dateutil import parser as dateutil_parser
        dt = dateutil_parser.parse(value)
    except Exception:
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d %H:%M"):
            try:
                dt = datetime.strptime(value, fmt)
                break
            except ValueError:
                continue
        else:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()
