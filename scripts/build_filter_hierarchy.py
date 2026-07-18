"""Build FILTER_HIERARCHY JSON from SUB_STATION List.xlsx."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

import openpyxl

SRC = Path(r"c:\Users\arunr\OneDrive\Desktop\SUB_STATION List.xlsx")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "filter-hierarchy.json"
OUT_JS = ROOT / "filter-hierarchy-data.js"


def slug(text: str, prefix: str = "") -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", str(text).strip().lower()).strip("-")
    return f"{prefix}{s}" if prefix else s


def voltage_value(raw: str) -> str:
    if not raw:
        return ""
    m = re.search(r"(\d+)", str(raw))
    return m.group(1) if m else str(raw).strip()


def main() -> None:
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    data = rows[1:]

    tree: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    volts: set[str] = set()

    for r in data:
        if not r or r[0] is None:
            continue
        z, c, d, s, code, v = [None if x is None else str(x).strip() for x in r[:6]]
        if not all([z, c, d, s]):
            continue
        vv = voltage_value(v or "")
        if vv:
            volts.add(vv)
        key = str(code) if code else slug(s, "ss-")
        tree[z][c][d][key] = {
            "name": s,
            "code": str(code) if code else "",
            "voltage": vv,
        }

    hierarchy: dict = {}
    for z_name in sorted(tree):
        z_key = slug(z_name, "zone-")
        circles = {}
        for c_name in sorted(tree[z_name]):
            c_key = slug(c_name, "circle-")
            divisions = {}
            for d_name in sorted(tree[z_name][c_name]):
                d_key = slug(d_name, "div-")
                substations = {}
                for ss_key, ss in sorted(
                    tree[z_name][c_name][d_name].items(),
                    key=lambda item: item[1]["name"].lower(),
                ):
                    substations[ss_key] = ss
                divisions[d_key] = {"label": d_name, "substations": substations}
            circles[c_key] = {"label": c_name, "divisions": divisions}
        hierarchy[z_key] = {"label": z_name, "circles": circles}

    payload = {
        "voltageLevels": [
            {"value": "all", "label": "All"},
            *[{"value": v, "label": f"{v} kV"} for v in sorted(volts, key=lambda x: int(x) if x.isdigit() else x, reverse=True)],
        ],
        "hierarchy": hierarchy,
        "defaults": {
            "zone": next(iter(hierarchy)),
            "circle": next(iter(next(iter(hierarchy.values()))["circles"])),
            "division": next(
                iter(
                    next(iter(next(iter(hierarchy.values()))["circles"].values()))[
                        "divisions"
                    ]
                )
            ),
            "substation": next(
                iter(
                    next(
                        iter(
                            next(
                                iter(next(iter(hierarchy.values()))["circles"].values())
                            )["divisions"].values()
                        )
                    )["substations"]
                )
            ),
            "voltageLevel": "all",
        },
    }

    # Fix defaults to first alphabetical path consistently
    z0 = sorted(hierarchy)[0]
    c0 = sorted(hierarchy[z0]["circles"])[0]
    d0 = sorted(hierarchy[z0]["circles"][c0]["divisions"])[0]
    s0 = sorted(
        hierarchy[z0]["circles"][c0]["divisions"][d0]["substations"],
        key=lambda k: hierarchy[z0]["circles"][c0]["divisions"][d0]["substations"][k][
            "name"
        ].lower(),
    )[0]
    payload["defaults"] = {
        "zone": z0,
        "circle": c0,
        "division": d0,
        "substation": s0,
        "voltageLevel": "all",
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_JS.write_text(
        "window.FILTER_HIERARCHY_DATA = "
        + json.dumps(payload, ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )
    public_js = ROOT / "public" / "filter-hierarchy-data.js"
    if public_js.parent.exists():
        public_js.write_text(OUT_JS.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"Wrote {OUT_JS}")
    print("zones", len(hierarchy))
    print("voltages", payload["voltageLevels"])
    print("defaults", payload["defaults"])
    ss_count = sum(
        len(div["substations"])
        for zone in hierarchy.values()
        for circle in zone["circles"].values()
        for div in circle["divisions"].values()
    )
    print("substations", ss_count)


if __name__ == "__main__":
    main()
