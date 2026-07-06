# Google Sheets Consolidation — Setup

This tool flattens the 3-level nested Google Sheets hierarchy into a single CSV:

`Zone/Circle/Division` → `Date index` → `Hourly substation log`

## Discovered schema

| Level | Sheet | Columns | Layout |
|-------|-------|---------|--------|
| 1 | [Division index](https://docs.google.com/spreadsheets/d/1DdfIfWczn0VQGW2BebJ__-mwXqyzdVJORM3SfbIbwC0/edit?gid=619238043) | `Zone`, `Circle`, `Division`, `Access Link` | 19 division rows with hyperlinks |
| 2 | Per-division spreadsheet | `Log Sheet Date`, `Access Link` | Dates in `DD.MM.YYYY` format |
| 3 | Per-date spreadsheet | ~123 columns, multi-row headers | 24 hourly rows per date (1:00–24:00) |

Run schema inspection anytime:

```bash
py -3 scripts/consolidate_sheets.py --inspect
```

## Prerequisites

- Python 3.10+
- Sheets must be **publicly readable** (or use the same Google account session when exporting)
- Network access to `docs.google.com`

## Install

```bash
py -3 -m pip install -r requirements.txt
```

## Quick test (recommended first)

Process 1 division and 2 recent dates:

```bash
py -3 scripts/consolidate_sheets.py --division-limit 1 --date-limit 2
```

Output:

- `data/consolidated_division_data_last2years.csv`
- `data/consolidation_errors.csv`

## Full run (last 2 years)

```bash
py -3 scripts/consolidate_sheets.py
```

This walks all 19 divisions, filters dates to the last 730 days, and downloads every linked detail sheet. Expect:

- ~14,000+ detail sheet downloads (cached after first run)
- ~300,000+ output rows (19 divisions × ~700 dates × 24 hours)
- Significant runtime on first run; cached re-runs are faster

Downloads are cached under `data/cache/`.

## CLI options

| Flag | Default | Description |
|------|---------|-------------|
| `--output` | `data/consolidated_division_data_last2years.csv` | Output CSV path |
| `--errors` | `data/consolidation_errors.csv` | Error log path |
| `--lookback-days` | `730` | Date window |
| `--division-limit` | none | Limit divisions (testing) |
| `--date-limit` | none | Limit dates per division (testing) |
| `--inspect` | off | Print discovered schema JSON |
| `--no-dedupe` | off | Keep duplicate rows |
| `--no-sort` | off | Skip final sort |

## Output columns

**Fixed columns (first):**

`zone`, `circle`, `division`, `substation_title`, `hierarchy_path`, `level1_row_index`, `date`, `time`, `level2_sheet_id`, `level2_gid`, `level3_sheet_id`, `level3_gid`

**Dynamic columns:** union of all Level 3 measurement/feeder fields (e.g. `VOLTAGE | 220 kV Bus I & II`, `FGPP CKT -II`, `Remarks`).

## Notes

- Hyperlinks are read from XLSX exports (no Google API credentials required for public sheets).
- Future dates beyond today are excluded.
- Each hour in a daily log becomes one consolidated row.
- Re-running overwrites the output CSV and rebuilds from cache where possible.

## Per-substation Excel export

For one workbook **per substation** (all tabs in each daily log file, last 2 years):

```bash
py -3 scripts/consolidate_by_substation.py --division-limit 1 --date-limit 2
```

Output layout:

- `data/substations/<Zone>/<Division>/<Substation>.xlsx`
- `data/substations/_staging/*.jsonl` (intermediate cache; safe to delete after success)
- `data/substation_consolidation_errors.csv`

Full run:

```bash
py -3 scripts/consolidate_by_substation.py
```

Rebuild Excel from staging without re-downloading:

```bash
py -3 scripts/consolidate_by_substation.py --from-staging
```

Use a local Level-1 master workbook:

```bash
py -3 scripts/consolidate_by_substation.py --level1 "C:\path\to\master.xlsx"
```

Columns written: `Zone`, `Circle`, `Division`, `Date`, `Substation`, `time`, plus all Level-3 log fields.

The pipeline prefers the **URL** column over **Access Link** when both exist. Level-3 workbooks are downloaded in full (all tabs) so every substation tab is included.
