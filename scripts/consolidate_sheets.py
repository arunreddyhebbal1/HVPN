#!/usr/bin/env python3
"""
Flatten a 3-level nested Google Sheets hierarchy into one consolidated CSV.

Level 1: division hierarchy index (hyperlinks to per-division date sheets)
Level 2: date index sheets (hyperlinks to per-date detail sheets)
Level 3: hourly substation log sheets
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, TextIO

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "consolidated_division_data_last2years.csv"
DEFAULT_ERRORS = PROJECT_ROOT / "data" / "consolidation_errors.csv"
DEFAULT_CACHE = PROJECT_ROOT / "data" / "cache"

from sheet_utils import (
    FIXED_COLUMNS,
    LEVEL1_GID,
    LEVEL1_SPREADSHEET_ID,
    build_l3_headers,
    download_xlsx,
    extract_l3_rows,
    get_substation_title,
    is_blank_hierarchy_row,
    load_workbook_from_bytes,
    lookback_bounds,
    parse_date_value,
    parse_spreadsheet_url,
    resolve_sheet,
    resolve_source_url,
    resolve_url_column,
)


@dataclass
class ErrorRecord:
    level1_row_index: int | str
    hierarchy_path: str
    date: str
    url: str
    error: str


@dataclass
class RunStats:
    level1_rows_processed: int = 0
    level2_dates_found: int = 0
    level2_dates_in_range: int = 0
    level3_records_extracted: int = 0
    rows_written: int = 0
    errors: list[ErrorRecord] = field(default_factory=list)


def find_link_column(headers: list[Any]) -> int:
    """Return 1-based index of the access-link column."""
    for idx, header in enumerate(headers, start=1):
        text = str(header or "").strip().lower()
        if "access link" in text or text == "link":
            return idx
    return len(headers)


def find_date_column(headers: list[Any]) -> int:
    for idx, header in enumerate(headers, start=1):
        text = str(header or "").strip().lower()
        if "date" in text:
            return idx
    return 1


def hierarchy_values(row: list[Any]) -> tuple[str, str, str]:
    # Level 1 layout: index, Zone, Circle, Division, Access Link
    zone = str(row[1] or "").strip() if len(row) > 1 else ""
    circle = str(row[2] or "").strip() if len(row) > 2 else ""
    division = str(row[3] or "").strip() if len(row) > 3 else ""
    return zone, circle, division


def hierarchy_path(zone: str, circle: str, division: str) -> str:
    return " > ".join(part for part in (zone, circle, division) if part)


def inspect_schema(cache_dir: Path) -> dict[str, Any]:
    """Download sample sheets and report discovered columns."""
    content = download_xlsx(LEVEL1_SPREADSHEET_ID, LEVEL1_GID, cache_dir=cache_dir)
    l1_wb = load_workbook_from_bytes(content, data_only=False)
    l1_ws = resolve_sheet(l1_wb, LEVEL1_GID)
    l1_headers = [l1_ws.cell(1, col).value for col in range(1, (l1_ws.max_column or 0) + 1)]
    l1_rows = max((l1_ws.max_row or 1) - 1, 0)

    sample_link = None
    link_col = resolve_url_column(l1_headers)
    for row_idx in range(2, (l1_ws.max_row or 1) + 1):
        url = resolve_source_url(l1_ws.cell(row_idx, link_col))
        if url:
            sample_link = url
            break
    if not sample_link:
        raise RuntimeError("Could not find a Level 1 hyperlink for inspection.")

    l2_id, l2_gid = parse_spreadsheet_url(sample_link)
    l2_content = download_xlsx(l2_id, l2_gid, cache_dir=cache_dir)
    l2_wb = load_workbook_from_bytes(l2_content, data_only=False)
    l2_ws = resolve_sheet(l2_wb, l2_gid)
    l2_headers = [l2_ws.cell(1, col).value for col in range(1, (l2_ws.max_column or 0) + 1)]
    l2_rows = max((l2_ws.max_row or 1) - 1, 0)

    date_col = find_date_column(l2_headers)
    link_col_l2 = resolve_url_column(l2_headers)
    sample_l3 = None
    for row_idx in range(2, (l2_ws.max_row or 1) + 1):
        url = resolve_source_url(l2_ws.cell(row_idx, link_col_l2))
        if url:
            sample_l3 = (parse_date_value(l2_ws.cell(row_idx, date_col).value), url)
            break
    if not sample_l3:
        raise RuntimeError("Could not find a Level 2 hyperlink for inspection.")

    l3_id, l3_gid = parse_spreadsheet_url(sample_l3[1])
    l3_content = download_xlsx(l3_id, l3_gid, cache_dir=cache_dir)
    l3_wb = load_workbook_from_bytes(l3_content, data_only=True)
    l3_ws = resolve_sheet(l3_wb, l3_gid)
    l3_headers = build_l3_headers(l3_ws)
    l3_rows = len(extract_l3_rows(l3_ws, l3_headers))

    return {
        "level1": {
            "spreadsheet_id": LEVEL1_SPREADSHEET_ID,
            "gid": LEVEL1_GID,
            "columns": l1_headers,
            "row_count": l1_rows,
            "layout": "row-oriented index with Access Link hyperlinks",
        },
        "level2": {
            "spreadsheet_id": l2_id,
            "gid": l2_gid,
            "columns": l2_headers,
            "row_count": l2_rows,
            "date_format": "DD.MM.YYYY",
            "layout": "row-oriented date index with Access Link hyperlinks",
        },
        "level3": {
            "spreadsheet_id": l3_id,
            "gid": l3_gid,
            "substation_title": get_substation_title(l3_ws),
            "column_count": len(l3_headers),
            "sample_columns": l3_headers[:15],
            "hourly_rows_per_date": l3_rows,
            "layout": "multi-row headers with one row per hour (1:00-24:00)",
        },
    }


def consolidate(
    *,
    output_csv: Path,
    errors_csv: Path,
    cache_dir: Path,
    lookback_days: int,
    division_limit: int | None,
    date_limit: int | None,
    dedupe: bool,
    request_delay: float,
) -> RunStats:
    stats = RunStats()
    written_keys: set[tuple[str, ...]] = set()
    jsonl_path = output_csv.with_suffix(output_csv.suffix + ".jsonl")
    lower_bound, upper_bound = lookback_bounds(lookback_days=lookback_days)

    content = download_xlsx(
        LEVEL1_SPREADSHEET_ID,
        LEVEL1_GID,
        cache_dir=cache_dir,
        request_delay=0,
    )
    l1_wb = load_workbook_from_bytes(content, data_only=False)
    l1_ws = resolve_sheet(l1_wb, LEVEL1_GID)
    l1_headers = [l1_ws.cell(1, col).value for col in range(1, (l1_ws.max_column or 0) + 1)]
    l1_link_col = resolve_url_column(l1_headers)

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    errors_csv.parent.mkdir(parents=True, exist_ok=True)
    jsonl_path.unlink(missing_ok=True)

    with errors_csv.open("w", newline="", encoding="utf-8") as err_file, jsonl_path.open(
        "w", encoding="utf-8"
    ) as jsonl_file:
        error_writer = csv.DictWriter(
            err_file,
            fieldnames=["level1_row_index", "hierarchy_path", "date", "url", "error"],
        )
        error_writer.writeheader()

        divisions_processed = 0
        for row_idx in range(2, (l1_ws.max_row or 1) + 1):
            if division_limit is not None and divisions_processed >= division_limit:
                break

            zone, circle, division = hierarchy_values(
                [l1_ws.cell(row_idx, col).value for col in range(1, (l1_ws.max_column or 0) + 1)]
            )
            path = hierarchy_path(zone, circle, division)
            l1_url = resolve_source_url(l1_ws.cell(row_idx, l1_link_col))
            if is_blank_hierarchy_row(zone, circle, division, l1_url):
                continue
            if not l1_url:
                log_error(
                    error_writer,
                    err_file,
                    stats,
                    row_idx,
                    path,
                    "",
                    "",
                    "Missing Level 1 hyperlink",
                )
                continue

            stats.level1_rows_processed += 1
            divisions_processed += 1
            print(
                f"[L1 {divisions_processed}] {path}",
                flush=True,
            )

            try:
                l2_id, l2_gid = parse_spreadsheet_url(l1_url)
                l2_content = download_xlsx(
                    l2_id,
                    l2_gid,
                    cache_dir=cache_dir,
                    request_delay=request_delay,
                )
                l2_wb = load_workbook_from_bytes(l2_content, data_only=False)
                l2_ws = resolve_sheet(l2_wb, l2_gid)
                l2_headers = [
                    l2_ws.cell(1, col).value for col in range(1, (l2_ws.max_column or 0) + 1)
                ]
                date_col = find_date_column(l2_headers)
                l2_link_col = resolve_url_column(l2_headers)
            except Exception as exc:
                log_error(error_writer, err_file, stats, row_idx, path, "", l1_url, str(exc))
                continue

            dates_processed = 0
            # Dates are chronological; iterate newest-first and stop once too old.
            for l2_row_idx in range(l2_ws.max_row or 1, 1, -1):
                if date_limit is not None and dates_processed >= date_limit:
                    break

                raw_date = l2_ws.cell(l2_row_idx, date_col).value
                parsed_date = parse_date_value(raw_date)
                if parsed_date is None:
                    continue

                stats.level2_dates_found += 1
                if parsed_date < lower_bound:
                    break
                if parsed_date > upper_bound:
                    continue

                stats.level2_dates_in_range += 1

                l2_url = resolve_source_url(l2_ws.cell(l2_row_idx, l2_link_col))
                if not l2_url:
                    log_error(
                        error_writer,
                        err_file,
                        stats,
                        row_idx,
                        path,
                        parsed_date.isoformat(),
                        "",
                        "Missing Level 2 hyperlink",
                    )
                    continue

                dates_processed += 1
                try:
                    l3_id, l3_gid = parse_spreadsheet_url(l2_url)
                    l3_content = download_xlsx(
                        l3_id,
                        l3_gid,
                        cache_dir=cache_dir,
                        request_delay=request_delay,
                    )
                    l3_wb = load_workbook_from_bytes(l3_content, data_only=True)
                    l3_ws = resolve_sheet(l3_wb, l3_gid)
                    substation_title = get_substation_title(l3_ws)
                    l3_headers = build_l3_headers(l3_ws)
                    detail_rows = extract_l3_rows(l3_ws, l3_headers)
                except Exception as exc:
                    log_error(
                        error_writer,
                        err_file,
                        stats,
                        row_idx,
                        path,
                        parsed_date.isoformat(),
                        l2_url,
                        str(exc),
                    )
                    continue

                if dates_processed % 25 == 0:
                    print(
                        f"  dates {dates_processed} | rows {stats.rows_written} | errors {len(stats.errors)}",
                        flush=True,
                    )

                for detail in detail_rows:
                    stats.level3_records_extracted += 1
                    if dedupe:
                        dedupe_key = (
                            path,
                            parsed_date.isoformat(),
                            str(detail.get("time", "")),
                            *(
                                str(detail.get(col, ""))
                                for col in sorted(detail)
                                if col != "time"
                            ),
                        )
                        if dedupe_key in written_keys:
                            log_error(
                                error_writer,
                                err_file,
                                stats,
                                row_idx,
                                path,
                                parsed_date.isoformat(),
                                l2_url,
                                "Duplicate row skipped",
                            )
                            continue
                        written_keys.add(dedupe_key)

                    output_row: dict[str, Any] = {
                        "zone": zone,
                        "circle": circle,
                        "division": division,
                        "substation_title": substation_title or "",
                        "hierarchy_path": path,
                        "level1_row_index": row_idx,
                        "date": parsed_date.isoformat(),
                        "time": detail.get("time", ""),
                        "level2_sheet_id": l2_id,
                        "level2_gid": l2_gid if l2_gid is not None else "",
                        "level3_sheet_id": l3_id,
                        "level3_gid": l3_gid if l3_gid is not None else "",
                    }
                    for key, value in detail.items():
                        if key == "time":
                            continue
                        output_row[key] = value

                    jsonl_file.write(json.dumps(output_row, default=str) + "\n")
                    stats.rows_written += 1

    write_consolidated_csv_from_jsonl(jsonl_path, output_csv)
    return stats


def log_error(
    error_writer: csv.DictWriter,
    err_file: TextIO,
    stats: RunStats,
    level1_row_index: int | str,
    hierarchy_path: str,
    date_value: str,
    url: str,
    error: str,
) -> None:
    stats.errors.append(
        ErrorRecord(level1_row_index, hierarchy_path, date_value, url, error)
    )
    error_writer.writerow(
        {
            "level1_row_index": level1_row_index,
            "hierarchy_path": hierarchy_path,
            "date": date_value,
            "url": url,
            "error": error,
        }
    )
    err_file.flush()


def write_consolidated_csv_from_jsonl(jsonl_path: Path, output_csv: Path) -> None:
    """Convert streamed JSONL rows into a consolidated CSV."""
    if not jsonl_path.exists() or jsonl_path.stat().st_size == 0:
        output_csv.write_text("", encoding="utf-8")
        return

    rows: list[dict[str, Any]] = []
    with jsonl_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    write_consolidated_csv(output_csv, rows)


def write_consolidated_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    """Write consolidated rows with a stable union-of-columns schema."""
    if not rows:
        path.write_text("", encoding="utf-8")
        return

    dynamic_columns: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row:
            if key in FIXED_COLUMNS or key in seen:
                continue
            seen.add(key)
            dynamic_columns.append(key)

    fieldnames = FIXED_COLUMNS + dynamic_columns
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def sort_output_csv(path: Path) -> None:
    """Sort consolidated rows by date desc, then hierarchy path asc."""
    if not path.exists() or path.stat().st_size == 0:
        return
    with path.open("r", newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    rows.sort(key=lambda row: (row.get("hierarchy_path", ""), row.get("time", "")))
    rows.sort(key=lambda row: row.get("date", ""), reverse=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Consolidated CSV output path",
    )
    parser.add_argument(
        "--errors",
        type=Path,
        default=DEFAULT_ERRORS,
        help="Error log CSV output path",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=DEFAULT_CACHE,
        help="Directory for downloaded XLSX cache files",
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=730,
        help="Only include dates within this many days of today",
    )
    parser.add_argument(
        "--division-limit",
        type=int,
        default=None,
        help="Process only the first N Level 1 divisions (for testing)",
    )
    parser.add_argument(
        "--date-limit",
        type=int,
        default=None,
        help="Process only the first N in-range dates per division (for testing)",
    )
    parser.add_argument(
        "--inspect",
        action="store_true",
        help="Print discovered schema for all three levels and exit",
    )
    parser.add_argument(
        "--no-dedupe",
        action="store_true",
        help="Do not skip duplicate hierarchy/date/time rows",
    )
    parser.add_argument(
        "--no-sort",
        action="store_true",
        help="Skip final sort step",
    )
    parser.add_argument(
        "--request-delay",
        type=float,
        default=0.75,
        help="Seconds to wait before each sheet download (reduces Google rate limits)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.inspect:
        schema = inspect_schema(args.cache_dir)
        print(json.dumps(schema, indent=2))
        return 0

    print(
        f"Starting consolidation (lookback={args.lookback_days} days, "
        f"division_limit={args.division_limit}, date_limit={args.date_limit})"
    )
    stats = consolidate(
        output_csv=args.output,
        errors_csv=args.errors,
        cache_dir=args.cache_dir,
        lookback_days=args.lookback_days,
        division_limit=args.division_limit,
        date_limit=args.date_limit,
        dedupe=not args.no_dedupe,
        request_delay=args.request_delay,
    )

    if not args.no_sort:
        sort_output_csv(args.output)

    print("Run complete:")
    print(f"  Level 1 rows processed: {stats.level1_rows_processed}")
    print(f"  Level 2 dates found:    {stats.level2_dates_found}")
    print(f"  Level 2 dates in range: {stats.level2_dates_in_range}")
    print(f"  Level 3 records:        {stats.level3_records_extracted}")
    print(f"  Rows written:           {stats.rows_written}")
    print(f"  Errors logged:          {len(stats.errors)}")
    print(f"  Output:                 {args.output}")
    print(f"  Errors:                 {args.errors}")
    return 0 if stats.rows_written > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
