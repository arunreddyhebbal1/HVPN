from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

D4_BLOCK = """          <motion.div class="panel">
            <div class="panel-header"><h3>D4 — Maintenance Cost Analytics</h3></div>
            <div class="panel-body chart-container-lg"><canvas id="maint-cost-chart"></canvas></div>
          </div>
"""


def patch(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    changed = False

    actual = """          <div class="panel">
            <div class="panel-header"><h3>D4 — Maintenance Cost Analytics</h3></div>
            <div class="panel-body chart-container-lg"><canvas id="maint-cost-chart"></canvas></div>
          </div>
"""

    if actual in text:
        text = text.replace(actual, "", 1)
        changed = True

    if 'grid-5" id="reliability-kpis"' in text:
        text = text.replace('grid-5" id="reliability-kpis"', 'grid-4" id="reliability-kpis"', 1)
        changed = True

    if changed:
        path.write_text(text, encoding="utf-8")
        print(f"Patched {path.name}")
    else:
        print(f"No changes for {path.name}")


for name in ("index.html", "public/index.html"):
    patch(ROOT / name)
