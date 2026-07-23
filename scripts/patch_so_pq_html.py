from pathlib import Path

INDEX = Path(__file__).resolve().parents[1] / "index.html"
text = INDEX.read_text(encoding="utf-8")

pq_header = text.index('                <h3>Power Quality</h3>')
start = text.rfind('              <motion.div className="panel-header">', text.index('view-system-operation'), pq_header)
if start == -1:
    start = text.rfind('              <div class="panel-header">', text.index('view-system-operation'), pq_header)
old_block_end = text.index('          <div class="page-section">', start)

new_block = (
    '              <div class="panel-header">\n'
    '                <h3>Power Quality</h3>\n'
    '              </div>\n'
    '              <div class="panel-body">\n'
    '                <div class="pq-grid pq-grid--compact so-pq-grid">\n'
    '                  <div class="pq-metric">\n'
    '                    <div class="pq-gauge-wrap pq-gauge-wrap--sm"><canvas id="pq-active-gauge"></canvas></div>\n'
    '                    <p class="pq-label">Active Power</p>\n'
    '                    <p class="pq-value" id="pq-active-value">142.5 MW</p>\n'
    '                  </div>\n'
    '                  <div class="pq-metric">\n'
    '                    <div class="pq-gauge-wrap pq-gauge-wrap--sm"><canvas id="pq-reactive-gauge"></canvas></div>\n'
    '                    <p class="pq-label">Reactive Power</p>\n'
    '                    <p class="pq-value" id="pq-reactive-value">68.9 MVAR</p>\n'
    '                  </div>\n'
    '                  <motion.div className="pq-metric">\n'
    '                    <div class="pq-gauge-wrap pq-gauge-wrap--sm"><canvas id="pq-vband-gauge"></canvas></div>\n'
    '                    <p class="pq-label">Voltage Band Compliance</p>\n'
    '                    <p class="pq-value" id="pq-vband-value">98.2%</p>\n'
    '                  </div>\n'
    '                </div>\n'
    '              </div>\n'
    '            </div>\n'
    '          </div>\n\n'
)
new_block = new_block.replace('<motion.div className="pq-metric">', '<div class="pq-metric">')

text = text[:start] + new_block + text[old_block_end:]

loss_mix = (
    '          <div class="page-section">\n'
    '            <div class="panel">\n'
    '              <div class="panel-header"><h3>Loss Mix</h3></div>\n'
    '              <div class="panel-body chart-container so-loss-mix-chart"><canvas id="tl-loss-mix-chart"></canvas></div>\n'
    '            </div>\n'
    '          </div>\n\n'
)
text = text.replace(loss_mix, '')

old_monthly = (
    '            <div class="panel">\n'
    '              <div class="panel-header"><h3>Monthly Loss Trend</h3></div>\n'
    '              <div class="panel-body chart-container"><canvas id="tl-monthly-trend-chart"></canvas></div>\n'
    '            </div>'
)
new_monthly = (
    '            <div class="panel so-monthly-loss-panel">\n'
    '              <div class="panel-header"><h3>Monthly Loss Trend</h3></div>\n'
    '              <div class="panel-body so-monthly-loss-body">\n'
    '                <div class="chart-container so-monthly-loss-chart"><canvas id="tl-monthly-trend-chart"></canvas></div>\n'
    '              </div>\n'
    '            </div>'
)
text = text.replace(old_monthly, new_monthly)

INDEX.write_text(text, encoding='utf-8')
print('patched', INDEX)
