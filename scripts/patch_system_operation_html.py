from pathlib import Path

INDEX = Path(__file__).resolve().parents[1] / "index.html"
text = INDEX.read_text(encoding="utf-8")

view_idx = text.index("view-system-operation")
target_idx = text.index('id="tl-avail-target"', view_idx)
kpi_start = text.rfind('<div class="kpi-card', view_idx, target_idx)
kpi_end = text.index('          <div class="grid-2 page-section so-top-grid">', target_idx)

new_kpi_tail = (
    '            <div class="kpi-card kpi-compact kpi-accent-teal">\n'
    '              <div class="kpi-compact-row">\n'
    '                <motion.div className="kpi-icon-wrap"><i data-lucide="target" class="h-4 w-4"></i></div>\n'
    '                <motion.div className="kpi-compact-body">\n'
    '                  <p class="kpi-label">Transmission Availability Target</p>\n'
    '                  <div class="kpi-compact-values"><p class="kpi-value" id="tl-avail-target">99.20%</p></div>\n'
    '                </div>\n'
    '              </div>\n'
    '            </div>\n'
)
new_kpi_tail = (
    new_kpi_tail
    .replace('<motion.div className="kpi-icon-wrap">', '<motion.div className="kpi-icon-wrap">')
    .replace('<motion.div className="kpi-icon-wrap">', '<div class="kpi-icon-wrap">')
    .replace('<motion.div className="kpi-compact-body">', '<div class="kpi-compact-body">')
)
# fix properly
new_kpi_tail = (
    '            <div class="kpi-card kpi-compact kpi-accent-teal">\n'
    '              <div class="kpi-compact-row">\n'
    '                <div class="kpi-icon-wrap"><i data-lucide="target" class="h-4 w-4"></i></div>\n'
    '                <div class="kpi-compact-body">\n'
    '                  <p class="kpi-label">Transmission Availability Target</p>\n'
    '                  <div class="kpi-compact-values"><p class="kpi-value" id="tl-avail-target">99.20%</p></div>\n'
    '                </div>\n'
    '              </div>\n'
    '            </div>\n'
)
text = text[:kpi_start] + new_kpi_tail + text[kpi_end:]

old_loss = (
    '          <div class="grid-2 page-section">\n'
    '            <div class="panel">\n'
    '              <div class="panel-header"><h3>Loss Mix</h3></div>\n'
    '              <div class="panel-body chart-container"><canvas id="tl-loss-mix-chart"></canvas></div>\n'
    '            </div>\n'
    '            <motion.div className="panel">\n'
    '              <div class="panel-header"><h3>Feeder-wise Loss</h3></div>\n'
    '              <div class="panel-body chart-container"><canvas id="tl-feeder-loss-chart"></canvas></div>\n'
    '            </div>\n'
    '          </div>'
)
old_loss = (
    '          <div class="grid-2 page-section">\n'
    '            <div class="panel">\n'
    '              <div class="panel-header"><h3>Loss Mix</h3></div>\n'
    '              <div class="panel-body chart-container"><canvas id="tl-loss-mix-chart"></canvas></div>\n'
    '            </div>\n'
    '            <div class="panel">\n'
    '              <div class="panel-header"><h3>Feeder-wise Loss</h3></div>\n'
    '              <div class="panel-body chart-container"><canvas id="tl-feeder-loss-chart"></canvas></motion.div>\n'
    '            </div>\n'
    '          </div>'
)
old_loss = (
    '          <div class="grid-2 page-section">\n'
    '            <motion.div className="panel">\n'
    '              <div class="panel-header"><h3>Loss Mix</h3></div>\n'
    '              <div class="panel-body chart-container"><canvas id="tl-loss-mix-chart"></canvas></div>\n'
    '            </div>\n'
    '            <div class="panel">\n'
    '              <div class="panel-header"><h3>Feeder-wise Loss</h3></div>\n'
    '              <div class="panel-body chart-container"><canvas id="tl-feeder-loss-chart"></canvas></div>\n'
    '            </div>\n'
    '          </div>'
)
# FINAL clean old_loss
old_loss = (
    '          <div class="grid-2 page-section">\n'
    '            <div class="panel">\n'
    '              <div class="panel-header"><h3>Loss Mix</h3></div>\n'
    '              <div class="panel-body chart-container"><canvas id="tl-loss-mix-chart"></canvas></div>\n'
    '            </div>\n'
    '            <div class="panel">\n'
    '              <div class="panel-header"><h3>Feeder-wise Loss</h3></div>\n'
    '              <div class="panel-body chart-container"><canvas id="tl-feeder-loss-chart"></canvas></div>\n'
    '            </div>\n'
    '          </div>'
)
new_loss = (
    '          <div class="page-section">\n'
    '            <div class="panel">\n'
    '              <div class="panel-header"><h3>Loss Mix</h3></div>\n'
    '              <div class="panel-body chart-container so-loss-mix-chart"><canvas id="tl-loss-mix-chart"></canvas></div>\n'
    '            </div>\n'
    '          </div>'
)
assert old_loss in text, 'loss grid missing'
text = text.replace(old_loss, new_loss)

old_region = (
    '            <div class="panel">\n'
    '              <div class="panel-header"><h3>Region-wise Loss</h3></div>\n'
    '              <div class="panel-body chart-container"><canvas id="tl-region-loss-chart"></canvas></div>\n'
    '            </div>'
)
new_region = (
    '            <div class="panel">\n'
    '              <div class="panel-header"><h3>Zone &amp; Circle Loss</h3></div>\n'
    '              <div class="panel-body so-geo-loss-body">\n'
    '                <div class="so-geo-loss-block">\n'
    '                  <h4 class="so-geo-loss-title">Zone-wise</h4>\n'
    '                  <motion.div className="chart-container so-geo-chart"><canvas id="tl-zone-loss-chart"></canvas></motion.div>\n'
    '                </div>\n'
    '                <div class="so-geo-loss-block">\n'
    '                  <h4 class="so-geo-loss-title">Circle-wise</h4>\n'
    '                  <div class="chart-container so-geo-chart so-geo-chart--tall"><canvas id="tl-circle-loss-chart"></canvas></div>\n'
    '                </div>\n'
    '              </div>\n'
    '            </div>'
)
new_region = new_region.replace(
    '<motion.div className="chart-container so-geo-chart"><canvas id="tl-zone-loss-chart"></canvas></motion.div>',
    '<div class="chart-container so-geo-chart"><canvas id="tl-zone-loss-chart"></canvas></div>',
)
assert old_region in text, 'region block missing'
text = text.replace(old_region, new_region)

text = text.replace(
    '                    <th>Area</th>\n'
    '                    <th>Technical</th>\n'
    '                    <th>Non-Technical</th>\n'
    '                    <th>Total</th>\n'
    '                    <th>Priority</th>',
    '                    <th>Zone</th>\n'
    '                    <th>Circle</th>\n'
    '                    <th>Loss %</th>\n'
    '                    <th>Priority</th>',
)

INDEX.write_text(text, encoding="utf-8")
print('patched', INDEX)
