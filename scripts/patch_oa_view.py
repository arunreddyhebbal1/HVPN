from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

NEW_SECTION = r'''        <!-- TSA — OUTAGE ANALYTICS -->
        <section id="view-tsa-outage-analytics" class="view view-stack">

          <div class="oa-scope-banner panel page-section">
            <div class="oa-scope-banner-body">
              <p class="oa-scope-eyebrow">Active filter scope</p>
              <p class="oa-scope-text" id="oa-active-scope">All Zones · All Circles · Last 7 Days</p>
            </div>
            <p class="card__meta">Use the global filter bar above to change Zone, Circle, Division, Substation, Voltage, and Date range.</p>
          </div>

          <div class="oa-kpi-grid page-section">
            <div class="kpi-card kpi-compact oa-kpi-card" id="oa-kpi-tsa-card">
              <p class="kpi-label">Overall TSA</p>
              <p class="kpi-value" id="oa-kpi-tsa">99.62%</p>
              <p class="kpi-subtitle" id="oa-kpi-tsa-note">Portfolio weighted</p>
            </div>
            <div class="kpi-card kpi-compact oa-kpi-card" id="oa-kpi-target-card">
              <p class="kpi-label">HERC Target</p>
              <p class="kpi-value" id="oa-kpi-target">98.5%</p>
              <p class="kpi-subtitle" id="oa-kpi-gap">+1.12 pp gap</p>
            </div>
            <div class="kpi-card kpi-compact oa-kpi-card" id="oa-kpi-hours-card">
              <p class="kpi-label">Outage Hours</p>
              <p class="kpi-value" id="oa-kpi-total-hr">52.4 hr</p>
              <p class="kpi-subtitle" id="oa-kpi-net-hr">Net 48.1 hr · Effective 45.6 hr</p>
            </div>
            <div class="kpi-card kpi-compact oa-kpi-card" id="oa-kpi-tripping-card">
              <p class="kpi-label">Tripping</p>
              <p class="kpi-value" id="oa-kpi-tripping">18 · 24.6 hr</p>
              <p class="kpi-subtitle">Count · outage hours</p>
            </div>
            <div class="kpi-card kpi-compact oa-kpi-card" id="oa-kpi-breakdown-card">
              <p class="kpi-label">Breakdown</p>
              <p class="kpi-value" id="oa-kpi-breakdown">11 · 16.8 hr</p>
              <p class="kpi-subtitle">Count · outage hours</p>
            </div>
            <div class="kpi-card kpi-compact oa-kpi-card" id="oa-kpi-shutdown-card">
              <p class="kpi-label">Shutdown</p>
              <p class="kpi-value" id="oa-kpi-shutdown">9 · 11.0 hr</p>
              <p class="kpi-subtitle">Count · outage hours</p>
            </div>
            <div class="kpi-card kpi-compact oa-kpi-card" id="oa-kpi-planned-card">
              <p class="kpi-label">Planned</p>
              <p class="kpi-value" id="oa-kpi-planned">7 · 14.2 hr</p>
              <p class="kpi-subtitle" id="oa-kpi-unplanned">Unplanned 31 · 38.2 hr</p>
            </div>
          </div>

          <div class="oa-section page-section">
            <h3 class="oa-section-title">Regional Contribution &amp; Loss Analysis</h3>
            <div class="grid-2">
              <div class="panel oa-circle-premium">
                <div class="panel-header">
                  <div>
                    <h3>Outage Contribution &amp; TSA Impact</h3>
                    <p class="card__meta" id="oa-regional-scope">Grouped by Circle</p>
                  </div>
                  <div class="panel-header-actions oa-panel-actions">
                    <div class="tsa-register-tabs oa-level-tabs" role="tablist" aria-label="Regional grouping">
                      <button type="button" class="tsa-tab" data-oa-level="zone">Zone</button>
                      <button type="button" class="tsa-tab is-active" data-oa-level="circle">Circle</button>
                      <button type="button" class="tsa-tab" data-oa-level="division">Division</button>
                    </div>
                    <div class="oa-category-toggles" aria-label="Outage category filters">
                      <label class="oa-cat-toggle is-shutdown"><input type="checkbox" data-oa-cat="shutdown" checked> Shutdown</label>
                      <label class="oa-cat-toggle is-breakdown"><input type="checkbox" data-oa-cat="breakdown" checked> Breakdown</label>
                      <label class="oa-cat-toggle is-tripping"><input type="checkbox" data-oa-cat="tripping" checked> Tripping</label>
                    </div>
                    <div class="chart-toolbar">
                      <button type="button" class="btn btn-secondary btn-sm" id="oa-circle-refresh" title="Refresh view">
                        <i data-lucide="refresh-cw" class="h-4 w-4"></i>
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" id="oa-circle-export" title="Export summary">
                        <i data-lucide="download" class="h-4 w-4"></i>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="panel-body chart-container-lg oa-circle-chart-wrap">
                  <canvas id="tsa-outage-circle-chart" aria-label="Regional outage contribution chart"></canvas>
                </div>
              </div>
              <div class="panel">
                <div class="panel-header">
                  <div>
                    <h3>Waterfall Availability Loss</h3>
                    <p class="card__meta">100% nominal to actual TSA %</p>
                  </div>
                </div>
                <div class="panel-body chart-container-lg">
                  <canvas id="oa-waterfall-chart" aria-label="Waterfall availability loss chart"></canvas>
                </div>
              </div>
            </div>
          </div>

          <div class="oa-section page-section">
            <h3 class="oa-section-title">Element Criticality &amp; Duration</h3>
            <div class="grid-2">
              <div class="panel">
                <div class="panel-header">
                  <div>
                    <h3>Pareto 80/20 Loss Analysis</h3>
                    <p class="card__meta">Elements driving cumulative TSA loss</p>
                  </div>
                </div>
                <div class="panel-body chart-container-lg">
                  <canvas id="tsa-outage-pareto-chart" aria-label="Pareto loss chart"></canvas>
                </div>
              </div>
              <div class="panel">
                <div class="panel-header">
                  <div>
                    <h3>Outage Duration Buckets</h3>
                    <p class="card__meta">Age-wise outage duration distribution</p>
                  </div>
                </div>
                <div class="panel-body chart-container-lg">
                  <canvas id="oa-duration-chart" aria-label="Outage duration buckets chart"></canvas>
                </div>
              </div>
            </div>
          </div>

          <div class="oa-section page-section">
            <h3 class="oa-section-title">Targeted Risk &amp; Performance</h3>
            <div class="oa-insights-grid">
              <div class="panel oa-insight-panel oa-insight-wide">
                <div class="panel-header">
                  <div>
                    <h3>Top Impacted Elements</h3>
                    <p class="card__meta">Ranked by weighted outage impact score</p>
                  </div>
                </div>
                <div class="panel-body p-0 overflow-x-auto">
                  <table class="data-table data-table--compact" id="oa-impact-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>ELEMENT</th>
                        <th class="text-right">OUTAGE HR</th>
                        <th class="text-right">TRIPS</th>
                        <th class="text-right">KV</th>
                        <th class="text-right">IMPACT</th>
                      </tr>
                    </thead>
                    <tbody id="oa-impact-body"></tbody>
                  </table>
                </div>
              </div>
              <div class="panel oa-insight-panel">
                <div class="panel-header"><h3>Generator-Connected Events</h3></div>
                <div class="panel-body oa-generator-card" id="oa-generator-card">
                  <p class="oa-generator-count" id="oa-generator-count">4 events</p>
                  <p class="oa-generator-hours" id="oa-generator-hours">18.5 outage hours</p>
                  <p class="card__meta" id="oa-generator-note">Lines &amp; ICTs with generator interconnection</p>
                </div>
              </div>
              <div class="panel oa-insight-panel">
                <div class="panel-header"><h3>Long Duration Outages</h3></div>
                <div class="panel-body">
                  <ul class="oa-alert-list" id="oa-long-duration-list"></ul>
                </div>
              </div>
              <div class="panel oa-insight-panel oa-insight-wide">
                <div class="panel-header">
                  <div>
                    <h3>Underperforming Units</h3>
                    <p class="card__meta">Below HERC target in selected scope</p>
                  </div>
                </div>
                <div class="panel-body">
                  <ul class="oa-underperform-list" id="oa-underperform-list"></ul>
                </div>
              </div>
            </div>
          </div>
        </section>
'''

START = '        <!-- TSA — OUTAGE ANALYTICS -->'
END = '        <!-- TSA — DEEMED / EXEMPT REGISTER -->'

for name in ('index.html', 'public/index.html'):
    path = ROOT / name
    text = path.read_text(encoding='utf-8')
    start = text.index(START)
    end = text.index(END)
    path.write_text(text[:start] + NEW_SECTION + '\n\n' + text[end:], encoding='utf-8')
    print(f'Patched {name}')
