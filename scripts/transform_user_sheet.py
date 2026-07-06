#!/usr/bin/env python3
"""Download a Google Sheet URL and flatten a Level-3 substation log to CSV."""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from sheet_utils import (
    build_l3_headers,
    download_xlsx,
    extract_l3_rows,
    get_substation_title,
    load_workbook_from_bytes,
    parse_date_value,
    parse_spreadsheet_url,
    resolve_sheet,
)

DEFAULT_URL = (
    "https://docs.google.com/spreadsheets/d/1UtdhAjuTXVnnz9DvPc20q78UXhCN9kr6ojOwKWiY1Bk"
    "/edit?gid=797457552"
)


def transformer_mva_columns(headers: list[str]) -> list[str]:
    return [h for h in headers if h.startswith("T/F T")]


def sum_numeric(values: list[object]) -> float | None:
    nums = [v for v in values if isinstance(v, (int, float))]
    return round(sum(nums), 2) if nums else None


def transform(url: str, output: Path, cache_dir: Path) -> None:
    spreadsheet_id, gid = parse_spreadsheet_url(url)
    content = download_xlsx(spreadsheet_id, gid, cache_dir=cache_dir)
    xlsx_path = output.with_suffix(".xlsx")
    xlsx_path.write_bytes(content)

    workbook = load_workbook_from_bytes(content)
    worksheet = resolve_sheet(workbook, gid)

    log_date = parse_date_value(worksheet.cell(1, 1).value)
    substation = get_substation_title(worksheet)
    headers = build_l3_headers(worksheet)
    rows = extract_l3_rows(worksheet, headers)
    tf_cols = transformer_mva_columns(headers)

    for row in rows:
        row["log_date"] = log_date.isoformat() if log_date else str(worksheet.cell(1, 1).value)
        row["substation"] = substation
        row["total_mva"] = sum_numeric([row.get(col) for col in tf_cols])

    out_cols = ["log_date", "substation", "time"] + [h for h in headers if h != "Time"] + ["total_mva"]
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=out_cols, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    bus_col = "VOLTAGE | 220 kV Bus I & II"
    voltages = [
        row[bus_col]
        for row in rows
        if isinstance(row.get(bus_col), (int, float))
    ]
    mvas = [row["total_mva"] for row in rows if row.get("total_mva") is not None]

    print(f"Saved XLSX: {xlsx_path}")
    print(f"Saved CSV:  {output}")
    print(f"Sheet:      {worksheet.title}")
    print(f"Substation: {substation}")
    print(f"Log date:   {log_date}")
    print(f"Rows:       {len(rows)} hourly records, {len(out_cols)} columns")
    if voltages:
        print(
            f"220kV Bus:  min={min(voltages)}, max={max(voltages)}, "
            f"avg={sum(voltages) / len(voltages):.1f}"
        )
    if mvas:
        print(
            f"Total MVA:  min={min(mvas)}, max={max(mvas)}, "
            f"avg={sum(mvas) / len(mvas):.1f}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "data" / "palla_220kv_transformed.csv",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=PROJECT_ROOT / "data" / "cache",
    )
    args = parser.parse_args()
    transform(args.url, args.output, args.cache_dir)


if __name__ == "__main__":
    main()
