/**
 * Substation O&M — Advanced Analytics Dashboard
 * Mock data engine, theme system, Chart.js visualizations
 */

(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────────
  const state = {
    theme: localStorage.getItem('substation-theme') || 'light',
    sidebarCollapsed: localStorage.getItem('substation-sidebar') === 'collapsed',
    currentView: 'overview',
    currentFeeder: 'all',
    alarmFilter: 'active',
    filters: {
      zone: 'north-circle',
      division: 'div-n1',
      substation: 'alpha-1',
      dateRange: null,
    },
    charts: {},
    chartTimeFilter: 'hour',
    chartFocus: null,
    data: {},
    anomalyLog: [],
    liveAlarms: [],
    tick: 0,
    lastUpdateAt: Date.now(),
  };

  const FILTER_HIERARCHY = {
    'north-circle': {
      label: 'North Circle',
      divisions: {
        'div-n1': {
          label: 'Northern Division I',
          substations: {
            'alpha-1': 'Substation Alpha-1',
            'beta-2': 'Substation Beta-2',
          },
        },
        'div-n2': {
          label: 'Northern Division II',
          substations: {
            'gamma-3': 'Substation Gamma-3',
          },
        },
      },
    },
    'south-circle': {
      label: 'South Circle',
      divisions: {
        'div-s1': {
          label: 'Southern Division I',
          substations: {
            'delta-4': 'Substation Delta-4',
            'epsilon-5': 'Substation Epsilon-5',
          },
        },
        'div-s2': {
          label: 'Southern Division II',
          substations: {
            'zeta-6': 'Substation Zeta-6',
          },
        },
      },
    },
    'east-circle': {
      label: 'East Circle',
      divisions: {
        'div-e1': {
          label: 'Eastern Division I',
          substations: {
            'eta-7': 'Substation Eta-7',
            'theta-8': 'Substation Theta-8',
          },
        },
      },
    },
  };

  const VIEW_TITLES = {
    overview: 'Dashboard Overview',
    'system-operation': 'System Operation & Transmission Loss',
    'power-quality': 'Power Quality Analytics',
    'load-analytics': 'Load Profile',
    'asset-health': 'Asset Health & Predictive Maintenance',
    'fault-risk': 'Fault & Risk Analytics',
    'grid-reliability': 'Grid Reliability & Planning',
    'grid-intelligence': 'Grid Intelligence Analytics',
    uptime: 'Uptime Monitoring',
    'live-alarms': 'Alarms',
    settings: 'Settings & Access Control',
    'tsa-executive-summary': 'TSA — Executive Summary',
    'tsa-ac-lines': 'AC Transmission Lines',
    'tsa-ict': 'Inter-Connecting Transformers',
    'tsa-reactive': 'Reactive Power Assets',
    'tsa-outage-analytics': 'Outage Analytics',
    'tsa-deemed-exempt': 'Deemed/Exempt Register',
    'tsa-tripping-register': 'Tripping Register',
  };

  // ─── Utilities ───────────────────────────────────────────────────────
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function formatTime(d = new Date()) {
    return d.toLocaleTimeString('en-GB', { hour12: false });
  }

  function formatDateTime(d = new Date()) {
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }

  function healthClass(score) {
    if (score < 50) return 'health-critical';
    if (score <= 75) return 'health-warning';
    return 'health-good';
  }

  function healthLabel(score) {
    if (score < 50) return 'Critical';
    if (score <= 75) return 'Degraded';
    return 'Healthy';
  }

  function rulColor(pct) {
    if (pct < 25) return '#DC2626';
    if (pct < 50) return '#F59E0B';
    return '#00A870';
  }

  const CHART_PRIMARY = '#0066CC';
  const CHART_TEAL = '#0EA5E9';
  const CHART_SUCCESS = '#00A870';
  const CHART_WARNING = '#F59E0B';
  const CHART_DANGER = '#DC2626';

  const TIME_FILTER_CONFIG = {
    hour: { count: 24, unitLabel: 'Hour' },
    day: { count: 7, unitLabel: 'Day' },
    week: { count: 8, unitLabel: 'Week' },
    month: { count: 12, unitLabel: 'Month' },
  };

  function avgChunk(arr) {
    if (!arr.length) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
  }

  function buildHourlyLoadSeries(mwSeries) {
    const base = mwSeries && mwSeries.length ? mwSeries : Array.from({ length: 24 }, (_, i) => 120 + Math.sin(i / 3) * 20);
    const out = [];
    for (let day = 0; day < 30; day++) {
      base.forEach((v, hour) => {
        out.push(clamp(v + Math.sin((day * 24 + hour) / 8) * 8 + rand(-4, 4), 70, 220));
      });
    }
    return out;
  }

  function getTimeFilterLabels(filter) {
    const { count } = TIME_FILTER_CONFIG[filter];
    const now = new Date();
    if (filter === 'hour') {
      return Array.from({ length: count }, (_, i) => `${String(i + 1).padStart(2, '0')}:00`);
    }
    if (filter === 'day') {
      return Array.from({ length: count }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (count - 1 - i));
        return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
      });
    }
    if (filter === 'week') {
      return Array.from({ length: count }, (_, i) => `Week ${i + 1}`);
    }
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
      return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    });
  }

  function aggregateHourlySeries(hourlyValues, filter) {
    const cfg = TIME_FILTER_CONFIG[filter];
    const bucketHours = filter === 'hour' ? 1 : filter === 'day' ? 24 : filter === 'week' ? 24 * 7 : 24 * 30;
    const totalHours = cfg.count * bucketHours;
    const series = hourlyValues.slice(-totalHours);
    while (series.length < totalHours) {
      series.unshift(series[0] ?? 120);
    }
    const values = [];
    for (let i = 0; i < cfg.count; i++) {
      const chunk = series.slice(i * bucketHours, (i + 1) * bucketHours);
      values.push(avgChunk(chunk));
    }
    return {
      labels: getTimeFilterLabels(filter),
      values,
      xTitle: cfg.unitLabel,
    };
  }

  function resampleSeries(values, filter) {
    const { count } = TIME_FILTER_CONFIG[filter];
    if (!values || !values.length) return Array.from({ length: count }, () => 0);
    const result = [];
    for (let i = 0; i < count; i++) {
      const start = Math.floor((i * values.length) / count);
      const end = Math.max(start + 1, Math.floor(((i + 1) * values.length) / count));
      result.push(avgChunk(values.slice(start, end)));
    }
    return result;
  }

  function getAvailabilityChartLabels(count) {
    const now = new Date();
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(now);
      d.setHours(d.getHours() - (count - 1 - i));
      return `${String(d.getHours()).padStart(2, '0')}:00`;
    });
  }

  function syncAvailabilityChart(animate) {
    const chart = state.charts.availSpark;
    if (!chart) return;
    const count = 24;
    const hist = state.data.availabilityHistory.slice(-count);
    while (hist.length < count) {
      hist.unshift({ planned: 0.1, forced: 0.05 });
    }
    chart.data.labels = getAvailabilityChartLabels(count);
    chart.data.datasets[0].data = hist.map((h) => h.planned);
    chart.data.datasets[1].data = hist.map((h) => h.forced);
    const maxVal = Math.max(...hist.map((h) => h.planned + h.forced), 0.12);
    chart.options.scales.y.suggestedMax = Math.ceil(maxVal * 20) / 20 + 0.05;
    chart.update(animate ? 'default' : 'none');
  }

  function applyTimeFilterToChartScales(chart, filter, animate) {
    if (!chart?.options?.scales) return;
    if (!chart.options.scales.x) chart.options.scales.x = {};
    const d = chartDefaults();
    const meta = TIME_FILTER_CONFIG[filter];
    chart.options.scales.x.display = true;
    chart.options.scales.x.title = {
      display: true,
      text: meta.unitLabel,
      color: d.color,
      font: { size: 11, weight: '600' },
    };
    chart.options.scales.x.ticks = {
      ...(chart.options.scales.x.ticks || {}),
      color: d.color,
      font: { size: 10 },
      maxTicksLimit: filter === 'hour' ? 12 : filter === 'month' ? 6 : 8,
    };
    chart.update(animate ? 'default' : 'none');
  }

  function applyChartTimeFilter(animate) {
    const filter = state.chartTimeFilter;
    const hourly = state.data.hourlyLoadSeries || [];
    const loadSeries = aggregateHourlySeries(hourly, filter);
    const data = state.data;

    if (state.charts.ovLoad) {
      state.charts.ovLoad.data.labels = loadSeries.labels;
      state.charts.ovLoad.data.datasets[0].data = loadSeries.values;
      applyTimeFilterToChartScales(state.charts.ovLoad, filter, animate);
    }

    if (state.charts.loadProfile) {
      const feeder = state.currentFeeder;
      const ratio = feeder === 'all' ? 1 : data.feeders[feeder].mw / data.feeders.all.mw;
      state.charts.loadProfile.data.labels = loadSeries.labels;
      state.charts.loadProfile.data.datasets[0].data = loadSeries.values.map((v) => v * ratio);
      state.charts.loadProfile.data.datasets[1].data = loadSeries.values.map((v) => v * ratio * 1.1);
      applyTimeFilterToChartScales(state.charts.loadProfile, filter, animate);
    }

    if (state.charts.loadTrendMW) {
      state.charts.loadTrendMW.data.labels = loadSeries.labels;
      state.charts.loadTrendMW.data.datasets[0].data = loadSeries.values;
      applyTimeFilterToChartScales(state.charts.loadTrendMW, filter, animate);
    }

    if (state.charts.loadForecast) {
      const fc = data.loadForecast;
      state.charts.loadForecast.data.labels = loadSeries.labels;
      state.charts.loadForecast.data.datasets[0].data = resampleSeries(fc.actual, filter);
      state.charts.loadForecast.data.datasets[1].data = resampleSeries(fc.predicted, filter);
      state.charts.loadForecast.data.datasets[2].data = resampleSeries(
        fc.predicted.map((v, i) => v + fc.margin[i]),
        filter
      );
      state.charts.loadForecast.data.datasets[3].data = resampleSeries(
        fc.predicted.map((v, i) => v - fc.margin[i]),
        filter
      );
      applyTimeFilterToChartScales(state.charts.loadForecast, filter, animate);
    }

    if (state.charts.pqTrend) {
      const trend = data.powerQualityTrend;
      state.charts.pqTrend.data.labels = loadSeries.labels;
      state.charts.pqTrend.data.datasets[0].data = resampleSeries(trend.thd, filter);
      state.charts.pqTrend.data.datasets[1].data = resampleSeries(trend.flicker, filter);
      applyTimeFilterToChartScales(state.charts.pqTrend, filter, animate);
    }

    if (state.charts.maintCost) {
      const mc = data.maintCost;
      state.charts.maintCost.data.labels = loadSeries.labels;
      state.charts.maintCost.data.datasets[0].data = resampleSeries(mc.preventive, filter);
      state.charts.maintCost.data.datasets[1].data = resampleSeries(mc.corrective, filter);
      state.charts.maintCost.data.datasets[2].data = resampleSeries(mc.emergency, filter);
      applyTimeFilterToChartScales(state.charts.maintCost, filter, animate);
    }

    if (state.charts.lostLoad) {
      state.charts.lostLoad.data.labels = loadSeries.labels;
      state.charts.lostLoad.data.datasets[0].data = resampleSeries(data.lostLoad.monthly, filter);
      applyTimeFilterToChartScales(state.charts.lostLoad, filter, animate);
    }

    if (state.charts.uptimeTrend) {
      state.charts.uptimeTrend.data.labels = loadSeries.labels;
      state.charts.uptimeTrend.data.datasets[0].data = resampleSeries(data.uptime.dailyPct, filter);
      applyTimeFilterToChartScales(state.charts.uptimeTrend, filter, animate);
    }

    document.querySelectorAll('.chart-time-filter').forEach((sel) => {
      if (sel.value !== filter) sel.value = filter;
    });
  }

  function setChartTimeFilter(filter) {
    if (!TIME_FILTER_CONFIG[filter]) return;
    state.chartTimeFilter = filter;
    applyChartTimeFilter(true);
  }

  function refreshAllCharts() {
    Object.values(state.charts).forEach((chart) => {
      if (!chart?.resize) return;
      chart.resize();
      chart.update('none');
    });
  }

  function refreshActiveViewCharts() {
    const view = document.querySelector('.view.active');
    if (view) resizeChartsInElement(view);
    else refreshAllCharts();
  }

  function scheduleChartRefresh() {
    requestAnimationFrame(() => {
      refreshActiveViewCharts();
      requestAnimationFrame(refreshActiveViewCharts);
    });
    setTimeout(refreshActiveViewCharts, 50);
    setTimeout(refreshActiveViewCharts, 200);
  }

  function resizeChartsInElement(root) {
    if (!root) return;
    root.querySelectorAll('canvas').forEach((canvas) => {
      const chart = Chart.getChart(canvas);
      if (chart) {
        chart.resize();
        chart.update();
      }
    });
  }

  function refreshChartsInView(viewEl) {
    if (!viewEl) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resizeChartsInElement(viewEl);
      });
    });
  }

  function enterChartFocus(panel) {
    if (!panel || state.chartFocus?.panel) return;
    const overlay = document.getElementById('chart-focus-overlay');
    const content = document.getElementById('chart-focus-content');
    const titleEl = document.getElementById('chart-focus-title');
    if (!overlay || !content || !titleEl) return;

    const placeholder = document.createElement('div');
    placeholder.className = 'chart-focus-placeholder';
    placeholder.hidden = true;
    panel.parentNode.insertBefore(placeholder, panel);

    state.chartFocus = { panel, placeholder };
    titleEl.textContent = panel.querySelector('.panel-header h3')?.textContent?.trim() || 'Chart';
    panel.classList.add('panel--focused');
    content.appendChild(panel);
    overlay.hidden = false;
    document.body.classList.add('chart-focus-active');

    requestAnimationFrame(() => {
      resizeChartsInElement(panel);
      lucide.createIcons({ nodes: [overlay] });
    });
  }

  function exitChartFocus() {
    const focus = state.chartFocus;
    if (!focus?.panel) return;
    const overlay = document.getElementById('chart-focus-overlay');
    focus.panel.classList.remove('panel--focused');
    focus.placeholder.parentNode.insertBefore(focus.panel, focus.placeholder);
    focus.placeholder.remove();
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('chart-focus-active');
    state.chartFocus = null;
    requestAnimationFrame(() => resizeChartsInElement(focus.panel));
  }

  function initChartFocusMode() {
    document.querySelectorAll('.panel').forEach((panel) => {
      if (!panel.querySelector('canvas')) return;
      const header = panel.querySelector('.panel-header');
      if (!header || header.querySelector('.chart-focus-btn')) return;

      let actions = header.querySelector('.panel-header-actions, .chart-toolbar');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'panel-header-actions';
        header.appendChild(actions);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-btn chart-focus-btn';
      btn.title = 'Focus mode';
      btn.setAttribute('aria-label', 'Enter focus mode');
      btn.innerHTML = '<i data-lucide="maximize-2" class="h-4 w-4"></i>';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        enterChartFocus(panel);
      });
      actions.prepend(btn);
    });

    document.getElementById('chart-focus-close')?.addEventListener('click', exitChartFocus);
    document.getElementById('chart-focus-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'chart-focus-overlay') exitChartFocus();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.chartFocus?.panel) exitChartFocus();
    });

    window.addEventListener('resize', () => {
      if (state.chartFocus?.panel) resizeChartsInElement(state.chartFocus.panel);
    });
  }

  // ─── Theme ───────────────────────────────────────────────────────────
  function isDark() {
    return document.documentElement.classList.contains('dark');
  }

  function getChartColors() {
    const dark = isDark();
    return {
      text: dark ? '#9CA3AF' : '#6B7280',
      grid: dark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.9)',
      tooltipBg: dark ? '#1F2937' : '#FFFFFF',
      tooltipTitle: dark ? '#F3F4F6' : '#1F2937',
      tooltipBody: dark ? '#D1D5DB' : '#6B7280',
      tooltipBorder: dark ? '#374151' : '#E5E7EB',
      track: dark ? '#374151' : '#E5E7EB',
    };
  }

  const UPTIME_CAUSE_COLORS = ['#ff3b7e', '#5d68f1', '#ffca3a', '#34d399'];
  const OV_HEALTH_LABELS = ['Healthy (>75)', 'Degraded (50-75)', 'Critical (<50)'];
  const OV_HEALTH_LEGEND_LABELS = ['Healthy', 'Degraded', 'Critical'];

  function getCardBgColor() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim();
    return v || (isDark() ? '#1F2937' : '#FFFFFF');
  }

  function getOvHealthCounts() {
    const assets = state.data?.assets || [];
    return [
      assets.filter((a) => a.score > 75).length,
      assets.filter((a) => a.score >= 50 && a.score <= 75).length,
      assets.filter((a) => a.score < 50).length,
    ];
  }

  function getOvHealthColors() {
    return [CHART_SUCCESS, CHART_WARNING, CHART_DANGER];
  }

  function renderDonutSplitLegend(legendId, labels, values, colors) {
    const legend = document.getElementById(legendId);
    if (!legend) return;
    const total = values.reduce((s, v) => s + v, 0) || 1;
    legend.innerHTML = labels.map((label, i) => {
      const pct = Math.round((values[i] / total) * 100);
      const color = colors[i % colors.length];
      return `
        <li class="donut-split-legend-item">
          <span class="donut-split-legend-bar" style="background:${color}" aria-hidden="true"></span>
          <div class="donut-split-legend-text">
            <span class="donut-split-legend-label">${label}</span>
            <span class="donut-split-legend-value">${pct}%</span>
          </div>
        </li>`;
    }).join('');
  }

  function syncUptimeCauseChart() {
    const causes = state.data?.uptime?.causes;
    if (!causes) return;
    const labels = Object.keys(causes);
    const values = Object.values(causes);
    renderDonutSplitLegend('uptime-cause-legend', labels, values, UPTIME_CAUSE_COLORS);
    if (!state.charts.uptimeCause) return;
    const cardBg = getCardBgColor();
    state.charts.uptimeCause.data.labels = labels;
    state.charts.uptimeCause.data.datasets[0].data = values;
    state.charts.uptimeCause.data.datasets[0].backgroundColor = UPTIME_CAUSE_COLORS.slice(0, labels.length);
    state.charts.uptimeCause.data.datasets[0].borderColor = cardBg;
    state.charts.uptimeCause.update('none');
  }

  function syncOvHealthChart() {
    const values = getOvHealthCounts();
    const colors = getOvHealthColors();
    renderDonutSplitLegend('ov-health-legend', OV_HEALTH_LEGEND_LABELS, values, colors);
    if (!state.charts.ovHealth) return;
    const cardBg = getCardBgColor();
    state.charts.ovHealth.data.labels = OV_HEALTH_LABELS;
    state.charts.ovHealth.data.datasets[0].data = values;
    state.charts.ovHealth.data.datasets[0].backgroundColor = colors;
    state.charts.ovHealth.data.datasets[0].borderColor = cardBg;
    state.charts.ovHealth.update('none');
  }

  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('substation-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    updateAllChartThemes();
  }

  function toggleTheme() {
    applyTheme(isDark() ? 'light' : 'dark');
  }

  function chartDefaults() {
    const c = getChartColors();
    return {
      color: c.text,
      borderColor: c.grid,
      ticks: { color: c.text, font: { size: 10 } },
      grid: { color: c.grid },
      tooltip: {
        backgroundColor: c.tooltipBg,
        titleColor: c.tooltipTitle,
        bodyColor: c.tooltipBody,
        borderColor: c.tooltipBorder,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
      },
    };
  }

  function updateChartTheme(chart) {
    if (!chart) return;
    const c = getChartColors();
    const d = chartDefaults();

    if (chart.options.plugins?.legend?.labels) {
      chart.options.plugins.legend.labels.color = c.text;
    }
    if (chart.options.scales) {
      Object.values(chart.options.scales).forEach((scale) => {
        if (scale.ticks) scale.ticks.color = c.text;
        if (scale.grid) scale.grid.color = c.grid;
        if (scale.title) scale.title.color = c.text;
      });
    }
    if (chart.options.plugins?.tooltip) {
      Object.assign(chart.options.plugins.tooltip, d.tooltip);
    }
    chart.update('none');
  }

  function updateAllChartThemes() {
    Object.values(state.charts).forEach(updateChartTheme);
    syncUptimeCauseChart();
    syncOvHealthChart();
  }

  // ─── Mock Data Engine ──────────────────────────────────────────────────
  function initMockData() {
    const now = Date.now();
    const labels24 = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    const labels12 = Array.from({ length: 12 }, (_, i) => `T+${i}h`);

    state.data = {
      availability: 99.82,
      plannedOutage: 0.12,
      forcedOutage: 0.06,
      availabilityHistory: Array.from({ length: 30 }, () => ({
        planned: rand(0.05, 0.2),
        forced: rand(0.02, 0.12),
      })),
      gridFrequency: 50.02,
      feeders: {
        all: { mw: 142.5, mva: 158.3 },
        f1: { mw: 52.1, mva: 57.8 },
        f2: { mw: 38.4, mva: 42.6 },
        f3: { mw: 31.2, mva: 34.5 },
        f4: { mw: 20.8, mva: 23.4 },
      },
      loadProfile: {
        labels: labels24,
        mw: labels24.map((_, i) => 80 + Math.sin(i / 3) * 30 + rand(-5, 5)),
        mva: labels24.map((_, i) => 90 + Math.sin(i / 3) * 32 + rand(-5, 5)),
      },
      loadForecast: {
        labels: labels12,
        actual: labels12.map((_, i) => 120 + Math.sin(i / 2) * 20 + rand(-3, 3)),
        predicted: labels12.map((_, i) => 118 + Math.sin(i / 2) * 20),
        margin: labels12.map(() => rand(2, 5)),
      },
      powerQuality: {
        thd: 2.8,
        voltage: 98.2,
        flicker: 0.42,
        transients: 3,
      },
      powerQualityTrend: {
        labels: ['T-11', 'T-10', 'T-9', 'T-8', 'T-7', 'T-6', 'T-5', 'T-4', 'T-3', 'T-2', 'T-1', 'Now'],
        thd: Array.from({ length: 12 }, () => rand(2.2, 3.4)),
        flicker: Array.from({ length: 12 }, () => rand(0.28, 0.62)),
      },
      pqEvents: { sags: 5, swells: 2, interruptions: 1, harmonics: 4 },
      losses: {
        technical: 3.2,
        nonTechnical: 1.1,
        feeders: { F1: 1.2, F2: 0.9, F3: 0.8, F4: 0.5 },
        regions: { North: 1.4, South: 1.1, East: 0.9, West: 0.9 },
        monthly: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          technical: [3.5, 3.4, 3.3, 3.2, 3.3, 3.2],
          nonTechnical: [1.3, 1.2, 1.2, 1.1, 1.1, 1.1],
        },
      },
      assets: [
        { id: 'TX-01', type: 'Transformer', location: 'Bay A', score: 88, trend: 'up' },
        { id: 'TX-02', type: 'Transformer', location: 'Bay B', score: 62, trend: 'down' },
        { id: 'CB-101', type: 'Circuit Breaker', location: 'Feeder F1', score: 74, trend: 'stable' },
        { id: 'CB-102', type: 'Circuit Breaker', location: 'Feeder F2', score: 45, trend: 'down' },
        { id: 'CB-103', type: 'Circuit Breaker', location: 'Feeder F3', score: 91, trend: 'up' },
        { id: 'CT-201', type: 'CT', location: 'Line L1', score: 82, trend: 'stable' },
        { id: 'PT-301', type: 'PT', location: 'Bus 1', score: 79, trend: 'up' },
        { id: 'PT-302', type: 'PT', location: 'Bus 2', score: 38, trend: 'down' },
        { id: 'RL-401', type: 'Protection Relay', location: 'Bay A', score: 95, trend: 'stable' },
        { id: 'RL-402', type: 'Protection Relay', location: 'Bay B', score: 71, trend: 'down' },
      ],
      circuitBreakers: [
        { id: 'CB-101', opsRemaining: 8420, opsTotal: 12000, yearsRemaining: 4.2 },
        { id: 'CB-102', opsRemaining: 2100, opsTotal: 12000, yearsRemaining: 1.1 },
        { id: 'CB-103', opsRemaining: 10500, opsTotal: 12000, yearsRemaining: 6.8 },
        { id: 'CB-104', opsRemaining: 5600, opsTotal: 12000, yearsRemaining: 3.5 },
      ],
      ctpt: [
        { id: 'CT-201', type: 'CT', lifespan: 18.5, testScore: 87, loadFactor: 0.72, env: 'Moderate' },
        { id: 'CT-202', type: 'CT', lifespan: 12.3, testScore: 74, loadFactor: 0.85, env: 'Harsh' },
        { id: 'PT-301', type: 'PT', lifespan: 22.1, testScore: 91, loadFactor: 0.65, env: 'Mild' },
        { id: 'PT-302', type: 'PT', lifespan: 6.8, testScore: 58, loadFactor: 0.91, env: 'Harsh' },
      ],
      flashover: [
        { zone: 'Line L1 — Tower 14', leakage: 12.4, pollution: 'High', humidity: 78, risk: 'high' },
        { zone: 'Line L2 — Tower 07', leakage: 8.1, pollution: 'Medium', humidity: 65, risk: 'medium' },
        { zone: 'Line L3 — Tower 22', leakage: 3.2, pollution: 'Low', humidity: 42, risk: 'low' },
        { zone: 'Bus Coupler Bay', leakage: 9.8, pollution: 'Medium', humidity: 71, risk: 'high' },
      ],
      failureRanking: [
        { name: 'Substation Beta-2', score: 87, faults: 12, age: 28 },
        { name: 'Substation Alpha-1', score: 72, faults: 8, age: 22 },
        { name: 'Substation Gamma-3', score: 58, faults: 5, age: 15 },
        { name: 'Substation Delta-4', score: 41, faults: 3, age: 10 },
      ],
      overviewLoad: Array.from({ length: 20 }, () => rand(120, 160)),
      faultProne: [
        { asset: 'CB-102', type: 'Circuit Breaker', score: 92, level: 'critical' },
        { asset: 'TX-02', type: 'Transformer', score: 85, level: 'high' },
        { asset: 'ISO-3', type: 'Isolator', score: 78, level: 'high' },
        { asset: 'PT-302', type: 'PT', score: 71, level: 'medium' },
        { asset: 'CT-202', type: 'CT', score: 65, level: 'medium' },
        { asset: 'BB-1', type: 'Busbar', score: 52, level: 'low' },
      ],
      lossProne: [
        { area: 'Feeder F2 — Industrial', technical: 4.2, nonTechnical: 1.8, total: 6.0 },
        { area: 'Region North', technical: 3.8, nonTechnical: 1.2, total: 5.0 },
        { area: 'Line L1 — Long Span', technical: 3.5, nonTechnical: 0.4, total: 3.9 },
        { area: 'Substation Beta-2', technical: 2.9, nonTechnical: 2.1, total: 5.0 },
        { area: 'Feeder F4 — RE', technical: 2.1, nonTechnical: 0.3, total: 2.4 },
      ],
      reliability: {
        saidi: 1.42, saifi: 0.82, maifi: 0.31, mtbf: 4280, mttr: 3.6,
      },
      utilization: [
        { asset: 'TX-01', load: 78, capacity: 100 },
        { asset: 'TX-02', load: 92, capacity: 100 },
        { asset: 'Line L1', load: 65, capacity: 100 },
        { asset: 'CB-101', load: 45, capacity: 100 },
        { asset: 'Reactor R1', load: 88, capacity: 100 },
      ],
      aging: [
        { range: '0–5 yr', count: 12 },
        { range: '6–10 yr', count: 18 },
        { range: '11–20 yr', count: 24 },
        { range: '21–30 yr', count: 15 },
        { range: '>30 yr', count: 8 },
      ],
      maintCost: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        preventive: [42, 38, 45, 40, 48, 44],
        corrective: [18, 22, 15, 28, 20, 16],
        emergency: [8, 5, 12, 6, 9, 7],
      },
      lostLoad: {
        unplanned: 1240,
        planned: 680,
        constraints: 320,
        monthly: [180, 210, 195, 240, 220, 198],
      },
      compliance: [
        { name: 'Safety Standards (OSHA/IEEE)', status: 'pass', pct: 98, lastInspection: '12 Jun 2026', expiry: 'Dec 2027', desc: 'All inspections current' },
        { name: 'Cybersecurity (IEC 62443)', status: 'warn', pct: 92, lastInspection: '01 Jun 2026', expiry: '—', desc: '2 devices pending patch' },
        { name: 'Grid Code (Voltage/Harmonics)', status: 'pass', pct: 100, lastInspection: '15 May 2026', expiry: 'Ongoing', desc: 'Within CEA limits' },
        { name: 'Environmental Norms', status: 'pass', pct: 97, lastInspection: '20 May 2026', expiry: 'Dec 2027', desc: 'SF6 & oil within limits' },
        { name: 'Operational License', status: 'pass', pct: 100, lastInspection: '10 Jan 2026', expiry: 'Dec 2027', desc: 'Valid license' },
        { name: 'Protection Coordination', status: 'pass', pct: 99, lastInspection: '08 Jun 2026', expiry: 'Ongoing', desc: 'Relay settings verified' },
      ],
      equipmentHealth: [
        { name: 'Transformers', pct: 98, status: 'Healthy' },
        { name: 'Feeders', pct: 94, status: 'Healthy' },
        { name: 'Breakers', pct: 89, status: 'Warning' },
        { name: 'CT/PT', pct: 96, status: 'Healthy' },
      ],
      weather: { temp: 32, humidity: 68, wind: 14, lightning: 'Low' },
      maintenance: { total: 9, completed: 5, inProgress: 2, pending: 1, overdue: 1 },
      voltage: 220,
      trends: { availability: 0.2, load: 3.1, ahi: -1.2, anomalies: 1 },
      lostLoadTrends: { total: 8, unplanned: -2, planned: 1, constraints: 0 },
      recentEvents: [
        { time: '10:24', text: 'Relay Tested — Bay A' },
        { time: '09:42', text: 'Inspection Completed — Feeder F1' },
        { time: '08:15', text: 'Maintenance Started — CB-101' },
        { time: '07:30', text: 'Load Transfer Executed' },
      ],
      activeAlarmsList: [
        { title: 'Breaker Trip — CB-102', level: 'critical' },
        { title: 'Transformer Temperature — TX-02', level: 'warning' },
        { title: 'Voltage Dip — Bus 1', level: 'resolved' },
      ],
      uptime: {
        pct30d: 99.95,
        incidents30d: 4,
        mttrMin: 18,
        activeAlerts: 1,
        dailyPct: Array.from({ length: 30 }, () => clamp(99.9 + rand(-0.05, 0.08), 99.75, 100)),
        causes: { Network: 42, Application: 31, Infrastructure: 19, Planned: 8 },
        events: [
          { ts: '07 Jul 2026 12:12', service: 'API Gateway', region: 'India-Central', status: 'Recovered', duration: '11 min' },
          { ts: '06 Jul 2026 18:40', service: 'Telemetry Stream', region: 'India-West', status: 'Degraded', duration: '23 min' },
          { ts: '05 Jul 2026 03:15', service: 'Auth Service', region: 'India-Central', status: 'Recovered', duration: '7 min' },
          { ts: '03 Jul 2026 14:02', service: 'Dashboard Web', region: 'India-South', status: 'Recovered', duration: '5 min' },
        ],
      },
      tsa: {
        target: 98.5,
        periodLabel: 'AUG 2023',
        monthlyTafm: 99.64,
        countableOutageHr: 85.2,
        repeatTripElements: 3,
        elements: { lines: 10, icts: 6, reactive: 3 },
        trend: {
          labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug'],
          tafm: [99.52, 99.71, 99.38, 99.44, 99.64],
        },
        category: {
          labels: ['AC Lines', 'ICTs', 'Reactors + SVC'],
          values: [52, 28, 20],
        },
        notes: [
          { ref: '§4.A —', text: 'TAFM computed as availability of transmission elements over the month, net of allowable deductions.' },
          { ref: '§G —', text: 'Planned outages deducted only when approved schedule and return-to-service criteria are met.' },
          { ref: '§H —', text: 'Force-majeure and deemed available hours applied per documented evidence pack.' },
          { ref: '§I —', text: 'Repeat trips (>2 in FY) flagged for element-level incentive / penalty review.' },
          { ref: '§Target —', text: 'Incentive band begins above 98.5% monthly TAFM for the monitored portfolio.' },
        ],
        acLines: {
          availTarget: 98.5,
          voltageFilter: 'all',
          notes: [
            { ref: 'Wᵢ —', text: 'Weightage Factor = SIL (MW) × Circuit Kilometers (Ckt-Km).' },
            { ref: 'AVᵢ —', text: 'Availability = Net Available Hours / Total Hours (Tᵢ) for the month.' },
            { ref: 'Tₙₐᵢ —', text: 'Forced / countable outage hours after deemed / exempt hours are applied.' },
            { ref: '§Target —', text: 'Line elements below 98.5% AVᵢ are flagged for review (same incentive band as TAFM).' },
          ],
          lines: [
            {
              name: '220kV D/C Mohindergarh - Rewari',
              voltage: 220,
              conductor: 'Twin Zebra',
              silMw: 175,
              cktKm: 54.1,
              totalHours: 744,
              forcedOutageHr: 12.3,
              exemptHr: 5.0,
            },
            {
              name: '220kV S/C Ambala - Shahabad',
              voltage: 220,
              conductor: 'Single Zebra',
              silMw: 132,
              cktKm: 32.4,
              totalHours: 744,
              forcedOutageHr: 8.4,
              exemptHr: 1.5,
            },
            {
              name: '132kV D/C Gurugram Sec-56 - Sector-45',
              voltage: 132,
              conductor: 'Panther',
              silMw: 50,
              cktKm: 12.8,
              totalHours: 744,
              forcedOutageHr: 6.0,
              exemptHr: 3.5,
            },
            {
              name: '400kV D/C Kaithal - Patiala (HVPN Line)',
              voltage: 400,
              conductor: 'Quad Moose',
              silMw: 515,
              cktKm: 42.6,
              totalHours: 744,
              forcedOutageHr: 4.5,
              exemptHr: 2.0,
            },
            {
              name: '66kV S/C Yamunanagar - Jagadhri',
              voltage: 66,
              conductor: 'Dog',
              silMw: 18,
              cktKm: 11.2,
              totalHours: 744,
              forcedOutageHr: 0.0,
              exemptHr: 0.0,
            },
            {
              name: '220kV D/C Hisar - Fatehabad',
              voltage: 220,
              conductor: 'Twin Zebra',
              silMw: 175,
              cktKm: 48.6,
              totalHours: 744,
              forcedOutageHr: 3.2,
              exemptHr: 1.0,
            },
            {
              name: '400kV D/C Bhiwani - Jind',
              voltage: 400,
              conductor: 'Quad Moose',
              silMw: 515,
              cktKm: 61.0,
              totalHours: 744,
              forcedOutageHr: 2.1,
              exemptHr: 0.5,
            },
            {
              name: '132kV S/C Panipat - Samalkha',
              voltage: 132,
              conductor: 'Panther',
              silMw: 50,
              cktKm: 18.4,
              totalHours: 744,
              forcedOutageHr: 9.8,
              exemptHr: 2.0,
            },
          ],
        },
        ict: {
          availTarget: 98.5,
          units: [
            {
              name: '400kV ICT-1 [Deepalpur]',
              circle: 'North Circle',
              ratio: '400/220',
              mva: 500,
              type: 'General',
              totalHours: 744,
              forcedOutageHr: 0.0,
            },
            {
              name: '400kV ICT-2 [Deepalpur]',
              circle: 'North Circle',
              ratio: '400/220',
              mva: 500,
              type: 'General',
              totalHours: 744,
              forcedOutageHr: 8.2,
            },
            {
              name: '220kV ICT-1 [Nahar]',
              circle: 'South Circle',
              ratio: '220/132',
              mva: 160,
              type: 'General',
              totalHours: 744,
              forcedOutageHr: 0.0,
            },
            {
              name: '220kV ICT-2 [Nahar]',
              circle: 'South Circle',
              ratio: '220/132',
              mva: 160,
              type: 'General',
              totalHours: 744,
              forcedOutageHr: 3.5,
            },
            {
              name: '220kV ICT-1 [Pinjore]',
              circle: 'North Circle',
              ratio: '220/66',
              mva: 100,
              type: 'General',
              totalHours: 744,
              forcedOutageHr: 0.0,
            },
            {
              name: '220kV ICT-Hot-1 [Rohtak]',
              circle: 'Central Circle',
              ratio: '220/132',
              mva: 160,
              type: 'Hot',
              totalHours: 744,
              forcedOutageHr: 2.0,
            },
          ],
        },
        reactive: {
          availTarget: 98.5,
          reactors: [
            {
              name: '400kV Shunt Reactor-1 [Kaithal]',
              circle: 'North Circle',
              kv: 400,
              mvar: 125,
              totalHours: 744,
              forcedOutageHr: 0.0,
            },
            {
              name: '400kV Shunt Reactor-2 [Hisar]',
              circle: 'West Circle',
              kv: 400,
              mvar: 80,
              totalHours: 744,
              forcedOutageHr: 0.0,
            },
          ],
          svc: [
            {
              name: '400kV Dynamic SVC [Panipat]',
              circle: 'East Circle',
              kv: 400,
              mvar: 200,
              totalHours: 744,
              forcedOutageHr: 0.0,
            },
          ],
        },
        outageAnalytics: {
          target: 98.5,
          byCircle: {
            labels: ['North', 'South', 'Central', 'West'],
            shutdown: [4.2, 2.1, 1.0, 0.8],
            breakdown: [7.5, 3.4, 1.2, 1.5],
            tripping: [11.8, 10.6, 2.0, 1.8],
          },
          tafmTrend: {
            labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug'],
            values: [99.32, 99.48, 99.21, 99.41, 99.62],
          },
          reasons: [
            { label: 'Damage/failure of jumper', hours: 12.2 },
            { label: 'Act of God', hours: 8.5 },
            { label: 'For arresting oil leakage', hours: 8.2 },
            { label: 'Preventive Maintenance', hours: 4.4 },
            { label: 'For testing by staff/M&P', hours: 3.5 },
            { label: 'Damage/failure of CT', hours: 3.0 },
            { label: 'Damage/failure of LA', hours: 2.1 },
            { label: 'No fault found', hours: 1.3 },
          ],
          pareto: [
            { label: '220kV Mohindergarh-Rewari', hours: 12.2 },
            { label: '220kV Ambala-Shahabad', hours: 8.3 },
            { label: '400kV ICT-2 Deepalpur', hours: 8.1 },
            { label: '400kV Kaithal-Patiala', hours: 4.6 },
            { label: '220kV ICT-2 Nahar', hours: 3.5 },
            { label: '220kV Rohtak-Jind', hours: 2.8 },
            { label: '66kV Panchkula-Pinjore', hours: 2.1 },
            { label: '132kV Hisar-Hansi', hours: 1.6 },
          ],
        },
        deemedExempt: {
          rows: [
            {
              date: '2025-08-04',
              element: '400kV Kaithal-Patiala',
              category: 'Shutdown',
              reason: 'Preventive Maintenance',
              hours: 4.5,
              shutdownBy: 'HVPNL',
              wtd: true,
              countable: 'Counted',
              remarks: 'Bay isolator overhaul',
              attach: 'attach.pdf',
            },
            {
              date: '2025-08-06',
              element: '220kV Mohindergarh-Rewari',
              category: 'Tripping',
              reason: 'Damage/failure of jumper',
              hours: 12.3,
              shutdownBy: 'HVPNL',
              wtd: false,
              countable: 'Counted',
              remarks: 'Jumper snapped near tower 42',
              attach: 'attach.pdf',
            },
            {
              date: '2025-08-08',
              element: '220kV Ambala-Shahabad',
              category: 'Breakdown',
              reason: 'Act of God',
              hours: 6.0,
              shutdownBy: 'HVPNL',
              wtd: true,
              countable: 'Counted',
              remarks: 'Storm damage — conductor',
              attach: null,
            },
            {
              date: '2025-08-09',
              element: '400kV ICT-2 Deepalpur',
              category: 'Shutdown',
              reason: 'For arresting oil leakage',
              hours: 5.2,
              shutdownBy: 'HVPNL',
              wtd: true,
              countable: 'Deemed exempt',
              remarks: 'Conservator gasket replacement',
              attach: 'attach.pdf',
            },
            {
              date: '2025-08-11',
              element: '220kV Rohtak-Jind',
              category: 'Tripping',
              reason: 'No fault found',
              hours: 5.8,
              shutdownBy: 'HVPNL',
              wtd: false,
              countable: 'Counted',
              remarks: 'Auto-reclose successful',
              attach: null,
            },
            {
              date: '2025-08-12',
              element: '132kV Hisar-Hansi',
              category: 'Breakdown',
              reason: 'Damage/failure of CT',
              hours: 5.1,
              shutdownBy: 'HVPNL',
              wtd: false,
              countable: 'Counted',
              remarks: 'CT bushing failure',
              attach: 'attach.pdf',
            },
            {
              date: '2025-08-14',
              element: '66kV Panchkula-Pinjore',
              category: 'Shutdown',
              reason: 'To carry out construction work',
              hours: 3.8,
              shutdownBy: 'NHAI',
              wtd: true,
              countable: 'Deemed exempt',
              remarks: 'Road widening clearance',
              attach: 'attach.pdf',
            },
            {
              date: '2025-08-15',
              element: '400kV Kaithal-Patiala',
              category: 'Tripping',
              reason: 'Damage/failure of LA',
              hours: 5.9,
              shutdownBy: 'HVPNL',
              wtd: false,
              countable: 'Counted',
              remarks: 'LA flashover Phase-B',
              attach: null,
            },
            {
              date: '2025-08-18',
              element: '220kV ICT-2 Nahar',
              category: 'Shutdown',
              reason: 'For testing by staff/M&P',
              hours: 2.4,
              shutdownBy: 'HVPNL',
              wtd: true,
              countable: 'Counted',
              remarks: 'Differential relay testing',
              attach: null,
            },
          ],
        },
        trippingRegister: {
          totalHours: 744,
          availTarget: 98.5,
          rows: [
            {
              name: '400kV D/C Kaithal - Patiala (HVPN Line)',
              circle: 'North Circle',
              tripsOver10: 1,
              tripsUnder10: 0,
              actualOutageHr: 4.5,
            },
            {
              name: '220kV S/C Ambala - Shahabad',
              circle: 'North Circle',
              tripsOver10: 1,
              tripsUnder10: 1,
              actualOutageHr: 8.4,
            },
            {
              name: '220kV D/C Mohindergarh - Rewari',
              circle: 'South Circle',
              tripsOver10: 2,
              tripsUnder10: 1,
              actualOutageHr: 12.3,
            },
            {
              name: '220kV D/C Hisar - Fatehabad',
              circle: 'West Circle',
              tripsOver10: 0,
              tripsUnder10: 1,
              actualOutageHr: 3.2,
            },
            {
              name: '400kV D/C Bhiwani - Jind',
              circle: 'Central Circle',
              tripsOver10: 0,
              tripsUnder10: 2,
              actualOutageHr: 2.1,
            },
            {
              name: '66kV S/C Yamunanagar - Jagadhri',
              circle: 'North Circle',
              tripsOver10: 0,
              tripsUnder10: 0,
              actualOutageHr: 0.0,
            },
            {
              name: '132kV S/C Panipat - Samalkha',
              circle: 'Central Circle',
              tripsOver10: 4,
              tripsUnder10: 0,
              actualOutageHr: 9.8,
            },
            {
              name: '132kV D/C Gurugram Sec-56 - Sector-45',
              circle: 'South Circle',
              tripsOver10: 3,
              tripsUnder10: 2,
              actualOutageHr: 6.0,
            },
          ],
        },
      },
    };

    // If processed Unispur sample data is available, hydrate key metrics/series.
    const unispur = typeof window !== 'undefined' ? window.UNISPUR_DATA : null;
    if (unispur && unispur.feeders && unispur.summary) {
      const f1 = unispur.feeders.f1 || [];
      const f2 = unispur.feeders.f2 || [];
      const f3 = unispur.feeders.f3 || [];
      const f4 = unispur.feeders.f4 || [];
      const all = unispur.feeders.all || [];
      const labels = unispur.labels24 || state.data.loadProfile.labels;

      state.data.feeders = {
        all: { mw: unispur.summary.currentLoad || state.data.feeders.all.mw, mva: (unispur.summary.currentLoad || state.data.feeders.all.mw) * 1.1 },
        f1: { mw: f1.at(-1) || state.data.feeders.f1.mw, mva: (f1.at(-1) || state.data.feeders.f1.mw) * 1.1 },
        f2: { mw: f2.at(-1) || state.data.feeders.f2.mw, mva: (f2.at(-1) || state.data.feeders.f2.mw) * 1.1 },
        f3: { mw: f3.at(-1) || state.data.feeders.f3.mw, mva: (f3.at(-1) || state.data.feeders.f3.mw) * 1.1 },
        f4: { mw: f4.at(-1) || state.data.feeders.f4.mw, mva: (f4.at(-1) || state.data.feeders.f4.mw) * 1.1 },
      };

      state.data.loadProfile.labels = labels;
      state.data.loadProfile.mw = all.length ? all : state.data.loadProfile.mw;
      state.data.loadProfile.mva = state.data.loadProfile.mw.map((v) => v * 1.1);
      state.data.voltage = unispur.summary.voltage || state.data.voltage;
      state.data.gridFrequency = unispur.summary.frequency || state.data.gridFrequency;
      state.data.powerQuality.voltage = clamp(((unispur.summary.voltage || 220) / 220) * 100, 92, 101);
      state.data.powerQuality.transients = clamp(Math.round((1 - (unispur.summary.powerFactor || 0.95)) * 100), 1, 12);
      state.data.powerQuality.flicker = clamp(0.25 + state.data.powerQuality.transients / 25, 0.2, 1.2);
      state.data.powerQuality.thd = clamp(2 + state.data.powerQuality.transients / 3.5, 1.5, 6.5);
      state.data.weather.lightning = String(unispur.summary.weather || 'CLEAR').toUpperCase().includes('RAIN') ? 'Medium' : 'Low';
    }

    state.data.hourlyLoadSeries = buildHourlyLoadSeries(state.data.loadProfile.mw);
    state.data.overviewLoad = state.data.hourlyLoadSeries.slice(-20);

    state.lastUpdateAt = Date.now();

    state.anomalyLog = [
      { level: 'critical', msg: 'Unexpected temperature spike in Transformer TX-02', time: now - 120000 },
      { level: 'warning', msg: 'Isolator pattern mismatch on Feeder F2', time: now - 300000 },
      { level: 'warning', msg: 'Elevated partial discharge in Bay B', time: now - 480000 },
      { level: 'info', msg: 'CT-202 ratio error drift detected (+0.3%)', time: now - 600000 },
      { level: 'info', msg: 'Breaker CB-102 operation time exceeded nominal', time: now - 900000 },
    ];

    state.liveAlarms = [
      { id: `AL-${now - 280000}`, severity: 'p2', source: 'Overcurrent Relay F2', message: 'Overcurrent pickup on feeder', time: now - 280000, acked: false, shelved: false },
      { id: `AL-${now - 360000}`, severity: 'p1', source: 'Distance Relay T1', message: 'Differential trip — current imbalance > 20%', time: now - 360000, acked: false, shelved: false },
      { id: `AL-${now - 520000}`, severity: 'p4', source: 'Power Transformer T1', message: 'Cooling fan group 2 operation', time: now - 520000, acked: false, shelved: false },
      { id: `AL-${now - 640000}`, severity: 'p4', source: 'Diesel Generator 1', message: 'DG auto-start test completed', time: now - 640000, acked: true, shelved: false },
      { id: `AL-${now - 720000}`, severity: 'p3', source: '33kV Busbar A', message: 'Power factor below threshold (0.85)', time: now - 720000, acked: false, shelved: true },
    ];

    state.settingsAccess = {
      users: [
        { name: 'Admin User', email: 'admin@hvpn.gov.in', role: 'Super Admin', scope: 'All Circles', status: 'active', lastLogin: now - 120000 },
        { name: 'Rajesh Kumar', email: 'rajesh.k@hvpn.gov.in', role: 'Circle Manager', scope: 'North Circle', status: 'active', lastLogin: now - 900000 },
        { name: 'Priya Sharma', email: 'priya.s@hvpn.gov.in', role: 'O&M Engineer', scope: 'North Div I · Alpha-1, Beta-2', status: 'active', lastLogin: now - 1800000 },
        { name: 'Vikram Singh', email: 'vikram.s@hvpn.gov.in', role: 'O&M Engineer', scope: 'South Circle', status: 'active', lastLogin: now - 3600000 },
        { name: 'Anita Desai', email: 'anita.d@hvpn.gov.in', role: 'Analyst', scope: 'East Circle (read-only)', status: 'active', lastLogin: now - 7200000 },
        { name: 'Guest Auditor', email: 'audit@external.in', role: 'Auditor', scope: 'Reports only', status: 'inactive', lastLogin: now - 86400000 * 3 },
      ],
      rlsPolicies: [
        { name: 'Zone-Scoped Substation Data', resource: 'substations', rule: 'user.zone = row.zone_id', roles: 'O&M Engineer, Circle Manager', status: 'enabled' },
        { name: 'Division Feeder Access', resource: 'feeders', rule: 'user.division IN row.division_ids', roles: 'O&M Engineer', status: 'enabled' },
        { name: 'Alarm Ack Permission', resource: 'alarms', rule: 'role IN (Super Admin, O&M Engineer)', roles: 'Super Admin, O&M Engineer', status: 'enabled' },
        { name: 'Compliance Read-Only', resource: 'compliance', rule: 'role != Guest', roles: 'Analyst, Auditor', status: 'enabled' },
        { name: 'Settings Admin Only', resource: 'settings', rule: 'role = Super Admin', roles: 'Super Admin', status: 'enabled' },
      ],
      scopeMatrix: [
        { role: 'Super Admin', zones: 'All Circles', divisions: 'All Divisions', substations: 'All Substations', alarms: 'Full', reports: 'Full' },
        { role: 'Circle Manager', zones: 'Assigned Circle', divisions: 'All in Circle', substations: 'All in Circle', alarms: 'View + Ack', reports: 'Circle scope' },
        { role: 'O&M Engineer', zones: 'Assigned Circle', divisions: 'Assigned Division', substations: 'Assigned only', alarms: 'View + Ack', reports: 'Division scope' },
        { role: 'Analyst', zones: 'Assigned Circle', divisions: 'Read-only', substations: 'Read-only', alarms: 'View only', reports: 'Export allowed' },
        { role: 'Auditor', zones: 'None (reports)', divisions: '—', substations: '—', alarms: '—', reports: 'Read-only export' },
      ],
      auditLog: [
        { time: now - 60000, user: 'admin@hvpn.gov.in', action: 'LOGIN', resource: 'Dashboard', scope: 'All Circles', result: 'success' },
        { time: now - 240000, user: 'priya.s@hvpn.gov.in', action: 'VIEW', resource: 'Substation Alpha-1', scope: 'North Div I', result: 'success' },
        { time: now - 420000, user: 'rajesh.k@hvpn.gov.in', action: 'ACK_ALARM', resource: 'AL-20260709-442', scope: 'North Circle', result: 'success' },
        { time: now - 780000, user: 'vikram.s@hvpn.gov.in', action: 'EXPORT', resource: 'Load Profile Report', scope: 'South Circle', result: 'success' },
        { time: now - 1200000, user: 'guest@external.in', action: 'LOGIN', resource: 'Settings', scope: '—', result: 'denied' },
        { time: now - 2100000, user: 'anita.d@hvpn.gov.in', action: 'VIEW', resource: 'Grid Reliability', scope: 'East Circle', result: 'success' },
      ],
      security: {
        mfa: true,
        sessionTimeout: '30',
        auditLogging: true,
        ipAllowlist: false,
      },
      activeSessions: 12,
    };
  }

  function tickMockData() {
    state.tick++;

    // Grid frequency
    state.data.gridFrequency = clamp(50 + rand(-0.08, 0.08), 49.85, 50.15);

    // Availability slight drift
    state.data.availability = clamp(state.data.availability + rand(-0.01, 0.01), 99.5, 99.99);
    state.data.plannedOutage = clamp(state.data.plannedOutage + rand(-0.005, 0.005), 0.05, 0.25);
    state.data.forcedOutage = clamp(state.data.forcedOutage + rand(-0.003, 0.003), 0.02, 0.15);

    // Feeders
    Object.keys(state.data.feeders).forEach((k) => {
      state.data.feeders[k].mw = clamp(state.data.feeders[k].mw + rand(-2, 2), 10, 200);
      state.data.feeders[k].mva = state.data.feeders[k].mw * rand(1.08, 1.15);
    });

    // Load profile — shift and append
    const lp = state.data.loadProfile;
    const lastMw = lp.mw[lp.mw.length - 1] + rand(-3, 3);
    const lastMva = lp.mva[lp.mva.length - 1] + rand(-3, 3);
    const hour = new Date().getHours();
    lp.labels.push(`${String(hour).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`);
    lp.mw.push(clamp(lastMw, 60, 200));
    lp.mva.push(clamp(lastMva, 65, 220));
    if (lp.labels.length > 24) {
      lp.labels.shift();
      lp.mw.shift();
      lp.mva.shift();
    }

    // Forecast
    state.data.loadForecast.actual = state.data.loadForecast.actual.map((v) => clamp(v + rand(-2, 2), 80, 180));
    state.data.loadForecast.predicted = state.data.loadForecast.actual.map((v, i) =>
      v + rand(-state.data.loadForecast.margin[i], state.data.loadForecast.margin[i])
    );

    // Power quality
    const pq = state.data.powerQuality;
    pq.thd = clamp(pq.thd + rand(-0.15, 0.15), 1.5, 6);
    pq.voltage = clamp(pq.voltage + rand(-0.3, 0.3), 95, 100);
    pq.flicker = clamp(pq.flicker + rand(-0.05, 0.05), 0.2, 1.2);
    pq.transients = clamp(Math.round(pq.transients + rand(-1, 1)), 0, 12);

    // Transmission losses drift
    state.data.losses.technical = clamp(state.data.losses.technical + rand(-0.06, 0.06), 2.4, 4.4);
    state.data.losses.nonTechnical = clamp(state.data.losses.nonTechnical + rand(-0.04, 0.04), 0.7, 1.8);
    Object.keys(state.data.losses.feeders).forEach((k) => {
      state.data.losses.feeders[k] = clamp(state.data.losses.feeders[k] + rand(-0.07, 0.07), 0.2, 2.2);
    });
    Object.keys(state.data.losses.regions).forEach((k) => {
      state.data.losses.regions[k] = clamp(state.data.losses.regions[k] + rand(-0.08, 0.08), 0.3, 2.8);
    });

    // Asset scores drift
    state.data.assets.forEach((a) => {
      a.score = clamp(Math.round(a.score + rand(-2, 2)), 20, 100);
    });

    // CB RUL
    state.data.circuitBreakers.forEach((cb) => {
      if (Math.random() < 0.1) cb.opsRemaining = Math.max(0, cb.opsRemaining - randInt(1, 5));
      cb.yearsRemaining = clamp(cb.yearsRemaining + rand(-0.02, 0.01), 0.5, 10);
    });

    // Flashover
    state.data.flashover.forEach((f) => {
      f.leakage = clamp(f.leakage + rand(-0.5, 0.5), 1, 20);
      f.humidity = clamp(Math.round(f.humidity + rand(-2, 2)), 30, 95);
      f.risk = f.leakage > 10 ? 'high' : f.leakage > 6 ? 'medium' : 'low';
    });

    // Overview load — append to hourly series
    const latestMw = state.data.feeders.all.mw;
    state.data.hourlyLoadSeries.push(clamp(latestMw + rand(-2, 2), 70, 220));
    if (state.data.hourlyLoadSeries.length > 24 * 365) state.data.hourlyLoadSeries.shift();
    state.data.overviewLoad = state.data.hourlyLoadSeries.slice(-20);

    // Random anomaly (10% chance)
    if (Math.random() < 0.1) {
      const anomalies = [
        { level: 'critical', msg: `Sudden oil temperature rise in ${pick(['TX-01', 'TX-02'])}` },
        { level: 'warning', msg: `Vibration anomaly on ${pick(['CB-101', 'CB-102', 'CB-103'])}` },
        { level: 'warning', msg: `Harmonic distortion spike on Feeder ${pick(['F1', 'F2', 'F3'])}` },
        { level: 'info', msg: `SF6 pressure drift on ${pick(['CB-104', 'CB-101'])}` },
        { level: 'info', msg: `Unexpected switching pattern on Isolator ${pick(['ISO-1', 'ISO-2'])}` },
      ];
      const a = pick(anomalies);
      state.anomalyLog.unshift({ ...a, time: Date.now() });
      if (state.anomalyLog.length > 20) state.anomalyLog.pop();
    }

    if (Math.random() < 0.16) {
      const alarmCatalog = [
        { severity: 'p1', source: 'Distance Relay T1', message: 'Differential trip — current imbalance > 20%' },
        { severity: 'p2', source: 'Overcurrent Relay F2', message: 'Overcurrent pickup on feeder' },
        { severity: 'p3', source: 'Busbar Protection A', message: 'Bus section voltage dip detected' },
        { severity: 'p4', source: 'Power Transformer T1', message: 'Cooling fan group operation state changed' },
      ];
      const a = pick(alarmCatalog);
      state.liveAlarms.unshift({
        id: `AL-${Date.now()}-${randInt(100, 999)}`,
        severity: a.severity,
        source: a.source,
        message: a.message,
        time: Date.now(),
        acked: false,
        shelved: false,
      });
      if (state.liveAlarms.length > 40) state.liveAlarms.pop();
    }

    // Failure ranking scores
    state.data.failureRanking.forEach((f) => {
      f.score = clamp(Math.round(f.score + rand(-2, 2)), 20, 95);
    });
    state.data.failureRanking.sort((a, b) => b.score - a.score);

    // Fault prone drift
    state.data.faultProne.forEach((f) => {
      f.score = clamp(Math.round(f.score + rand(-3, 3)), 30, 98);
      f.level = f.score > 85 ? 'critical' : f.score > 70 ? 'high' : f.score > 55 ? 'medium' : 'low';
    });
    state.data.faultProne.sort((a, b) => b.score - a.score);

    // Reliability indices
    const rel = state.data.reliability;
    rel.saidi = clamp(rel.saidi + rand(-0.05, 0.05), 0.5, 3);
    rel.saifi = clamp(rel.saifi + rand(-0.03, 0.03), 0.3, 2);
    rel.maifi = clamp(rel.maifi + rand(-0.02, 0.02), 0.1, 1);
    rel.mtbf = clamp(Math.round(rel.mtbf + rand(-50, 50)), 3000, 6000);
    rel.mttr = clamp(rel.mttr + rand(-0.1, 0.1), 1, 8);

    // Lost load
    state.data.lostLoad.unplanned = clamp(Math.round(state.data.lostLoad.unplanned + rand(-20, 20)), 800, 1800);
    state.data.lostLoad.monthly.push(clamp(Math.round(rand(150, 280)), 100, 350));
    if (state.data.lostLoad.monthly.length > 6) state.data.lostLoad.monthly.shift();
    state.lastUpdateAt = Date.now();

    // Equipment health slight drift
    state.data.equipmentHealth.forEach((e) => {
      e.pct = clamp(Math.round(e.pct + rand(-1, 1)), 75, 100);
      e.status = e.pct >= 95 ? 'Healthy' : e.pct >= 85 ? 'Warning' : 'Critical';
    });

    // Weather drift
    state.data.weather.temp = clamp(Math.round(state.data.weather.temp + rand(-0.5, 0.5)), 20, 45);
    state.data.weather.humidity = clamp(Math.round(state.data.weather.humidity + rand(-1, 1)), 40, 95);
  }

  // ─── Chart Builders ────────────────────────────────────────────────────
  function makeGauge(ctx, value, max, color) {
    const track = getChartColors().track;
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [value, max - value],
          backgroundColor: [color, track],
          borderWidth: 0,
        }],
      },
      options: {
        cutout: '75%',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
  }

  function initCharts() {
    const d = chartDefaults();
    // Overview load
    state.charts.ovLoad = new Chart(document.getElementById('ov-load-chart'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Load (MW)',
          data: [],
          borderColor: CHART_PRIMARY,
          backgroundColor: 'rgba(0, 102, 204, 0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: {
            display: true,
            ticks: d.ticks,
            grid: { display: false },
            border: { display: false },
            title: { display: true, text: 'Hour', color: d.color, font: { size: 11, weight: '600' } },
          },
          y: { ticks: d.ticks, grid: d.grid, border: { display: false } },
        },
      },
    });

    // Overview health distribution
    state.charts.ovHealth = new Chart(document.getElementById('ov-health-chart'), {
      type: 'doughnut',
      data: {
        labels: OV_HEALTH_LABELS,
        datasets: [{
          data: getOvHealthCounts(),
          backgroundColor: getOvHealthColors(),
          borderColor: getCardBgColor(),
          borderWidth: 3,
          hoverOffset: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '78%',
        plugins: {
          legend: { display: false },
          tooltip: d.tooltip,
        },
      },
    });
    syncOvHealthChart();

    // Availability outage trend (24h)
    const availCount = 24;
    const availHist = state.data.availabilityHistory.slice(-availCount);
    while (availHist.length < availCount) {
      availHist.unshift({ planned: rand(0.05, 0.2), forced: rand(0.02, 0.12) });
    }
    state.charts.availSpark = new Chart(document.getElementById('availability-sparkline'), {
      type: 'bar',
      data: {
        labels: getAvailabilityChartLabels(availCount),
        datasets: [
          {
            label: 'Planned Outage',
            data: availHist.map((h) => h.planned),
            backgroundColor: '#f59e0b',
            borderRadius: 2,
            barPercentage: 0.85,
            categoryPercentage: 0.9,
          },
          {
            label: 'Forced Outage',
            data: availHist.map((h) => h.forced),
            backgroundColor: '#ef4444',
            borderRadius: 2,
            barPercentage: 0.85,
            categoryPercentage: 0.9,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 4, bottom: 4, left: 0, right: 4 } },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            align: 'center',
            labels: {
              color: d.color,
              font: { size: 10 },
              boxWidth: 10,
              padding: 14,
              usePointStyle: true,
              pointStyle: 'rectRounded',
            },
          },
          tooltip: d.tooltip,
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: {
              color: d.color,
              font: { size: 9 },
              maxTicksLimit: 8,
              maxRotation: 0,
              autoSkip: true,
            },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            suggestedMax: 0.35,
            grid: { ...d.grid, drawBorder: false },
            ticks: {
              color: d.color,
              font: { size: 9 },
              maxTicksLimit: 5,
              callback: (v) => `${v}%`,
            },
            title: {
              display: true,
              text: 'Outage %',
              color: d.color,
              font: { size: 10, weight: '600' },
            },
          },
        },
      },
    });

    // Load profile
    state.charts.loadProfile = new Chart(document.getElementById('load-profile-chart'), {
      type: 'line',
      data: {
        labels: state.data.loadProfile.labels,
        datasets: [
          {
            label: 'MW',
            data: state.data.loadProfile.mw,
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: 'MVA',
            data: state.data.loadProfile.mva,
            borderColor: '#8b5cf6',
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
            borderDash: [4, 4],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: d.color, font: { size: 11 } } },
          tooltip: d.tooltip,
        },
        scales: {
          x: { ticks: { ...d.ticks, maxTicksLimit: 12 }, grid: d.grid },
          y: {
            title: { display: true, text: 'MW / MVA', color: d.color },
            ticks: d.ticks,
            grid: d.grid,
          },
        },
      },
    });

    // Load forecast
    const fc = state.data.loadForecast;
    state.charts.loadForecast = new Chart(document.getElementById('load-forecast-chart'), {
      type: 'line',
      data: {
        labels: fc.labels,
        datasets: [
          {
            label: 'Actual Load',
            data: fc.actual,
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            fill: false,
            tension: 0.35,
            pointRadius: 3,
            borderWidth: 2,
          },
          {
            label: 'Predicted Load',
            data: fc.predicted,
            borderColor: '#8b5cf6',
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: 3,
            borderWidth: 2,
            borderDash: [6, 3],
          },
          {
            label: 'Upper Bound',
            data: fc.predicted.map((v, i) => v + fc.margin[i]),
            borderColor: 'transparent',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            fill: '+1',
            pointRadius: 0,
            borderWidth: 0,
          },
          {
            label: 'Lower Bound',
            data: fc.predicted.map((v, i) => v - fc.margin[i]),
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            fill: false,
            pointRadius: 0,
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: {
              color: d.color,
              filter: (item) => !item.text.includes('Bound'),
            },
          },
          tooltip: d.tooltip,
        },
        scales: {
          x: { ticks: d.ticks, grid: d.grid, title: { display: true, text: 'Forecast Horizon', color: d.color } },
          y: { ticks: d.ticks, grid: d.grid, title: { display: true, text: 'MW', color: d.color } },
        },
      },
    });

    // Feeder load comparison
    const feederLabels = ['F1', 'F2', 'F3', 'F4'];
    const feederKeys = ['f1', 'f2', 'f3', 'f4'];
    state.charts.loadFeeder = new Chart(document.getElementById('load-feeder-chart'), {
      type: 'bar',
      data: {
        labels: feederLabels,
        datasets: [{
          label: 'Current Load (MW)',
          data: feederKeys.map((k) => state.data.feeders[k].mw),
          backgroundColor: [CHART_PRIMARY, CHART_TEAL, CHART_SUCCESS, CHART_WARNING],
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: { display: false } },
          y: {
            title: { display: true, text: 'MW', color: d.color },
            ticks: d.ticks,
            grid: d.grid,
            border: { display: false },
          },
        },
      },
    });

    state.charts.loadTrendMW = new Chart(document.getElementById('la-trend-chart'), {
      type: 'line',
      data: {
        labels: state.data.loadProfile.labels.slice(-6),
        datasets: [{
          label: 'MW',
          data: state.data.loadProfile.mw.slice(-6),
          borderColor: '#60A5FA',
          backgroundColor: 'rgba(96, 165, 250, 0.16)',
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: d.grid },
          y: { ticks: d.ticks, grid: d.grid },
        },
      },
    });

    const scheduledNow = Math.max(80, state.data.feeders.all.mw - 12);
    state.charts.loadScheduledVsActual = new Chart(document.getElementById('la-sva-chart'), {
      type: 'bar',
      data: {
        labels: ['Scheduled', 'Actual'],
        datasets: [{
          label: 'MW',
          data: [scheduledNow, state.data.feeders.all.mw],
          backgroundColor: ['#16A34A', '#60A5FA'],
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: { display: false } },
          y: { ticks: d.ticks, grid: d.grid },
        },
      },
    });

    state.charts.tlLossMix = new Chart(document.getElementById('tl-loss-mix-chart'), {
      type: 'doughnut',
      data: {
        labels: ['Technical', 'Non-Technical'],
        datasets: [{
          data: [state.data.losses.technical, state.data.losses.nonTechnical],
          backgroundColor: ['#0EA5E9', '#F59E0B'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: d.color } }, tooltip: d.tooltip },
      },
    });

    state.charts.tlFeederLoss = new Chart(document.getElementById('tl-feeder-loss-chart'), {
      type: 'bar',
      data: {
        labels: Object.keys(state.data.losses.feeders),
        datasets: [{
          label: 'Loss %',
          data: Object.values(state.data.losses.feeders),
          backgroundColor: ['#60A5FA', '#34D399', '#FBBF24', '#F87171'],
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: { display: false } },
          y: { ticks: d.ticks, grid: d.grid, title: { display: true, text: 'Loss %', color: d.color } },
        },
      },
    });

    state.charts.tlMonthlyTrend = new Chart(document.getElementById('tl-monthly-trend-chart'), {
      type: 'line',
      data: {
        labels: state.data.losses.monthly.labels,
        datasets: [
          {
            label: 'Technical',
            data: state.data.losses.monthly.technical,
            borderColor: '#0EA5E9',
            backgroundColor: 'rgba(14, 165, 233, 0.12)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
          },
          {
            label: 'Non-Technical',
            data: state.data.losses.monthly.nonTechnical,
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: d.color } }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: d.grid },
          y: { ticks: d.ticks, grid: d.grid, title: { display: true, text: 'Loss %', color: d.color } },
        },
      },
    });

    state.charts.tlRegionLoss = new Chart(document.getElementById('tl-region-loss-chart'), {
      type: 'bar',
      data: {
        labels: Object.keys(state.data.losses.regions),
        datasets: [{
          label: 'Loss %',
          data: Object.values(state.data.losses.regions),
          backgroundColor: ['#38BDF8', '#818CF8', '#FB7185', '#FBBF24'],
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: d.grid, title: { display: true, text: 'Loss %', color: d.color } },
          y: { ticks: d.ticks, grid: { display: false } },
        },
      },
    });

    // PQ gauges
    state.charts.pqThd = makeGauge(document.getElementById('pq-thd-gauge'), 2.8, 8, '#06b6d4');
    state.charts.pqVoltage = makeGauge(document.getElementById('pq-voltage-gauge'), 98.2, 100, '#22c55e');
    state.charts.pqFlicker = makeGauge(document.getElementById('pq-flicker-gauge'), 0.42, 1.5, '#f59e0b');
    state.charts.pqTransient = makeGauge(document.getElementById('pq-transient-gauge'), 3, 12, '#ef4444');
    state.charts.pqThdTab = makeGauge(document.getElementById('pq-tab-thd-gauge'), 2.8, 8, '#06b6d4');
    state.charts.pqVoltageTab = makeGauge(document.getElementById('pq-tab-voltage-gauge'), 98.2, 100, '#22c55e');
    state.charts.pqFlickerTab = makeGauge(document.getElementById('pq-tab-flicker-gauge'), 0.42, 1.5, '#f59e0b');
    state.charts.pqTransientTab = makeGauge(document.getElementById('pq-tab-transient-gauge'), 3, 12, '#ef4444');

    state.charts.pqTrend = new Chart(document.getElementById('pq-trend-chart'), {
      type: 'line',
      data: {
        labels: state.data.powerQualityTrend.labels,
        datasets: [
          {
            label: 'THD %',
            data: state.data.powerQualityTrend.thd,
            borderColor: '#38BDF8',
            backgroundColor: 'rgba(56,189,248,0.10)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2,
          },
          {
            label: 'Flicker',
            data: state.data.powerQualityTrend.flicker,
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245,158,11,0.08)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: d.color } }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: d.grid },
          y: { ticks: d.ticks, grid: d.grid },
        },
      },
    });

    state.charts.pqEvents = new Chart(document.getElementById('pq-events-chart'), {
      type: 'bar',
      data: {
        labels: ['Sags', 'Swells', 'Interruptions', 'Harmonics'],
        datasets: [{
          label: 'Count',
          data: [
            state.data.pqEvents.sags,
            state.data.pqEvents.swells,
            state.data.pqEvents.interruptions,
            state.data.pqEvents.harmonics,
          ],
          backgroundColor: ['#60A5FA', '#34D399', '#F87171', '#FBBF24'],
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: { display: false } },
          y: { ticks: d.ticks, grid: d.grid },
        },
      },
    });

    // Failure rank
    state.charts.failureRank = new Chart(document.getElementById('failure-rank-chart'), {
      type: 'bar',
      data: {
        labels: state.data.failureRanking.map((f) => f.name.replace('Substation ', '')),
        datasets: [{
          label: 'Risk Score',
          data: state.data.failureRanking.map((f) => f.score),
          backgroundColor: state.data.failureRanking.map((f) =>
            f.score > 75 ? '#ef4444' : f.score > 50 ? '#f59e0b' : '#22c55e'
          ),
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: d.grid, max: 100, title: { display: true, text: 'Composite Risk Score', color: d.color } },
          y: { ticks: d.ticks, grid: { display: false } },
        },
      },
    });

    // Fault prone chart
    state.charts.faultProne = new Chart(document.getElementById('fault-prone-chart'), {
      type: 'bar',
      data: {
        labels: state.data.faultProne.map((f) => f.asset),
        datasets: [{
          label: 'Fault Score',
          data: state.data.faultProne.map((f) => f.score),
          backgroundColor: state.data.faultProne.map((f) =>
            f.level === 'critical' ? '#ef4444' : f.level === 'high' ? '#f59e0b' : f.level === 'medium' ? '#eab308' : '#22c55e'
          ),
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: { display: false } },
          y: { ticks: d.ticks, grid: d.grid, max: 100 },
        },
      },
    });

    // Loss prone chart
    state.charts.lossProne = new Chart(document.getElementById('loss-prone-chart'), {
      type: 'bar',
      data: {
        labels: state.data.lossProne.map((l) => l.area.split('—')[0].trim()),
        datasets: [
          { label: 'Technical', data: state.data.lossProne.map((l) => l.technical), backgroundColor: '#06b6d4', borderRadius: 2 },
          { label: 'Non-Technical', data: state.data.lossProne.map((l) => l.nonTechnical), backgroundColor: '#f59e0b', borderRadius: 2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: d.color } }, tooltip: d.tooltip },
        scales: {
          x: { stacked: true, ticks: d.ticks, grid: { display: false } },
          y: { stacked: true, ticks: d.ticks, grid: d.grid, title: { display: true, text: 'Loss %', color: d.color } },
        },
      },
    });

    // Utilization chart
    state.charts.utilization = new Chart(document.getElementById('utilization-chart'), {
      type: 'bar',
      data: {
        labels: state.data.utilization.map((u) => u.asset),
        datasets: [{
          label: 'Load %',
          data: state.data.utilization.map((u) => u.load),
          backgroundColor: state.data.utilization.map((u) =>
            u.load > 85 ? '#ef4444' : u.load > 70 ? '#f59e0b' : '#22c55e'
          ),
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: { display: false } },
          y: { ticks: d.ticks, grid: d.grid, max: 100, title: { display: true, text: 'Utilization %', color: d.color } },
        },
      },
    });

    // Aging chart
    state.charts.aging = new Chart(document.getElementById('aging-chart'), {
      type: 'bar',
      data: {
        labels: state.data.aging.map((a) => a.range),
        datasets: [{
          label: 'Equipment Count',
          data: state.data.aging.map((a) => a.count),
          backgroundColor: '#8b5cf6',
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: { display: false } },
          y: { ticks: d.ticks, grid: d.grid },
        },
      },
    });

    // Maintenance cost chart
    const mc = state.data.maintCost;
    state.charts.maintCost = new Chart(document.getElementById('maint-cost-chart'), {
      type: 'line',
      data: {
        labels: mc.labels,
        datasets: [
          { label: 'Preventive', data: mc.preventive, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.35, borderWidth: 2 },
          { label: 'Corrective', data: mc.corrective, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.35, borderWidth: 2 },
          { label: 'Emergency', data: mc.emergency, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.35, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: d.color } }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: d.grid },
          y: { ticks: d.ticks, grid: d.grid, title: { display: true, text: 'Cost (₹ Lakhs)', color: d.color } },
        },
      },
    });

    // Lost load chart
    state.charts.lostLoad = new Chart(document.getElementById('lost-load-chart'), {
      type: 'line',
      data: {
        labels: ['M-5', 'M-4', 'M-3', 'M-2', 'M-1', 'Current'],
        datasets: [{
          label: 'Lost Load (MWh)',
          data: state.data.lostLoad.monthly,
          borderColor: CHART_TEAL,
          backgroundColor: 'rgba(14, 165, 233, 0.08)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: d.ticks, grid: d.grid },
          y: { ticks: d.ticks, grid: d.grid },
        },
      },
    });

    // Uptime analytics
    const uptimeLabels = Array.from({ length: 30 }, (_, i) => `D${i + 1}`);
    state.charts.uptimeTrend = new Chart(document.getElementById('uptime-trend-chart'), {
      type: 'line',
      data: {
        labels: uptimeLabels,
        datasets: [{
          label: 'Uptime %',
          data: state.data.uptime.dailyPct,
          borderColor: CHART_SUCCESS,
          backgroundColor: 'rgba(0, 168, 112, 0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { ticks: { ...d.ticks, maxTicksLimit: 10 }, grid: d.grid },
          y: { min: 99.7, max: 100, ticks: d.ticks, grid: d.grid },
        },
      },
    });

    state.charts.uptimeCause = new Chart(document.getElementById('uptime-cause-chart'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(state.data.uptime.causes),
        datasets: [{
          data: Object.values(state.data.uptime.causes),
          backgroundColor: UPTIME_CAUSE_COLORS.slice(0, Object.keys(state.data.uptime.causes).length),
          borderColor: getCardBgColor(),
          borderWidth: 3,
          hoverOffset: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '78%',
        plugins: {
          legend: { display: false },
          tooltip: d.tooltip,
        },
      },
    });
    syncUptimeCauseChart();

    // TSA — Executive Summary (driven by state.data.tsa mock)
    const tsa = state.data.tsa;
    state.charts.tsaTafmTrend = new Chart(document.getElementById('tsa-tafm-trend-chart'), {
      type: 'line',
      data: {
        labels: tsa.trend.labels,
        datasets: [
          {
            label: 'Compiled TAFM',
            data: tsa.trend.tafm.slice(),
            borderColor: CHART_SUCCESS,
            backgroundColor: 'rgba(0, 168, 112, 0.12)',
            fill: false,
            tension: 0.25,
            pointRadius: 4,
            pointBackgroundColor: CHART_SUCCESS,
            borderWidth: 2,
          },
          {
            label: `Target ${tsa.target}%`,
            data: tsa.trend.labels.map(() => tsa.target),
            borderColor: CHART_WARNING,
            backgroundColor: 'transparent',
            borderDash: [6, 4],
            pointRadius: 0,
            borderWidth: 2,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...d.tooltip,
            callbacks: {
              label(ctx) {
                if (String(ctx.dataset.label).startsWith('Target')) {
                  return `Target: ${ctx.parsed.y.toFixed(1)}%`;
                }
                return `${ctx.label} tsa : ${ctx.parsed.y.toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          x: { ticks: d.ticks, grid: { display: false }, border: { display: false } },
          y: {
            min: 97,
            max: 100,
            ticks: {
              ...d.ticks,
              callback(v) { return `${v}%`; },
            },
            grid: d.grid,
            border: { display: false },
          },
        },
      },
    });

    const tsaGaugeEl = document.getElementById('tsa-tafm-gauge-chart');
    if (tsaGaugeEl) {
      const gaugeFloor = 97;
      const gaugeSpan = 100 - gaugeFloor;
      const gaugeValue = tsa.monthlyTafm;
      state.charts.tsaTafmGauge = new Chart(tsaGaugeEl, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [gaugeValue - gaugeFloor, gaugeSpan - (gaugeValue - gaugeFloor)],
            backgroundColor: [CHART_WARNING, getChartColors().track],
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          rotation: -90,
          circumference: 180,
          cutout: '72%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
        },
      });
    }

    state.charts.tsaAvailCategory = new Chart(document.getElementById('tsa-avail-category-chart'), {
      type: 'doughnut',
      data: {
        labels: tsa.category.labels,
        datasets: [{
          data: tsa.category.values.slice(),
          backgroundColor: [CHART_SUCCESS, CHART_WARNING, CHART_TEAL],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: d.color, font: { size: 11 }, padding: 12, usePointStyle: true },
          },
          tooltip: d.tooltip,
        },
      },
    });

    // TSA — AC Transmission Lines charts
    state.charts.tsaAcAvail = new Chart(document.getElementById('tsa-ac-avail-chart'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Availability %',
            data: [],
            backgroundColor: [],
            borderRadius: 4,
            maxBarThickness: 36,
          },
          {
            label: 'Target',
            data: [],
            type: 'line',
            borderColor: CHART_WARNING,
            borderDash: [6, 4],
            pointRadius: 0,
            borderWidth: 2,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: d.tooltip,
        },
        scales: {
          x: {
            ticks: { ...d.ticks, maxRotation: 60, minRotation: 40, autoSkip: false, font: { size: 9 } },
            grid: { display: false },
            border: { display: false },
            title: { display: true, text: 'Element', color: d.color, font: { size: 11 } },
          },
          y: {
            min: 95,
            max: 100,
            ticks: {
              ...d.ticks,
              callback(v) { return `${v}%`; },
            },
            grid: d.grid,
            border: { display: false },
            title: { display: true, text: 'Availability (%)', color: d.color, font: { size: 11 } },
          },
        },
      },
    });

    state.charts.tsaAcOutage = new Chart(document.getElementById('tsa-ac-outage-chart'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Outage hours',
          data: [],
          backgroundColor: CHART_WARNING,
          borderRadius: 4,
          maxBarThickness: 18,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: d.tooltip,
        },
        scales: {
          x: {
            min: 0,
            ticks: {
              ...d.ticks,
              callback(v) { return `${v}h`; },
            },
            grid: d.grid,
            border: { display: false },
          },
          y: {
            ticks: { ...d.ticks, font: { size: 9 } },
            grid: { display: false },
            border: { display: false },
          },
        },
      },
    });

    state.charts.tsaIctAvail = new Chart(document.getElementById('tsa-ict-avail-chart'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Availability %',
            data: [],
            backgroundColor: CHART_SUCCESS,
            borderRadius: 4,
            maxBarThickness: 36,
          },
          {
            label: 'Target',
            data: [],
            type: 'line',
            borderColor: CHART_WARNING,
            borderDash: [6, 4],
            pointRadius: 0,
            borderWidth: 2,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: {
            ticks: { ...d.ticks, maxRotation: 45, minRotation: 30, autoSkip: false, font: { size: 9 } },
            grid: { display: false },
            border: { display: false },
            title: { display: true, text: 'Element', color: d.color, font: { size: 11 } },
          },
          y: {
            min: 95,
            max: 100,
            ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
            grid: d.grid,
            border: { display: false },
            title: { display: true, text: 'Availability (%)', color: d.color, font: { size: 11 } },
          },
        },
      },
    });

    state.charts.tsaIctOutage = new Chart(document.getElementById('tsa-ict-outage-chart'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Outage hours',
          data: [],
          backgroundColor: CHART_WARNING,
          borderRadius: 4,
          maxBarThickness: 18,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: {
            min: 0,
            ticks: { ...d.ticks, callback(v) { return `${v}h`; } },
            grid: d.grid,
            border: { display: false },
            title: { display: true, text: 'Outage hours', color: d.color, font: { size: 11 } },
          },
          y: {
            ticks: { ...d.ticks, font: { size: 9 } },
            grid: { display: false },
            border: { display: false },
            title: { display: true, text: 'Element', color: d.color, font: { size: 11 } },
          },
        },
      },
    });

    state.charts.tsaReactiveAvail = new Chart(document.getElementById('tsa-reactive-avail-chart'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Availability %',
            data: [],
            backgroundColor: CHART_SUCCESS,
            borderRadius: 4,
            maxBarThickness: 36,
          },
          {
            label: 'Target',
            data: [],
            type: 'line',
            borderColor: CHART_WARNING,
            borderDash: [6, 4],
            pointRadius: 0,
            borderWidth: 2,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: {
            ticks: { ...d.ticks, maxRotation: 40, minRotation: 25, autoSkip: false, font: { size: 9 } },
            grid: { display: false },
            border: { display: false },
            title: { display: true, text: 'Element', color: d.color, font: { size: 11 } },
          },
          y: {
            min: 95,
            max: 100,
            ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
            grid: d.grid,
            border: { display: false },
            title: { display: true, text: 'Availability (%)', color: d.color, font: { size: 11 } },
          },
        },
      },
    });

    state.charts.tsaReactiveOutage = new Chart(document.getElementById('tsa-reactive-outage-chart'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Outage hours',
          data: [],
          backgroundColor: CHART_WARNING,
          borderRadius: 4,
          maxBarThickness: 18,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: {
            min: 0,
            ticks: { ...d.ticks, callback(v) { return `${v}h`; } },
            grid: d.grid,
            border: { display: false },
            title: { display: true, text: 'Outage hours', color: d.color, font: { size: 11 } },
          },
          y: {
            ticks: { ...d.ticks, font: { size: 9 } },
            grid: { display: false },
            border: { display: false },
            title: { display: true, text: 'Element', color: d.color, font: { size: 11 } },
          },
        },
      },
    });

    // TSA — Outage Analytics
    const oa = state.data.tsa.outageAnalytics;
    state.charts.tsaOutageCircle = new Chart(document.getElementById('tsa-outage-circle-chart'), {
      type: 'bar',
      data: {
        labels: oa.byCircle.labels,
        datasets: [
          {
            label: 'Shutdown',
            data: oa.byCircle.shutdown.slice(),
            backgroundColor: CHART_PRIMARY,
            stack: 'outage',
            borderRadius: 2,
          },
          {
            label: 'Breakdown',
            data: oa.byCircle.breakdown.slice(),
            backgroundColor: CHART_DANGER,
            stack: 'outage',
            borderRadius: 2,
          },
          {
            label: 'Tripping',
            data: oa.byCircle.tripping.slice(),
            backgroundColor: CHART_WARNING,
            stack: 'outage',
            borderRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: d.color, font: { size: 11 }, usePointStyle: true } },
          tooltip: d.tooltip,
        },
        scales: {
          x: { stacked: true, ticks: d.ticks, grid: { display: false }, border: { display: false } },
          y: {
            stacked: true,
            min: 0,
            ticks: { ...d.ticks, callback(v) { return `${v}h`; } },
            grid: d.grid,
            border: { display: false },
            title: { display: true, text: 'Outage hours', color: d.color, font: { size: 11 } },
          },
        },
      },
    });

    state.charts.tsaOutageTafm = new Chart(document.getElementById('tsa-outage-tafm-chart'), {
      type: 'line',
      data: {
        labels: oa.tafmTrend.labels,
        datasets: [
          {
            label: 'TAFM',
            data: oa.tafmTrend.values.slice(),
            borderColor: CHART_SUCCESS,
            backgroundColor: 'rgba(0, 168, 112, 0.12)',
            fill: false,
            tension: 0.25,
            pointRadius: 4,
            pointBackgroundColor: CHART_SUCCESS,
            borderWidth: 2,
          },
          {
            label: `HERC target ${oa.target}%`,
            data: oa.tafmTrend.labels.map(() => oa.target),
            borderColor: CHART_WARNING,
            borderDash: [6, 4],
            pointRadius: 0,
            borderWidth: 2,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: d.tooltip,
        },
        scales: {
          x: { ticks: d.ticks, grid: { display: false }, border: { display: false } },
          y: {
            min: 98,
            max: 100,
            ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
            grid: d.grid,
            border: { display: false },
            title: { display: true, text: 'TAFM (%)', color: d.color, font: { size: 11 } },
          },
        },
      },
    });

    state.charts.tsaOutageReasons = new Chart(document.getElementById('tsa-outage-reasons-chart'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Outage hours',
          data: [],
          backgroundColor: CHART_TEAL,
          borderRadius: 4,
          maxBarThickness: 16,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: {
            min: 0,
            ticks: { ...d.ticks, callback(v) { return `${v}h`; } },
            grid: d.grid,
            border: { display: false },
          },
          y: {
            ticks: { ...d.ticks, font: { size: 10 } },
            grid: { display: false },
            border: { display: false },
          },
        },
      },
    });

    state.charts.tsaOutagePareto = new Chart(document.getElementById('tsa-outage-pareto-chart'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Non-availability hours',
          data: [],
          backgroundColor: [],
          borderRadius: 4,
          maxBarThickness: 16,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: {
            min: 0,
            ticks: { ...d.ticks, callback(v) { return `${v}h`; } },
            grid: d.grid,
            border: { display: false },
          },
          y: {
            ticks: { ...d.ticks, font: { size: 10 } },
            grid: { display: false },
            border: { display: false },
          },
        },
      },
    });

    // TSA — Deemed / Exempt Register
    state.charts.tsaDeemedCategory = new Chart(document.getElementById('tsa-deemed-category-chart'), {
      type: 'bar',
      data: {
        labels: ['Shutdown', 'Breakdown', 'Tripping'],
        datasets: [
          {
            label: 'Countable',
            data: [0, 0, 0],
            backgroundColor: CHART_WARNING,
            stack: 'hours',
            borderRadius: 2,
            maxBarThickness: 72,
          },
          {
            label: 'Deemed exempt',
            data: [0, 0, 0],
            backgroundColor: CHART_SUCCESS,
            stack: 'hours',
            borderRadius: 2,
            maxBarThickness: 72,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: d.color, font: { size: 11 }, usePointStyle: true } },
          tooltip: d.tooltip,
        },
        scales: {
          x: { stacked: true, ticks: d.ticks, grid: { display: false }, border: { display: false } },
          y: {
            stacked: true,
            min: 0,
            ticks: { ...d.ticks, callback(v) { return `${v}h`; } },
            grid: d.grid,
            border: { display: false },
            title: { display: true, text: 'Hours', color: d.color, font: { size: 11 } },
          },
        },
      },
    });

    scheduleChartRefresh();
  }

  // ─── DOM Updates ───────────────────────────────────────────────────────
  function secsAgo() {
    const s = Math.max(1, Math.round((Date.now() - (state.lastUpdateAt || Date.now())) / 1000));
    return `${s} sec ago`;
  }

  function renderTsaExecutiveSummary() {
    const tsa = state.data?.tsa;
    if (!tsa) return;

    const totalElements = tsa.elements.lines + tsa.elements.icts + tsa.elements.reactive;
    const gapPp = tsa.monthlyTafm - tsa.target;

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('tsa-kpi-tafm', `${tsa.monthlyTafm.toFixed(2)}%`);
    setText('tsa-kpi-gap', `${gapPp.toFixed(2)} pp`);
    setText('tsa-kpi-elements', String(totalElements));
    setText('tsa-kpi-outage', `${tsa.countableOutageHr.toFixed(1)} hr`);
    setText('tsa-kpi-repeat', String(tsa.repeatTripElements));
    setText('tsa-gauge-value', `${tsa.monthlyTafm.toFixed(2)}%`);
    setText('tsa-gauge-period', tsa.periodLabel);

    const elementsSubtitle = document.querySelector('#view-tsa-executive-summary .kpi-card:nth-child(3) .kpi-subtitle');
    if (elementsSubtitle) {
      elementsSubtitle.textContent = `${tsa.elements.lines} lines · ${tsa.elements.icts} ICTs · ${tsa.elements.reactive} reactive`;
    }

    const notesEl = document.getElementById('tsa-regulatory-notes');
    if (notesEl && Array.isArray(tsa.notes)) {
      notesEl.innerHTML = tsa.notes.map((n) =>
        `<li><span class="tsa-note-ref">${n.ref}</span> ${n.text}</li>`
      ).join('');
    }

    const gaugeFloor = 97;
    const gaugeSpan = 100 - gaugeFloor;
    if (state.charts.tsaTafmTrend) {
      state.charts.tsaTafmTrend.data.labels = tsa.trend.labels;
      state.charts.tsaTafmTrend.data.datasets[0].data = tsa.trend.tafm.slice();
      state.charts.tsaTafmTrend.data.datasets[1].data = tsa.trend.labels.map(() => tsa.target);
      state.charts.tsaTafmTrend.data.datasets[1].label = `Target ${tsa.target}%`;
      state.charts.tsaTafmTrend.update('none');
    }
    if (state.charts.tsaTafmGauge) {
      state.charts.tsaTafmGauge.data.datasets[0].data = [
        tsa.monthlyTafm - gaugeFloor,
        gaugeSpan - (tsa.monthlyTafm - gaugeFloor),
      ];
      state.charts.tsaTafmGauge.update('none');
    }
    if (state.charts.tsaAvailCategory) {
      state.charts.tsaAvailCategory.data.labels = tsa.category.labels;
      state.charts.tsaAvailCategory.data.datasets[0].data = tsa.category.values.slice();
      state.charts.tsaAvailCategory.update('none');
    }
  }

  function enrichTsaAcLine(row) {
    const weightage = row.silMw * row.cktKm;
    const netAvailable = clamp(row.totalHours - row.forcedOutageHr + row.exemptHr, 0, row.totalHours);
    const availability = row.totalHours > 0 ? (netAvailable / row.totalHours) * 100 : 100;
    const weightedOutage = weightage * (row.forcedOutageHr / Math.max(row.totalHours, 1));
    const shortName = row.name
      .replace(/^(\d+kV)\s+(D\/C|S\/C)\s+/i, '')
      .replace(/\s*\(HVPN Line\)\s*/i, '')
      .trim();
    return {
      ...row,
      weightage,
      netAvailable,
      availability,
      weightedOutage,
      shortName,
    };
  }

  function getTsaAcLinesFiltered() {
    const ac = state.data?.tsa?.acLines;
    if (!ac) return [];
    const filter = ac.voltageFilter || 'all';
    return ac.lines
      .map(enrichTsaAcLine)
      .filter((row) => filter === 'all' || String(row.voltage) === String(filter));
  }

  function populateTsaAcVoltageFilter() {
    const ac = state.data?.tsa?.acLines;
    const sel = document.getElementById('tsa-ac-voltage-filter');
    if (!ac || !sel) return;
    const voltages = [...new Set(ac.lines.map((l) => l.voltage))].sort((a, b) => b - a);
    const current = ac.voltageFilter || 'all';
    sel.innerHTML = [
      `<option value="all"${current === 'all' ? ' selected' : ''}>All</option>`,
      ...voltages.map((v) =>
        `<option value="${v}"${String(current) === String(v) ? ' selected' : ''}>${v} kV</option>`
      ),
    ].join('');
  }

  function exportTsaAcLinesCsv() {
    const rows = getTsaAcLinesFiltered();
    const headers = [
      'Line Name', 'Voltage kV', 'Conductor', 'SIL MW', 'Ckt-Km', 'Weightage Wi',
      'Total Hours', 'Forced Outage Hr', 'Exempt Hr', 'Net Available Hrs',
      'Weighted Outage Hrs', 'Availability %',
    ];
    const lines = [headers.join(',')].concat(rows.map((r) => [
      `"${r.name}"`,
      r.voltage,
      `"${r.conductor}"`,
      r.silMw,
      r.cktKm,
      r.weightage.toFixed(1),
      r.totalHours,
      r.forcedOutageHr.toFixed(1),
      r.exemptHr.toFixed(1),
      r.netAvailable.toFixed(1),
      r.weightedOutage.toFixed(2),
      r.availability.toFixed(3),
    ].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tsa-ac-transmission-lines.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderTsaAcLines() {
    const tsa = state.data?.tsa;
    const ac = tsa?.acLines;
    if (!ac) return;

    const rows = getTsaAcLinesFiltered();
    const target = ac.availTarget ?? tsa.target ?? 98.5;

    const tbody = document.getElementById('tsa-ac-lines-body');
    if (tbody) {
      tbody.innerHTML = rows.map((r) => `
        <tr>
          <td>${r.shortName}</td>
          <td class="font-mono text-right">${r.voltage}</td>
          <td class="font-mono text-right">${r.silMw}</td>
          <td class="font-mono text-right">${r.cktKm.toFixed(1)}</td>
          <td class="font-mono text-right">${r.weightage.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td>
          <td class="font-mono text-right tsa-cell-warn">${r.forcedOutageHr.toFixed(1)}</td>
          <td class="font-mono text-right tsa-cell-ok">${r.availability.toFixed(2)}%</td>
        </tr>`).join('');
    }

    if (state.charts.tsaAcAvail) {
      state.charts.tsaAcAvail.data.labels = rows.map((r) => r.shortName);
      state.charts.tsaAcAvail.data.datasets[0].data = rows.map((r) => Number(r.availability.toFixed(3)));
      state.charts.tsaAcAvail.data.datasets[0].backgroundColor = rows.map((r) =>
        r.availability >= target ? CHART_SUCCESS : CHART_DANGER
      );
      state.charts.tsaAcAvail.data.datasets[1].data = rows.map(() => target);
      state.charts.tsaAcAvail.update('none');
    }

    if (state.charts.tsaAcOutage) {
      const byOutage = [...rows].sort((a, b) => b.forcedOutageHr - a.forcedOutageHr);
      state.charts.tsaAcOutage.data.labels = byOutage.map((r) => r.shortName);
      state.charts.tsaAcOutage.data.datasets[0].data = byOutage.map((r) => Number(r.forcedOutageHr.toFixed(1)));
      state.charts.tsaAcOutage.update('none');
    }
  }

  function enrichTsaIct(row) {
    const availability = row.totalHours > 0
      ? ((row.totalHours - row.forcedOutageHr) / row.totalHours) * 100
      : 100;
    const shortName = row.name.replace(/^(\d+kV)\s+/i, '').trim();
    const status = availability >= 98.5 ? 'Healthy' : availability >= 97 ? 'Watch' : 'Critical';
    return { ...row, availability, shortName, status };
  }

  function getTsaIctRows() {
    const ict = state.data?.tsa?.ict;
    if (!ict) return [];
    return ict.units.map(enrichTsaIct);
  }

  function renderTsaIct() {
    const tsa = state.data?.tsa;
    const ict = tsa?.ict;
    if (!ict) return;

    const rows = getTsaIctRows();
    const target = ict.availTarget ?? tsa.target ?? 98.5;

    const tbody = document.getElementById('tsa-ict-body');
    if (tbody) {
      tbody.innerHTML = rows.map((r) => {
        const typeClass = r.type === 'Hot' ? 'is-hot' : 'is-general';
        return `
          <tr>
            <td>
              <div class="tsa-asset-cell">
                <span class="tsa-asset-name">${r.name}</span>
                <span class="tsa-asset-meta">${r.circle}</span>
              </div>
            </td>
            <td class="font-mono">${r.ratio}</td>
            <td class="font-mono text-right">${r.mva}</td>
            <td><span class="tsa-type-pill ${typeClass}">${r.type}</span></td>
            <td class="font-mono text-right">${r.totalHours}</td>
            <td class="font-mono text-right tsa-cell-warn">${r.forcedOutageHr.toFixed(1)}</td>
            <td class="font-mono text-right tsa-cell-ok">${r.availability.toFixed(3)}%</td>
            <td>
              <span class="tsa-status-pill">
                <span class="tsa-status-dot" aria-hidden="true"></span>
                ${r.status}
              </span>
            </td>
          </tr>`;
      }).join('');
    }

    if (state.charts.tsaIctAvail) {
      state.charts.tsaIctAvail.data.labels = rows.map((r) => r.shortName);
      state.charts.tsaIctAvail.data.datasets[0].data = rows.map((r) => Number(r.availability.toFixed(3)));
      state.charts.tsaIctAvail.data.datasets[0].backgroundColor = rows.map((r) =>
        r.availability >= target ? CHART_SUCCESS : CHART_DANGER
      );
      state.charts.tsaIctAvail.data.datasets[1].data = rows.map(() => target);
      state.charts.tsaIctAvail.update('none');
    }

    if (state.charts.tsaIctOutage) {
      const byOutage = [...rows].sort((a, b) => b.forcedOutageHr - a.forcedOutageHr);
      state.charts.tsaIctOutage.data.labels = byOutage.map((r) => r.shortName);
      state.charts.tsaIctOutage.data.datasets[0].data = byOutage.map((r) => Number(r.forcedOutageHr.toFixed(1)));
      state.charts.tsaIctOutage.update('none');
    }
  }

  function enrichTsaReactive(row) {
    const availability = row.totalHours > 0
      ? ((row.totalHours - row.forcedOutageHr) / row.totalHours) * 100
      : 100;
    const shortName = row.name
      .replace(/^(\d+kV)\s+/i, '')
      .replace(/\s*\[/, ' [')
      .trim();
    const status = availability >= 98.5 ? 'Healthy' : availability >= 97 ? 'Watch' : 'Critical';
    return { ...row, availability, shortName, status };
  }

  function getTsaReactiveRows() {
    const reactive = state.data?.tsa?.reactive;
    if (!reactive) return { reactors: [], svc: [], all: [] };
    const reactors = (reactive.reactors || []).map(enrichTsaReactive);
    const svc = (reactive.svc || []).map(enrichTsaReactive);
    return { reactors, svc, all: [...reactors, ...svc] };
  }

  function renderTsaReactiveTable(tbodyId, rows) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>
          <div class="tsa-asset-cell">
            <span class="tsa-asset-name">${r.name}</span>
            <span class="tsa-asset-meta">${r.circle}</span>
          </div>
        </td>
        <td class="font-mono text-right">${r.kv}</td>
        <td class="font-mono text-right">${r.mvar}</td>
        <td class="font-mono text-right">${r.totalHours}</td>
        <td class="font-mono text-right tsa-cell-warn">${r.forcedOutageHr.toFixed(1)}</td>
        <td class="font-mono text-right tsa-cell-ok">${r.availability.toFixed(3)}%</td>
        <td>
          <span class="tsa-status-pill">
            <span class="tsa-status-dot" aria-hidden="true"></span>
            ${r.status}
          </span>
        </td>
      </tr>`).join('');
  }

  function exportTsaReactiveCsv() {
    const { all } = getTsaReactiveRows();
    const headers = ['Asset', 'Circle', 'kV', 'MVAR Wi', 'Ti', 'TNAi', 'Availability %', 'Status'];
    const lines = [headers.join(',')].concat(all.map((r) => [
      `"${r.name}"`,
      `"${r.circle}"`,
      r.kv,
      r.mvar,
      r.totalHours,
      r.forcedOutageHr.toFixed(1),
      r.availability.toFixed(3),
      r.status,
    ].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tsa-reactive-power-assets.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderTsaReactive() {
    const reactive = state.data?.tsa?.reactive;
    if (!reactive) return;

    const { reactors, svc, all } = getTsaReactiveRows();
    const target = reactive.availTarget ?? state.data.tsa.target ?? 98.5;

    renderTsaReactiveTable('tsa-reactive-reactors-body', reactors);
    renderTsaReactiveTable('tsa-reactive-svc-body', svc);

    if (state.charts.tsaReactiveAvail) {
      state.charts.tsaReactiveAvail.data.labels = all.map((r) => r.shortName);
      state.charts.tsaReactiveAvail.data.datasets[0].data = all.map((r) => Number(r.availability.toFixed(3)));
      state.charts.tsaReactiveAvail.data.datasets[0].backgroundColor = all.map((r) =>
        r.availability >= target ? CHART_SUCCESS : CHART_DANGER
      );
      state.charts.tsaReactiveAvail.data.datasets[1].data = all.map(() => target);
      state.charts.tsaReactiveAvail.update('none');
    }

    if (state.charts.tsaReactiveOutage) {
      const byOutage = [...all].sort((a, b) => b.forcedOutageHr - a.forcedOutageHr);
      state.charts.tsaReactiveOutage.data.labels = byOutage.map((r) => r.shortName);
      state.charts.tsaReactiveOutage.data.datasets[0].data = byOutage.map((r) => Number(r.forcedOutageHr.toFixed(1)));
      state.charts.tsaReactiveOutage.update('none');
    }
  }

  function renderTsaOutageAnalytics() {
    const oa = state.data?.tsa?.outageAnalytics;
    if (!oa) return;

    if (state.charts.tsaOutageCircle) {
      state.charts.tsaOutageCircle.data.labels = oa.byCircle.labels;
      state.charts.tsaOutageCircle.data.datasets[0].data = oa.byCircle.shutdown.slice();
      state.charts.tsaOutageCircle.data.datasets[1].data = oa.byCircle.breakdown.slice();
      state.charts.tsaOutageCircle.data.datasets[2].data = oa.byCircle.tripping.slice();
      state.charts.tsaOutageCircle.update('none');
    }

    if (state.charts.tsaOutageTafm) {
      state.charts.tsaOutageTafm.data.labels = oa.tafmTrend.labels;
      state.charts.tsaOutageTafm.data.datasets[0].data = oa.tafmTrend.values.slice();
      state.charts.tsaOutageTafm.data.datasets[1].data = oa.tafmTrend.labels.map(() => oa.target);
      state.charts.tsaOutageTafm.data.datasets[1].label = `HERC target ${oa.target}%`;
      state.charts.tsaOutageTafm.update('none');
    }

    if (state.charts.tsaOutageReasons) {
      const reasons = [...oa.reasons].sort((a, b) => b.hours - a.hours);
      state.charts.tsaOutageReasons.data.labels = reasons.map((r) => r.label);
      state.charts.tsaOutageReasons.data.datasets[0].data = reasons.map((r) => r.hours);
      state.charts.tsaOutageReasons.update('none');
    }

    if (state.charts.tsaOutagePareto) {
      const pareto = [...oa.pareto].sort((a, b) => b.hours - a.hours);
      state.charts.tsaOutagePareto.data.labels = pareto.map((r) => r.label);
      state.charts.tsaOutagePareto.data.datasets[0].data = pareto.map((r) => r.hours);
      state.charts.tsaOutagePareto.data.datasets[0].backgroundColor = pareto.map((_, i) => {
        if (i === 0) return CHART_DANGER;
        if (i <= 2) return CHART_WARNING;
        return CHART_PRIMARY;
      });
      state.charts.tsaOutagePareto.update('none');
    }
  }

  function getTsaDeemedCategoryTotals(rows) {
    const cats = ['Shutdown', 'Breakdown', 'Tripping'];
    const countable = cats.map(() => 0);
    const exempt = cats.map(() => 0);
    rows.forEach((r) => {
      const idx = cats.indexOf(r.category);
      if (idx < 0) return;
      if (r.countable === 'Deemed exempt') exempt[idx] += r.hours;
      else countable[idx] += r.hours;
    });
    return { countable, exempt };
  }

  function categoryPillClass(category) {
    if (category === 'Shutdown') return 'is-shutdown';
    if (category === 'Breakdown') return 'is-breakdown';
    return 'is-tripping';
  }

  function renderTsaDeemedExemptTable(rows) {
    const tbody = document.getElementById('tsa-deemed-body');
    if (!tbody) return;
    tbody.innerHTML = rows.map((r) => {
      const attachHtml = r.attach
        ? `<a href="#" class="tsa-attach-link" data-file="${r.attach}"><i data-lucide="paperclip" class="h-3.5 w-3.5"></i>${r.attach}</a>`
        : '';
      return `
      <tr>
        <td class="font-mono">${r.date}</td>
        <td>${r.element}</td>
        <td><span class="tsa-category-pill ${categoryPillClass(r.category)}">${r.category}</span></td>
        <td>${r.reason}</td>
        <td class="font-mono text-right">${r.hours.toFixed(1)}</td>
        <td>${r.shutdownBy}</td>
        <td>${r.wtd ? '<span class="tsa-wtd-yes">Yes</span>' : '<span class="tsa-wtd-na">—</span>'}</td>
        <td><span class="tsa-countable ${r.countable === 'Deemed exempt' ? 'is-exempt' : 'is-counted'}">${r.countable}</span></td>
        <td>
          <div class="tsa-remarks-cell">
            <span>${r.remarks || '—'}</span>
            ${attachHtml}
          </div>
        </td>
      </tr>`;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function exportTsaDeemedExemptCsv() {
    const rows = state.data?.tsa?.deemedExempt?.rows || [];
    const headers = [
      'Date', 'Element', 'Category', 'Reason', 'Hours',
      'Shutdown By', 'WTD', 'Countable', 'Remarks', 'Attach',
    ];
    const lines = [headers.join(',')].concat(rows.map((r) => [
      r.date,
      `"${r.element}"`,
      r.category,
      `"${r.reason}"`,
      r.hours.toFixed(1),
      `"${r.shutdownBy}"`,
      r.wtd ? 'Yes' : '',
      `"${r.countable}"`,
      `"${(r.remarks || '').replace(/"/g, '""')}"`,
      r.attach || '',
    ].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tsa-deemed-exempt-register.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderTsaDeemedExempt() {
    const reg = state.data?.tsa?.deemedExempt;
    if (!reg) return;

    const rows = [...(reg.rows || [])].sort((a, b) => b.date.localeCompare(a.date));
    renderTsaDeemedExemptTable(rows);

    if (state.charts.tsaDeemedCategory) {
      const { countable, exempt } = getTsaDeemedCategoryTotals(rows);
      state.charts.tsaDeemedCategory.data.datasets[0].data = countable.map((v) => Number(v.toFixed(1)));
      state.charts.tsaDeemedCategory.data.datasets[1].data = exempt.map((v) => Number(v.toFixed(1)));
      state.charts.tsaDeemedCategory.update('none');
    }
  }

  /** §H penalty: when Z=X+Y > 2, additional trips attract a 12-hour multiplier. */
  function applyTsaSectionH(x, y) {
    const z = x + y;
    if (z <= 2) {
      return { z, rule: '—', penaltyHrs: 0 };
    }
    // Short trips (Y): §H.c — each Y trip counted as 12 hours once threshold breached.
    if (y > 0) {
      return { z, rule: '§H.c — 12 × Y', penaltyHrs: 12 * y };
    }
    // Long trips only (X > 2): §H.d — excess beyond free band.
    // Display uses doc form Z−(X+1); with Y=0 this equals max(X−2, 0) when rewritten on X.
    const factor = Math.max(0, x - 2);
    return { z, rule: '§H.d — 12 × (Z − (X+1))', penaltyHrs: 12 * factor };
  }

  function enrichTsaTrippingRow(row, totalHours, availTarget) {
    const x = row.tripsOver10 || 0;
    const y = row.tripsUnder10 || 0;
    const { z, rule, penaltyHrs } = applyTsaSectionH(x, y);
    const actualOutageHr = row.actualOutageHr || 0;
    const effectiveOutageHr = actualOutageHr + penaltyHrs;
    const availability = totalHours > 0
      ? ((totalHours - effectiveOutageHr) / totalHours) * 100
      : 100;
    const status = availability >= availTarget ? 'Healthy' : 'Watch';
    return {
      ...row,
      x,
      y,
      z,
      rule,
      penaltyHrs,
      actualOutageHr,
      effectiveOutageHr,
      availability,
      status,
    };
  }

  function getTsaTrippingRows() {
    const reg = state.data?.tsa?.trippingRegister;
    if (!reg) return [];
    const totalHours = reg.totalHours ?? 744;
    const availTarget = reg.availTarget ?? state.data.tsa.target ?? 98.5;
    return (reg.rows || []).map((r) => enrichTsaTrippingRow(r, totalHours, availTarget));
  }

  function renderTsaTrippingRegisterTable(rows) {
    const tbody = document.getElementById('tsa-tripping-body');
    if (!tbody) return;
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>
          <div class="tsa-asset-cell">
            <span class="tsa-asset-name">${r.name}</span>
            <span class="tsa-asset-meta">${(r.circle || '').toUpperCase()}</span>
          </div>
        </td>
        <td class="font-mono text-right">${r.x}</td>
        <td class="font-mono text-right">${r.y}</td>
        <td class="font-mono text-right ${r.z > 2 ? 'tsa-cell-warn' : ''}">${r.z}</td>
        <td class="tsa-rule-cell">${r.rule}</td>
        <td class="font-mono text-right">${r.actualOutageHr.toFixed(1)} hr</td>
        <td class="font-mono text-right ${r.penaltyHrs > 0 ? 'tsa-cell-penalty' : ''}">${r.penaltyHrs > 0 ? `+${r.penaltyHrs}` : '—'}</td>
        <td class="font-mono text-right">${r.effectiveOutageHr.toFixed(1)} hr</td>
        <td class="font-mono text-right tsa-cell-ok">${r.availability.toFixed(3)}%</td>
        <td>
          <span class="tsa-status-pill ${r.status === 'Watch' ? 'is-watch' : 'is-healthy'}">
            <span class="tsa-status-dot" aria-hidden="true"></span>
            ${r.status}
          </span>
        </td>
      </tr>`).join('');
  }

  function exportTsaTrippingRegisterCsv() {
    const rows = getTsaTrippingRows();
    const headers = [
      'Element', 'Circle', 'X > 10 min', 'Y ≤ 10 min', 'Z = X+Y',
      'Rule Applied', 'Actual Outage Hr', 'Penalty Hrs', 'Effective Outage Hr',
      'Availability %', 'Status',
    ];
    const lines = [headers.join(',')].concat(rows.map((r) => [
      `"${r.name}"`,
      `"${r.circle || ''}"`,
      r.x,
      r.y,
      r.z,
      `"${r.rule}"`,
      r.actualOutageHr.toFixed(1),
      r.penaltyHrs,
      r.effectiveOutageHr.toFixed(1),
      r.availability.toFixed(3),
      r.status,
    ].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tsa-tripping-register.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderTsaTrippingRegister() {
    if (!state.data?.tsa?.trippingRegister) return;
    renderTsaTrippingRegisterTable(getTsaTrippingRows());
  }

  function renderEnterpriseOverview() {
    const d = state.data;
    if (!d.equipmentHealth) return;

    const freq = d.gridFrequency;
    const updated = secsAgo();
    const volt = `${d.voltage} kV`;

    ['ss-frequency', 'grid-frequency'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${freq.toFixed(2)} Hz`;
    });
    ['ss-voltage', 'header-voltage'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = volt;
    });
    ['ss-updated', 'last-updated'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = updated;
    });
    const ssGrid = document.getElementById('ss-grid-status');
    if (ssGrid) ssGrid.textContent = freq >= 49.9 && freq <= 50.1 ? 'Online' : 'Alert';

    const eh = document.getElementById('equip-health-grid');
    if (eh) {
      eh.innerHTML = d.equipmentHealth.map((item) => {
        const cls = item.status === 'Healthy' ? 'healthy' : item.status === 'Warning' ? 'warning' : 'critical';
        const barColor = item.pct >= 95 ? CHART_SUCCESS : item.pct >= 85 ? CHART_WARNING : CHART_DANGER;
        return `
          <div class="equip-health-item">
            <div class="eh-name">${item.name}</div>
            <div class="eh-row">
              <span class="eh-pct">${item.pct}%</span>
              <span class="eh-status ${cls}">${item.status}</span>
            </div>
            <div class="eh-bar"><div class="eh-bar-fill" style="width:${item.pct}%;background:${barColor}"></div></div>
          </div>
        `;
      }).join('');
    }

    const alarms = document.getElementById('active-alarms-panel');
    if (alarms) {
      alarms.innerHTML = d.activeAlarmsList.map((a) => `
        <div class="alarm-item">
          <span>${a.title}</span>
          <span class="alarm-badge ${a.level}">${a.level === 'resolved' ? 'Resolved' : a.level === 'critical' ? 'Critical' : 'Warning'}</span>
        </div>
      `).join('');
    }
    const alarmBadge = document.getElementById('alarm-count-badge');
    if (alarmBadge) {
      const active = d.activeAlarmsList.filter((a) => a.level !== 'resolved').length;
      alarmBadge.textContent = `${active} Active`;
    }

    const comp = document.getElementById('ov-compliance-grid');
    if (comp) {
      comp.innerHTML = d.compliance.slice(0, 4).map((c) => `
        <div class="compliance-card ${c.status}">
          <h4>${c.name.split('(')[0].trim()}</h4>
          <p class="cc-status">${c.status === 'pass' ? 'Passed' : c.status === 'warn' ? 'Attention' : 'Failed'} · ${c.pct}%</p>
          <p class="cc-meta">Last Inspection: ${c.lastInspection}</p>
        </div>
      `).join('');
    }

    const weather = document.getElementById('weather-widget');
    if (weather) {
      const w = d.weather;
      weather.innerHTML = `
        <div class="weather-item"><div class="w-label">Temperature</div><div class="w-val">${w.temp}°C</div></div>
        <div class="weather-item"><div class="w-label">Humidity</div><div class="w-val">${w.humidity}%</div></div>
        <div class="weather-item"><div class="w-label">Wind Speed</div><div class="w-val">${w.wind} km/h</div></div>
        <div class="weather-item"><div class="w-label">Lightning Risk</div><div class="w-val">${w.lightning}</div></div>
      `;
    }

    const events = document.getElementById('recent-events-timeline');
    if (events) {
      events.innerHTML = d.recentEvents.map((e) => `
        <div class="timeline-item"><span class="timeline-time">${e.time}</span><span class="timeline-text">${e.text}</span></div>
      `).join('');
    }

    const mStats = document.getElementById('maint-stats');
    const mProg = document.getElementById('maint-progress');
    if (mStats && d.maintenance) {
      const m = d.maintenance;
      mStats.innerHTML = `
        <div class="maint-stat"><div class="ms-val">${m.total}</div><div class="ms-label">Today's Jobs</div></div>
        <div class="maint-stat"><div class="ms-val" style="color:${CHART_SUCCESS}">${m.completed}</div><div class="ms-label">Completed</div></div>
        <div class="maint-stat"><div class="ms-val" style="color:${CHART_PRIMARY}">${m.inProgress}</div><div class="ms-label">In Progress</div></div>
        <div class="maint-stat"><div class="ms-val" style="color:${CHART_WARNING}">${m.pending}</div><div class="ms-label">Pending</div></div>
        <div class="maint-stat"><div class="ms-val" style="color:${CHART_DANGER}">${m.overdue}</div><div class="ms-label">Overdue</div></div>
      `;
      const pct = Math.round((m.completed / m.total) * 100);
      if (mProg) {
        mProg.innerHTML = `
          <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Completion Progress</p>
          <div class="rul-bar-track"><div class="rul-bar-fill" style="width:${pct}%;background:${CHART_PRIMARY}"></div></div>
          <p style="font-size:12px;margin-top:6px;font-family:var(--font-mono)">${pct}% complete</p>
        `;
      }
    }
  }

  function getLoadStats(feederKey = state.currentFeeder) {
    const data = state.data;
    const lp = data.loadProfile;
    let mwSeries = lp.mw;
    if (feederKey !== 'all') {
      const ratio = data.feeders[feederKey].mw / data.feeders.all.mw;
      mwSeries = lp.mw.map((v) => v * ratio);
    }
    const peak = Math.max(...mwSeries);
    const avg = mwSeries.reduce((s, v) => s + v, 0) / mwSeries.length;
    const current = feederKey === 'all'
      ? data.feeders.all.mw
      : data.feeders[feederKey].mw;
    const factor = peak > 0 ? (avg / peak) * 100 : 0;
    return { current, peak, avg, factor };
  }

  const FEEDER_LABELS = {
    all: 'All Feeders',
    f1: 'Feeder F1 — Main Bus',
    f2: 'Feeder F2 — Industrial',
    f3: 'Feeder F3 — Residential',
    f4: 'Feeder F4 — RE Interconnect',
  };

  function renderLoadAnalytics() {
    const stats = getLoadStats();
    const currentEl = document.getElementById('la-current');
    const peakEl = document.getElementById('la-peak');
    const avgEl = document.getElementById('la-avg');
    const factorEl = document.getElementById('la-factor');
    const labelEl = document.getElementById('la-feeder-label');
    if (!currentEl) return;

    currentEl.textContent = `${stats.current.toFixed(1)} MW`;
    peakEl.textContent = `${stats.peak.toFixed(1)} MW`;
    avgEl.textContent = `${stats.avg.toFixed(1)} MW`;
    factorEl.textContent = `${stats.factor.toFixed(1)}%`;
    if (labelEl) {
      labelEl.textContent = FEEDER_LABELS[state.currentFeeder] || 'All Feeders';
    }

    const scheduled = Math.max(80, stats.current - rand(6, 14));
    const actual = stats.current;
    const deviation = ((actual - scheduled) / scheduled) * 100;
    const availability = Math.max(actual + rand(18, 30), 160);
    const dsm = Math.max(0, Math.round(Math.abs(actual - scheduled) * 4900));
    const anomalies = Math.max(0, Math.round(Math.abs(deviation) * 1.8));

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('la-scheduled', `${scheduled.toFixed(0)} MW`);
    setText('la-actual', `${actual.toFixed(0)} MW`);
    setText('la-deviation', `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%`);
    setText('la-availability', `${availability.toFixed(0)} MW`);
    setText('la-dsm', `Rs ${dsm.toLocaleString('en-IN')}`);
    setText('la-load-anomalies', `${anomalies}`);

    const technical = state.data.losses.technical;
    const nonTechnical = state.data.losses.nonTechnical;
    const totalLoss = technical + nonTechnical;
    const feederEntries = Object.entries(state.data.losses.feeders);
    const bestFeeder = feederEntries.reduce((best, curr) => (curr[1] < best[1] ? curr : best), feederEntries[0]);
    setText('la-loss-total', `${totalLoss.toFixed(1)}%`);
    setText('la-loss-technical', `${technical.toFixed(1)}%`);
    setText('la-loss-nontechnical', `${nonTechnical.toFixed(1)}%`);
    setText('la-loss-best', bestFeeder[0]);
  }

  function renderTransmissionLossAnalytics() {
    const losses = state.data.losses;
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    const total = losses.technical + losses.nonTechnical;
    const worstFeeder = Object.entries(losses.feeders).reduce((worst, curr) => (curr[1] > worst[1] ? curr : worst), ['-', 0]);
    setText('tl-total-loss', `${total.toFixed(2)}%`);
    setText('tl-technical-loss', `${losses.technical.toFixed(2)}%`);
    setText('tl-nontechnical-loss', `${losses.nonTechnical.toFixed(2)}%`);
    setText('tl-worst-feeder', worstFeeder[0]);

    const hotspotRows = Object.entries(losses.regions)
      .map(([region, regionLoss]) => {
        const technical = clamp(regionLoss * rand(0.62, 0.82), 0.2, 3.0);
        const nonTechnical = clamp(regionLoss - technical, 0.1, 2.0);
        const totalLoss = technical + nonTechnical;
        const priority = totalLoss > 1.6 ? 'High' : totalLoss > 1.1 ? 'Medium' : 'Low';
        return { region, technical, nonTechnical, totalLoss, priority };
      })
      .sort((a, b) => b.totalLoss - a.totalLoss);

    const tbody = document.getElementById('tl-hotspots-body');
    if (tbody) {
      tbody.innerHTML = hotspotRows.map((r) => `
        <tr>
          <td>${r.region}</td>
          <td class="font-mono">${r.technical.toFixed(2)}%</td>
          <td class="font-mono">${r.nonTechnical.toFixed(2)}%</td>
          <td class="font-mono">${r.totalLoss.toFixed(2)}%</td>
          <td><span class="badge ${r.priority === 'High' ? 'badge-danger' : r.priority === 'Medium' ? 'badge-warning' : 'badge-success'}">${r.priority}</span></td>
        </tr>
      `).join('');
    }
  }

  function renderPowerQualityAnalytics() {
    const pq = state.data.powerQuality;
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('pq-tab-thd-value', `${pq.thd.toFixed(2)}%`);
    setText('pq-tab-voltage-value', `${pq.voltage.toFixed(1)}%`);
    setText('pq-tab-flicker-value', pq.flicker.toFixed(2));
    setText('pq-tab-transient-value', `${pq.transients}`);

    const compliance = pq.thd < 5 && pq.voltage > 95 && pq.flicker < 1;
    setText('pq-tab-status', compliance ? 'Grid Code: PASS' : 'Grid Code: ALERT');
  }

  function formatAlarmAge(ts) {
    const sec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  }

  function updateAlarmNavIndicator() {
    const navBtn = document.querySelector('.nav-item[data-view="live-alarms"]');
    const dot = document.getElementById('nav-alarm-dot');
    const countEl = document.getElementById('nav-alarm-count');
    if (!navBtn || !dot) return;

    const active = state.liveAlarms.filter((a) => !a.shelved);
    const unacked = active.filter((a) => !a.acked);
    const hasCritical = unacked.some((a) => a.severity === 'p1' || a.severity === 'p2');
    const onAlarmsView = state.currentView === 'live-alarms';
    const shouldNotify = unacked.length > 0 && !onAlarmsView;

    dot.hidden = !active.length;
    dot.classList.toggle('is-blink', shouldNotify);
    dot.classList.toggle('is-critical', hasCritical && shouldNotify);

    if (countEl) {
      const showCount = unacked.length > 0;
      countEl.hidden = !showCount;
      if (showCount) {
        countEl.textContent = unacked.length > 99 ? '99+' : String(unacked.length);
        countEl.classList.toggle('is-blink', shouldNotify);
      } else {
        countEl.classList.remove('is-blink');
      }
    }

    navBtn.classList.toggle('has-active-alarms', shouldNotify);
    navBtn.setAttribute(
      'aria-label',
      unacked.length
        ? `Alarms — ${unacked.length} unacknowledged active alarm${unacked.length === 1 ? '' : 's'}`
        : active.length
          ? `Alarms — ${active.length} active`
          : 'Alarms',
    );
  }

  function renderLiveAlarms() {
    const alarms = state.liveAlarms;
    const active = alarms.filter((a) => !a.shelved);
    const shelved = alarms.filter((a) => a.shelved);
    const unacked = alarms.filter((a) => !a.acked && !a.shelved);
    const critical = alarms.filter((a) => a.severity === 'p1' && !a.shelved);
    const acked = alarms.filter((a) => a.acked && !a.shelved);

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('alarm-active-count', `${active.length}`);
    setText('alarm-unacked-count', `${unacked.length}`);
    setText('alarm-critical-count', `${critical.length}`);
    setText('alarm-acked-count', `${acked.length}`);
    setText('alarm-filter-active', `${active.length}`);
    setText('alarm-filter-shelved', `${shelved.length}`);

    const rows = state.alarmFilter === 'shelved'
      ? shelved
      : state.alarmFilter === 'timeline'
        ? [...alarms].sort((a, b) => b.time - a.time)
        : active;

    const sevBadge = { p1: 'badge-danger', p2: 'badge-danger', p3: 'badge-warning', p4: 'badge-warning' };
    const tbody = document.getElementById('live-alarms-body');
    if (!tbody) return;
    tbody.innerHTML = rows.map((a) => `
      <tr>
        <td><span class="badge ${sevBadge[a.severity] || 'badge-warning'}">${a.severity.toUpperCase()}</span></td>
        <td><span class="font-mono">${formatTime(new Date(a.time))}</span><br><span class="text-micro text-muted">${formatAlarmAge(a.time)}</span></td>
        <td>${a.source}</td>
        <td>${a.message}</td>
        <td><span class="badge ${a.acked ? 'badge-success' : 'badge-warning'}">${a.acked ? 'ACKED' : 'PENDING'}</span></td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm alarm-action-btn" data-action="ack" data-id="${a.id}" ${a.acked ? 'disabled' : ''}>Ack</button>
          <button type="button" class="btn btn-secondary btn-sm alarm-action-btn" data-action="${a.shelved ? 'unshelve' : 'shelve'}" data-id="${a.id}">${a.shelved ? 'Unshelve' : 'Shelve'}</button>
        </td>
      </tr>
    `).join('');

    updateAlarmNavIndicator();
  }

  function renderSettings() {
    const s = state.settingsAccess;
    if (!s) return;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const roles = new Set(s.users.map((u) => u.role));
    setText('set-users-count', String(s.users.length));
    setText('set-roles-count', String(roles.size));
    setText('set-rls-count', String(s.rlsPolicies.length));
    setText('set-sessions-count', String(s.activeSessions));

    const userStatusBadge = { active: 'badge-success', inactive: 'badge-warning' };
    const usersBody = document.getElementById('set-users-body');
    if (usersBody) {
      usersBody.innerHTML = s.users.map((u) => `
        <tr>
          <td><strong>${u.name}</strong><br><span class="text-micro text-muted">${u.email}</span></td>
          <td><span class="settings-role-tag">${u.role}</span></td>
          <td>${u.scope}</td>
          <td><span class="badge ${userStatusBadge[u.status] || 'badge-warning'}">${u.status.toUpperCase()}</span></td>
          <td class="font-mono text-micro">${formatAlarmAge(u.lastLogin)}</td>
        </tr>
      `).join('');
    }

    const rlsBody = document.getElementById('set-rls-body');
    if (rlsBody) {
      rlsBody.innerHTML = s.rlsPolicies.map((p) => `
        <tr>
          <td><strong>${p.name}</strong></td>
          <td><code class="settings-code">${p.resource}</code></td>
          <td><code class="settings-code">${p.rule}</code></td>
          <td class="text-micro">${p.roles}</td>
          <td><span class="badge ${p.status === 'enabled' ? 'badge-success' : 'badge-warning'}">${p.status.toUpperCase()}</span></td>
        </tr>
      `).join('');
    }

    const scopeGrid = document.getElementById('set-scope-grid');
    if (scopeGrid) {
      scopeGrid.innerHTML = `
        <table class="data-table data-table--compact">
          <thead>
            <tr>
              <th>Role</th>
              <th>Zones</th>
              <th>Divisions</th>
              <th>Substations</th>
              <th>Alarms</th>
              <th>Reports</th>
            </tr>
          </thead>
          <tbody>
            ${s.scopeMatrix.map((row) => `
              <tr>
                <td><span class="settings-role-tag">${row.role}</span></td>
                <td>${row.zones}</td>
                <td>${row.divisions}</td>
                <td>${row.substations}</td>
                <td>${row.alarms}</td>
                <td>${row.reports}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const auditBody = document.getElementById('set-audit-body');
    if (auditBody) {
      auditBody.innerHTML = s.auditLog.map((e) => `
        <tr>
          <td class="font-mono text-micro">${formatTime(new Date(e.time))}<br>${formatAlarmAge(e.time)}</td>
          <td>${e.user}</td>
          <td><span class="settings-action-tag">${e.action}</span></td>
          <td>${e.resource}</td>
          <td>${e.scope}</td>
          <td><span class="badge ${e.result === 'success' ? 'badge-success' : 'badge-danger'}">${e.result.toUpperCase()}</span></td>
        </tr>
      `).join('');
    }

    const mfaToggle = document.getElementById('set-mfa-toggle');
    const auditToggle = document.getElementById('set-audit-toggle');
    const ipToggle = document.getElementById('set-ip-toggle');
    const timeoutSelect = document.getElementById('set-session-timeout');
    if (mfaToggle) mfaToggle.checked = s.security.mfa;
    if (auditToggle) auditToggle.checked = s.security.auditLogging;
    if (ipToggle) ipToggle.checked = s.security.ipAllowlist;
    if (timeoutSelect) timeoutSelect.value = s.security.sessionTimeout;
  }

  function updateDOM() {
    const data = state.data;

    // Header
    const freq = data.gridFrequency;
    document.getElementById('grid-frequency').textContent = `${freq.toFixed(2)} Hz`;
    const gridBadge = document.getElementById('grid-status-badge');
    const gridDot = document.getElementById('grid-status-dot');
    if (freq < 49.9 || freq > 50.1) {
      gridBadge?.classList.add('warning');
      gridDot.className = 'status-dot status-warning';
    } else {
      gridBadge?.classList.remove('warning');
      gridDot.className = 'status-dot status-normal';
    }

    // Overview KPIs
    document.getElementById('ov-availability').textContent = `${data.availability.toFixed(2)}%`;
    const loadMw = data.feeders[state.currentFeeder]?.mw || data.feeders.all.mw;
    document.getElementById('ov-load').textContent = `${loadMw.toFixed(1)} MW`;
    const avgAhi = data.assets.reduce((s, a) => s + a.score, 0) / data.assets.length;
    document.getElementById('ov-ahi').textContent = avgAhi.toFixed(1);
    const activeAnomalies = state.anomalyLog.filter((a) => a.level !== 'info').length;
    document.getElementById('ov-anomalies').textContent = activeAnomalies;

    if (data.trends) {
      const t = data.trends;
      const setTrend = (id, val, suffix = '%') => {
        const el = document.getElementById(id);
        if (!el) return;
        const up = val >= 0;
        el.className = `kpi-trend ${up ? 'up' : 'down'}`;
        el.textContent = `${up ? '▲' : '▼'} ${up ? '+' : ''}${val}${suffix}`;
      };
      setTrend('ov-avail-trend', t.availability);
      setTrend('ov-load-trend', t.load);
      setTrend('ov-ahi-trend', t.ahi);
      setTrend('ov-anom-trend', t.anomalies, '');
    }

    renderEnterpriseOverview();
    renderLoadAnalytics();
    renderTransmissionLossAnalytics();
    renderPowerQualityAnalytics();
    renderLiveAlarms();
    renderSettings();
    renderTsaExecutiveSummary();
    renderTsaAcLines();
    renderTsaIct();
    renderTsaReactive();
    renderTsaOutageAnalytics();
    renderTsaDeemedExempt();
    renderTsaTrippingRegister();

    // Availability
    document.getElementById('availability-pct').textContent = `${data.availability.toFixed(2)}%`;
    document.getElementById('planned-outage').textContent = `${data.plannedOutage.toFixed(2)}%`;
    document.getElementById('forced-outage').textContent = `${data.forcedOutage.toFixed(2)}%`;

    // Power quality
    const pq = data.powerQuality;
    document.getElementById('pq-thd-value').textContent = `${pq.thd.toFixed(1)}%`;
    document.getElementById('pq-voltage-value').textContent = `${pq.voltage.toFixed(1)}%`;
    document.getElementById('pq-flicker-value').textContent = pq.flicker.toFixed(2);
    document.getElementById('pq-transient-value').textContent = pq.transients;

    const compliance = pq.thd < 5 && pq.voltage > 95 && pq.flicker < 1;
    const badge = document.getElementById('grid-compliance-badge');
    badge.textContent = compliance ? 'Grid Code: PASS' : 'Grid Code: FAIL';
    badge.className = `badge ${compliance ? 'pass' : 'fail'}`;

    // Flashover alert count
    const highRisk = data.flashover.filter((f) => f.risk === 'high').length;
    document.getElementById('flashover-alert-count').textContent = `${highRisk} High-Risk Zone${highRisk !== 1 ? 's' : ''}`;

    // Sidebar status
    const sidebarStatus = document.getElementById('sidebar-status');
    if (activeAnomalies > 2) {
      sidebarStatus.textContent = 'Anomalies Detected';
    } else if (highRisk > 1) {
      sidebarStatus.textContent = 'Elevated Risk';
    } else {
      sidebarStatus.textContent = 'All Systems Normal';
    }

    renderAHITable();
    renderCBRUL();
    renderCTPT();
    renderFlashover();
    renderAnomalyFeeds();
    renderFailureRankList();
    renderFaultRisk();
    renderGridReliability();
    renderGridIntelligence();
    renderUptimeAnalytics();
    updateCharts();
  }

  function renderAHITable() {
    const tbody = document.getElementById('ahi-table-body');
    const trendIcon = { up: 'trending-up', down: 'trending-down', stable: 'minus' };
    const trendColor = { up: 'trend-up', down: 'trend-down', stable: 'trend-stable' };

    tbody.innerHTML = state.data.assets.map((a) => `
      <tr>
        <td class="font-mono font-medium">${a.id}</td>
        <td>${a.type}</td>
        <td>${a.location}</td>
        <td><span class="health-score ${healthClass(a.score)}">${a.score}</span></td>
        <td>${healthLabel(a.score)}</td>
        <td class="text-muted">${formatDateTime(new Date(Date.now() - randInt(1, 30) * 86400000)).split(',')[0]}</td>
        <td><i data-lucide="${trendIcon[a.trend]}" class="h-4 w-4 ${trendColor[a.trend]}"></i></td>
      </tr>
    `).join('');
    lucide.createIcons({ nodes: tbody.querySelectorAll('[data-lucide]') });
  }

  function renderCBRUL() {
    const container = document.getElementById('cb-rul-container');
    container.innerHTML = state.data.circuitBreakers.map((cb) => {
      const pct = (cb.opsRemaining / cb.opsTotal) * 100;
      const color = rulColor(pct);
      return `
        <div class="rul-item">
          <div class="rul-header">
            <span class="rul-name">${cb.id}</span>
            <span class="rul-value">${cb.opsRemaining.toLocaleString()} ops / ${cb.yearsRemaining.toFixed(1)} yr</span>
          </div>
          <div class="rul-bar-track">
            <div class="rul-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div>
          </div>
          <p class="mt-1 text-micro text-muted">${pct.toFixed(0)}% operations remaining before maintenance</p>
        </div>
      `;
    }).join('');
  }

  function renderCTPT() {
    const container = document.getElementById('ctpt-rul-container');
    container.innerHTML = state.data.ctpt.map((item) => {
      const pct = clamp((item.lifespan / 25) * 100, 5, 100);
      const color = rulColor(pct);
      return `
        <div class="ctpt-card">
          <h4>${item.id} <span class="text-xs font-normal text-muted">(${item.type})</span></h4>
          <div class="mb-3">
            <div class="rul-bar-track"><div class="rul-bar-fill" style="width:${pct}%;background:${color}"></div></div>
            <p class="mt-1 text-xs font-mono font-bold">${item.lifespan.toFixed(1)} years RUL</p>
          </div>
          <div class="ctpt-stat"><span>Last Test Score</span><span>${item.testScore}%</span></div>
          <div class="ctpt-stat"><span>Load Factor</span><span>${(item.loadFactor * 100).toFixed(0)}%</span></div>
          <div class="ctpt-stat"><span>Environment</span><span>${item.env}</span></div>
        </div>
      `;
    }).join('');
  }

  function renderFlashover() {
    const humidityLevels = ['Low (<50%)', 'Medium (50-70%)', 'High (>70%)'];
    const pollutionLevels = ['Low', 'Medium', 'High'];
    const matrix = document.getElementById('risk-matrix');

    let html = '<div class="rm-header"></div>';
    pollutionLevels.forEach((p) => { html += `<div class="rm-header">${p} Pollution</div>`; });

    humidityLevels.forEach((hLabel, hi) => {
      html += `<div class="rm-label">${hLabel}</div>`;
      pollutionLevels.forEach((pLabel, pi) => {
        const match = state.data.flashover.find((f) => {
          const hMatch = hi === 0 ? f.humidity < 50 : hi === 1 ? f.humidity >= 50 && f.humidity <= 70 : f.humidity > 70;
          const pMatch = f.pollution === pLabel;
          return hMatch && pMatch;
        });
        const risk = match ? match.risk : (hi + pi >= 3 ? 'medium' : 'low');
        const val = match ? match.leakage.toFixed(1) : rand(1, 5).toFixed(1);
        html += `
          <div class="risk-cell risk-${risk}">
            <span class="rc-value">${val} mA</span>
            <span class="rc-label">${match ? match.zone.split('—')[0].trim() : '—'}</span>
          </div>
        `;
      });
    });
    matrix.innerHTML = html;

    const details = document.getElementById('flashover-details');
    details.innerHTML = state.data.flashover.map((f) => `
      <div class="flashover-detail ${f.risk}">
        <p class="text-sm font-semibold">${f.zone}</p>
        <p class="mt-1 text-xs text-muted">Leakage: <span class="font-mono">${f.leakage.toFixed(1)} mA</span> · Humidity: ${f.humidity}% · Pollution: ${f.pollution}</p>
      </div>
    `).join('');
  }

  function renderAnomalyItem(a) {
    const icons = { critical: 'alert-octagon', warning: 'alert-triangle', info: 'info' };
    return `
      <div class="anomaly-item">
        <div class="anomaly-icon ${a.level}"><i data-lucide="${icons[a.level]}" class="h-4 w-4"></i></div>
        <div class="anomaly-text">
          <p>${a.msg}</p>
          <span>${formatDateTime(new Date(a.time))}</span>
        </div>
      </div>
    `;
  }

  function renderAnomalyFeeds() {
    const html = state.anomalyLog.map(renderAnomalyItem).join('');
    document.getElementById('anomaly-log').innerHTML = html;
    document.getElementById('ov-anomaly-feed').innerHTML = state.anomalyLog.slice(0, 4).map(renderAnomalyItem).join('');
    lucide.createIcons({ nodes: document.querySelectorAll('.anomaly-feed [data-lucide]') });
  }

  function renderFailureRankList() {
    document.getElementById('failure-rank-list').innerHTML = state.data.failureRanking.map((f, i) => {
      const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-n';
      return `
        <div class="failure-rank-item">
          <span class="failure-rank-num ${rankClass}">${i + 1}</span>
          <div class="flex-1">
            <p class="font-medium">${f.name}</p>
            <p class="text-micro text-muted">${f.faults} historical faults · ${f.age} yr avg equipment age</p>
          </div>
          <span class="font-mono text-sm font-bold ${f.score > 75 ? 'text-danger' : f.score > 50 ? 'text-amber' : 'text-success'}">${f.score}</span>
        </div>
      `;
    }).join('');
  }

  function renderFaultRisk() {
    const el = document.getElementById('fault-prone-table');
    if (!el) return;
    const levelBadge = { critical: 'badge-danger', high: 'badge-warning', medium: 'badge-warning', low: 'badge-success' };
    const levelLabel = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

    el.innerHTML = state.data.faultProne.map((f, i) => `
      <tr>
        <td><span class="failure-rank-num ${i < 3 ? `rank-${i + 1}` : 'rank-n'}">${i + 1}</span></td>
        <td class="font-mono font-medium">${f.asset}</td>
        <td>${f.type}</td>
        <td class="font-mono font-bold">${f.score}</td>
        <td><span class="badge ${levelBadge[f.level]}">${levelLabel[f.level]}</span></td>
      </tr>
    `).join('');

    const list = document.getElementById('loss-prone-list');
    if (list) {
      list.innerHTML = state.data.lossProne.map((l) => `
        <div class="loss-prone-item">
          <div class="flex-1 min-w-0">
            <p class="font-medium truncate">${l.area}</p>
            <div class="loss-prone-bar"><div class="loss-prone-fill bg-cyan-500" style="width:${(l.total / 7) * 100}%"></div></div>
          </div>
          <span class="font-mono text-sm font-bold shrink-0">${l.total.toFixed(1)}%</span>
        </div>
      `).join('');
    }
  }

  function renderGridReliability() {
    const container = document.getElementById('reliability-kpis');
    if (!container) return;
    const rel = state.data.reliability;
    const kpis = [
      { label: 'SAIDI', value: rel.saidi.toFixed(2), unit: 'min/customer' },
      { label: 'SAIFI', value: rel.saifi.toFixed(2), unit: 'interruptions' },
      { label: 'MAIFI', value: rel.maifi.toFixed(2), unit: 'momentary' },
      { label: 'MTBF', value: rel.mtbf.toLocaleString(), unit: 'hours' },
      { label: 'MTTR', value: rel.mttr.toFixed(1), unit: 'hours' },
    ];
    container.innerHTML = kpis.map((k) => `
      <div class="reliability-kpi">
        <p class="rk-label">${k.label}</p>
        <p class="rk-value">${k.value}</p>
        <p class="rk-unit">${k.unit}</p>
      </div>
    `).join('');
  }

  function renderGridIntelligence() {
    const ll = state.data.lostLoad;
    const kpiEl = document.getElementById('lost-load-kpis');
    if (kpiEl) {
      const total = ll.unplanned + ll.planned + ll.constraints;
      const tr = state.data.lostLoadTrends || { total: 8, unplanned: -2, planned: 1, constraints: 0 };
      kpiEl.innerHTML = `
        <div class="ll-kpi-card ll-total ll-accent-blue">
          <p class="ll-kpi-label">⚡ Total Energy Loss</p>
          <p class="ll-kpi-value">${total} MWh</p>
          <p class="ll-kpi-trend" style="color:${CHART_SUCCESS}">▲ +${tr.total}%</p>
          <p class="kpi-compare">Compared to last month</p>
        </div>
        <div class="ll-kpi-card ll-accent-green">
          <p class="ll-kpi-label">Planned</p>
          <p class="ll-kpi-value">${ll.planned}</p>
          <p class="ll-kpi-trend" style="color:${CHART_SUCCESS}">▲ +${tr.planned}%</p>
        </div>
        <div class="ll-kpi-card ll-accent-orange">
          <p class="ll-kpi-label">Unplanned</p>
          <p class="ll-kpi-value">${ll.unplanned}</p>
          <p class="ll-kpi-trend" style="color:${tr.unplanned >= 0 ? CHART_DANGER : CHART_SUCCESS}">${tr.unplanned >= 0 ? '▲' : '▼'} ${tr.unplanned}%</p>
        </div>
        <div class="ll-kpi-card ll-accent-red">
          <p class="ll-kpi-label">Constraints</p>
          <p class="ll-kpi-value">${ll.constraints}</p>
          <p class="ll-kpi-trend" style="color:var(--text-secondary)">${tr.constraints >= 0 ? '+' : ''}${tr.constraints}%</p>
        </div>
      `;
    }

    const grid = document.getElementById('compliance-grid');
    if (!grid) return;
    const fails = state.data.compliance.filter((c) => c.status === 'fail').length;
    const warns = state.data.compliance.filter((c) => c.status === 'warn').length;
    const overall = document.getElementById('compliance-overall');
    if (overall) {
      if (fails > 0) {
        overall.textContent = 'Overall: Non-Compliant';
        overall.className = 'badge badge-danger';
      } else if (warns > 0) {
        overall.textContent = 'Overall: Partial Compliance';
        overall.className = 'badge badge-warning';
      } else {
        overall.textContent = 'Overall: Compliant';
        overall.className = 'badge badge-success';
      }
    }
    grid.innerHTML = state.data.compliance.map((c) => `
      <div class="compliance-card ${c.status}">
        <h4>${c.name}</h4>
        <p class="cc-status">${c.status === 'pass' ? 'Passed' : c.status === 'warn' ? 'Attention Required' : 'Failed'}</p>
        <p class="cc-pct">${c.pct}%</p>
        <p class="cc-meta">Last Inspection: ${c.lastInspection}</p>
        <p class="cc-meta">${c.expiry !== '—' ? `Expiry: ${c.expiry}` : c.desc}</p>
      </div>
    `).join('');
  }

  function renderUptimeAnalytics() {
    const u = state.data.uptime;
    const pctEl = document.getElementById('up-uptime-pct');
    const incidentsEl = document.getElementById('up-incidents');
    const mttrEl = document.getElementById('up-mttr');
    const alertsEl = document.getElementById('up-active-alerts');
    if (pctEl) pctEl.textContent = `${u.pct30d.toFixed(2)}%`;
    if (incidentsEl) incidentsEl.textContent = `${u.incidents30d}`;
    if (mttrEl) mttrEl.textContent = `${u.mttrMin} min`;
    if (alertsEl) alertsEl.textContent = `${u.activeAlerts}`;

    syncUptimeCauseChart();

    const tbody = document.getElementById('uptime-events-body');
    if (tbody) {
      tbody.innerHTML = u.events.map((e) => `
        <tr>
          <td class="font-mono">${e.ts}</td>
          <td>${e.service}</td>
          <td>${e.region}</td>
          <td><span class="badge ${e.status === 'Degraded' ? 'badge-warning' : 'badge-success'}">${e.status}</span></td>
          <td class="font-mono">${e.duration}</td>
        </tr>
      `).join('');
    }
  }

  function updateCharts() {
    const data = state.data;

    // Overview
    if (state.charts.ovHealth) {
      syncOvHealthChart();
    }

    // Availability chart
    if (state.charts.availSpark) {
      state.data.availabilityHistory.push({ planned: data.plannedOutage, forced: data.forcedOutage });
      if (state.data.availabilityHistory.length > 48) state.data.availabilityHistory.shift();
      syncAvailabilityChart(false);
    }

    // Load profile — feeder ratio handled in applyChartTimeFilter
    if (state.charts.loadFeeder) {
      const keys = ['f1', 'f2', 'f3', 'f4'];
      state.charts.loadFeeder.data.datasets[0].data = keys.map((k) => data.feeders[k].mw);
      state.charts.loadFeeder.update('none');
    }

    if (state.charts.loadScheduledVsActual) {
      const actualNow = data.feeders.all.mw;
      const scheduledNow = Math.max(80, actualNow - 12);
      state.charts.loadScheduledVsActual.data.datasets[0].data = [scheduledNow, actualNow];
      state.charts.loadScheduledVsActual.update('none');
    }

    if (state.charts.loadProfile) {
      const feeder = state.currentFeeder;
      if (feeder === 'all') {
        state.charts.loadProfile.data.datasets[0].label = 'MW (Total)';
        state.charts.loadProfile.data.datasets[1].label = 'MVA (Total)';
      } else {
        state.charts.loadProfile.data.datasets[0].label = `MW (${feeder.toUpperCase()})`;
        state.charts.loadProfile.data.datasets[1].label = `MVA (${feeder.toUpperCase()})`;
      }
    }

    if (state.charts.tlLossMix) {
      state.charts.tlLossMix.data.datasets[0].data = [data.losses.technical, data.losses.nonTechnical];
      state.charts.tlLossMix.update('none');
    }

    if (state.charts.tlFeederLoss) {
      state.charts.tlFeederLoss.data.labels = Object.keys(data.losses.feeders);
      state.charts.tlFeederLoss.data.datasets[0].data = Object.values(data.losses.feeders);
      state.charts.tlFeederLoss.update('none');
    }

    if (state.charts.tlMonthlyTrend) {
      const m = data.losses.monthly;
      m.technical.push(clamp(data.losses.technical + rand(-0.08, 0.08), 2.4, 4.4));
      m.nonTechnical.push(clamp(data.losses.nonTechnical + rand(-0.05, 0.05), 0.7, 1.8));
      if (m.technical.length > m.labels.length) m.technical.shift();
      if (m.nonTechnical.length > m.labels.length) m.nonTechnical.shift();
      state.charts.tlMonthlyTrend.data.labels = m.labels;
      state.charts.tlMonthlyTrend.data.datasets[0].data = m.technical;
      state.charts.tlMonthlyTrend.data.datasets[1].data = m.nonTechnical;
      state.charts.tlMonthlyTrend.update('none');
    }

    if (state.charts.tlRegionLoss) {
      state.charts.tlRegionLoss.data.labels = Object.keys(data.losses.regions);
      state.charts.tlRegionLoss.data.datasets[0].data = Object.values(data.losses.regions);
      state.charts.tlRegionLoss.update('none');
    }

    // PQ gauges
    const pq = data.powerQuality;
    const gauges = [
      { chart: state.charts.pqThd, val: pq.thd, max: 8, color: pq.thd > 5 ? '#ef4444' : '#06b6d4' },
      { chart: state.charts.pqVoltage, val: pq.voltage, max: 100, color: pq.voltage < 96 ? '#ef4444' : '#22c55e' },
      { chart: state.charts.pqFlicker, val: pq.flicker, max: 1.5, color: pq.flicker > 0.8 ? '#ef4444' : '#f59e0b' },
      { chart: state.charts.pqTransient, val: pq.transients, max: 12, color: pq.transients > 6 ? '#ef4444' : '#06b6d4' },
      { chart: state.charts.pqThdTab, val: pq.thd, max: 8, color: pq.thd > 5 ? '#ef4444' : '#06b6d4' },
      { chart: state.charts.pqVoltageTab, val: pq.voltage, max: 100, color: pq.voltage < 96 ? '#ef4444' : '#22c55e' },
      { chart: state.charts.pqFlickerTab, val: pq.flicker, max: 1.5, color: pq.flicker > 0.8 ? '#ef4444' : '#f59e0b' },
      { chart: state.charts.pqTransientTab, val: pq.transients, max: 12, color: pq.transients > 6 ? '#ef4444' : '#06b6d4' },
    ];
    gauges.forEach(({ chart, val, max, color }) => {
      if (!chart) return;
      const track = getChartColors().track;
      chart.data.datasets[0].data = [val, max - val];
      chart.data.datasets[0].backgroundColor = [color, track];
      chart.update('none');
    });

    if (state.charts.pqTrend) {
      const trend = data.powerQualityTrend;
      trend.thd.push(clamp(pq.thd + rand(-0.08, 0.08), 1.8, 6.5));
      trend.flicker.push(clamp(pq.flicker + rand(-0.04, 0.04), 0.2, 1.2));
      if (trend.thd.length > trend.labels.length) trend.thd.shift();
      if (trend.flicker.length > trend.labels.length) trend.flicker.shift();
    }

    if (state.charts.pqEvents) {
      data.pqEvents.sags = clamp(Math.round(data.pqEvents.sags + rand(-1, 1)), 0, 12);
      data.pqEvents.swells = clamp(Math.round(data.pqEvents.swells + rand(-1, 1)), 0, 10);
      data.pqEvents.interruptions = clamp(Math.round(data.pqEvents.interruptions + rand(-1, 1)), 0, 8);
      data.pqEvents.harmonics = clamp(Math.round(data.pqEvents.harmonics + rand(-1, 1)), 0, 14);
      state.charts.pqEvents.data.datasets[0].data = [
        data.pqEvents.sags,
        data.pqEvents.swells,
        data.pqEvents.interruptions,
        data.pqEvents.harmonics,
      ];
      state.charts.pqEvents.update('none');
    }

    // Failure rank
    if (state.charts.failureRank) {
      state.charts.failureRank.data.labels = data.failureRanking.map((f) => f.name.replace('Substation ', ''));
      state.charts.failureRank.data.datasets[0].data = data.failureRanking.map((f) => f.score);
      state.charts.failureRank.data.datasets[0].backgroundColor = data.failureRanking.map((f) =>
        f.score > 75 ? '#ef4444' : f.score > 50 ? '#f59e0b' : '#22c55e'
      );
      state.charts.failureRank.update('none');
    }

    if (state.charts.faultProne) {
      state.charts.faultProne.data.labels = data.faultProne.map((f) => f.asset);
      state.charts.faultProne.data.datasets[0].data = data.faultProne.map((f) => f.score);
      state.charts.faultProne.data.datasets[0].backgroundColor = data.faultProne.map((f) =>
        f.level === 'critical' ? '#ef4444' : f.level === 'high' ? '#f59e0b' : f.level === 'medium' ? '#eab308' : '#22c55e'
      );
      state.charts.faultProne.update('none');
    }

    if (state.charts.lostLoad) {
      data.lostLoad.monthly = data.lostLoad.monthly.map((v) => clamp(v + rand(-8, 8), 120, 280));
    }

    if (state.charts.uptimeTrend) {
      data.uptime.dailyPct = data.uptime.dailyPct.map((v) => clamp(v + rand(-0.01, 0.01), 99.75, 100));
    }

    if (state.charts.uptimeCause) {
      syncUptimeCauseChart();
    }

    // TSA mock drift (live feel, stays near reference values)
    if (data.tsa) {
      data.tsa.monthlyTafm = clamp(data.tsa.monthlyTafm + rand(-0.02, 0.02), 98.8, 99.95);
      data.tsa.countableOutageHr = clamp(data.tsa.countableOutageHr + rand(-0.4, 0.4), 70, 110);
      data.tsa.trend.tafm = data.tsa.trend.tafm.map((v, i, arr) => {
        if (i === arr.length - 1) return data.tsa.monthlyTafm;
        return clamp(v + rand(-0.01, 0.01), 98.9, 99.95);
      });
      const cat = data.tsa.category.values;
      const bump = rand(-0.6, 0.6);
      cat[0] = clamp(cat[0] + bump, 40, 60);
      cat[1] = clamp(cat[1] - bump * 0.5, 20, 35);
      cat[2] = clamp(100 - cat[0] - cat[1], 10, 30);

      if (data.tsa.acLines?.lines) {
        data.tsa.acLines.lines.forEach((line) => {
          line.forcedOutageHr = clamp(line.forcedOutageHr + rand(-0.15, 0.15), 0, 20);
          line.exemptHr = clamp(line.exemptHr + rand(-0.05, 0.05), 0, 8);
        });
      }
      if (data.tsa.ict?.units) {
        data.tsa.ict.units.forEach((unit) => {
          unit.forcedOutageHr = clamp(unit.forcedOutageHr + rand(-0.12, 0.12), 0, 16);
        });
      }
      if (data.tsa.reactive) {
        [...(data.tsa.reactive.reactors || []), ...(data.tsa.reactive.svc || [])].forEach((asset) => {
          asset.forcedOutageHr = clamp(asset.forcedOutageHr + rand(-0.08, 0.08), 0, 12);
        });
      }
      if (data.tsa.outageAnalytics) {
        const oa = data.tsa.outageAnalytics;
        ['shutdown', 'breakdown', 'tripping'].forEach((key) => {
          oa.byCircle[key] = oa.byCircle[key].map((v) => clamp(v + rand(-0.2, 0.2), 0.2, 18));
        });
        oa.tafmTrend.values = oa.tafmTrend.values.map((v) =>
          clamp(v + rand(-0.02, 0.02), 98.8, 99.95)
        );
        oa.reasons.forEach((r) => {
          r.hours = clamp(r.hours + rand(-0.15, 0.15), 0.3, 16);
        });
        oa.pareto.forEach((r) => {
          r.hours = clamp(r.hours + rand(-0.15, 0.15), 0.3, 16);
        });
      }
      if (data.tsa.deemedExempt?.rows) {
        data.tsa.deemedExempt.rows.forEach((r) => {
          r.hours = clamp(r.hours + rand(-0.08, 0.08), 0.5, 16);
        });
      }
      if (data.tsa.trippingRegister?.rows) {
        data.tsa.trippingRegister.rows.forEach((r) => {
          r.actualOutageHr = clamp(r.actualOutageHr + rand(-0.05, 0.05), 0, 20);
        });
      }
    }

    applyChartTimeFilter(false);
  }

  // ─── Filters ─────────────────────────────────────────────────────────
  function populateZoneFilter() {
    const sel = document.getElementById('filter-zone');
    sel.innerHTML = Object.entries(FILTER_HIERARCHY).map(([k, v]) =>
      `<option value="${k}"${k === state.filters.zone ? ' selected' : ''}>${v.label}</option>`
    ).join('');
  }

  function populateDivisionFilter() {
    const sel = document.getElementById('filter-division');
    const zone = FILTER_HIERARCHY[state.filters.zone];
    if (!zone) return;
    sel.innerHTML = Object.entries(zone.divisions).map(([k, v]) =>
      `<option value="${k}"${k === state.filters.division ? ' selected' : ''}>${v.label}</option>`
    ).join('');
    if (!zone.divisions[state.filters.division]) {
      state.filters.division = Object.keys(zone.divisions)[0];
      sel.value = state.filters.division;
    }
  }

  function populateSubstationFilter() {
    const sel = document.getElementById('filter-substation');
    const div = FILTER_HIERARCHY[state.filters.zone]?.divisions[state.filters.division];
    if (!div) return;
    sel.innerHTML = Object.entries(div.substations).map(([k, v]) =>
      `<option value="${k}"${k === state.filters.substation ? ' selected' : ''}>${v}</option>`
    ).join('');
    if (!div.substations[state.filters.substation]) {
      state.filters.substation = Object.keys(div.substations)[0];
      sel.value = state.filters.substation;
    }
  }

  // ─── Date range picker ───────────────────────────────────────────────
  const DRP_PRESET_LABELS = {
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This week',
    lastWeek: 'Last week',
    thisMonth: 'This month',
    lastMonth: 'Last month',
    thisYear: 'This year',
    lastYear: 'Last year',
    allTime: 'All time',
    custom: 'Custom range',
    last7d: 'Last 7 Days',
  };

  function drpCloneDate(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
  }

  function drpStartOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  function drpEndOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);
  }

  function drpAddDays(d, days) {
    const next = drpCloneDate(d);
    next.setDate(next.getDate() + days);
    return next;
  }

  function drpAddMonths(d, months) {
    const next = drpCloneDate(d);
    next.setMonth(next.getMonth() + months);
    return next;
  }

  function drpStartOfWeek(d) {
    const next = drpStartOfDay(d);
    const day = next.getDay();
    next.setDate(next.getDate() - day);
    return next;
  }

  function drpEndOfWeek(d) {
    const next = drpStartOfWeek(d);
    next.setDate(next.getDate() + 6);
    return drpEndOfDay(next);
  }

  function drpStartOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  }

  function drpEndOfMonth(d) {
    return drpEndOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  function drpSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function drpDayKey(d) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function drpNormalizeRange(start, end) {
    const s = drpCloneDate(start);
    const e = drpCloneDate(end);
    if (s > e) return { start: e, end: s };
    return { start: s, end: e };
  }

  function drpDefaultRange() {
    const end = drpEndOfDay(new Date());
    const start = drpStartOfDay(drpAddDays(end, -6));
    return { start, end, preset: 'last7d' };
  }

  function drpGetPresetRanges(now) {
    const today = drpStartOfDay(now);
    const yesterday = drpAddDays(today, -1);
    const thisYearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const thisYearEnd = drpEndOfDay(new Date(now.getFullYear(), 11, 31));
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
    const lastYearEnd = drpEndOfDay(new Date(now.getFullYear() - 1, 11, 31));
    return {
      today: { start: today, end: drpEndOfDay(today) },
      yesterday: { start: yesterday, end: drpEndOfDay(yesterday) },
      thisWeek: { start: drpStartOfWeek(now), end: drpEndOfWeek(now) },
      lastWeek: {
        start: drpAddDays(drpStartOfWeek(now), -7),
        end: drpEndOfDay(drpAddDays(drpEndOfWeek(now), -7)),
      },
      thisMonth: { start: drpStartOfMonth(now), end: drpEndOfMonth(now) },
      lastMonth: {
        start: drpStartOfMonth(drpAddMonths(now, -1)),
        end: drpEndOfMonth(drpAddMonths(now, -1)),
      },
      thisYear: { start: thisYearStart, end: thisYearEnd },
      lastYear: { start: lastYearStart, end: lastYearEnd },
      allTime: { start: new Date(2000, 0, 1, 0, 0, 0, 0), end: drpEndOfDay(now) },
      last7d: { start: drpStartOfDay(drpAddDays(now, -6)), end: drpEndOfDay(now) },
    };
  }

  function drpFormatInputValue(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function drpParseInputValue(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function drpFormatTriggerLabel(range) {
    if (!range) return 'Select dates';
    if (range.preset && range.preset !== 'custom' && DRP_PRESET_LABELS[range.preset]) {
      return DRP_PRESET_LABELS[range.preset];
    }
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    const start = range.start.toLocaleDateString(undefined, opts);
    const end = range.end.toLocaleDateString(undefined, opts);
    return start === end ? start : `${start} – ${end}`;
  }

  function drpMonthTitle(year, month) {
    return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function drpDetectPreset(start, end) {
    const presets = drpGetPresetRanges(new Date());
    for (const [key, value] of Object.entries(presets)) {
      if (drpSameDay(value.start, start) && drpSameDay(value.end, end)) return key;
    }
    return 'custom';
  }

  const dateRangePicker = {
    open: false,
    draftStart: null,
    draftEnd: null,
    draftPreset: 'custom',
    viewMonth: null,
    selectingEnd: false,
  };

  function drpUpdateTriggerLabel() {
    const label = document.getElementById('date-range-label');
    if (label) label.textContent = drpFormatTriggerLabel(state.filters.dateRange);
  }

  function drpSyncInputs() {
    const startInput = document.getElementById('drp-start-input');
    const endInput = document.getElementById('drp-end-input');
    if (startInput && dateRangePicker.draftStart) {
      startInput.value = drpFormatInputValue(dateRangePicker.draftStart);
    }
    if (endInput && dateRangePicker.draftEnd) {
      endInput.value = drpFormatInputValue(dateRangePicker.draftEnd);
    }
  }

  function drpUpdatePresetButtons() {
    document.querySelectorAll('.drp-preset').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === dateRangePicker.draftPreset);
    });
  }

  function drpRenderCalendar(container, year, month, showPrev, showNext) {
    const start = dateRangePicker.draftStart;
    const end = dateRangePicker.draftEnd;
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = drpStartOfDay(new Date());

    let daysHtml = '';
    for (let i = 0; i < startWeekday; i++) {
      daysHtml += '<button type="button" class="drp-day empty" disabled aria-hidden="true"></button>';
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const classes = ['drp-day'];
      const inRange = start && end && date >= drpStartOfDay(start) && date <= drpEndOfDay(end);
      if (inRange) classes.push('in-range');
      if (start && drpSameDay(date, start)) classes.push('range-start');
      if (end && drpSameDay(date, end)) classes.push('range-end');
      if (drpSameDay(date, today)) classes.push('today');
      daysHtml += `<button type="button" class="${classes.join(' ')}" data-date="${drpDayKey(date)}"><span class="drp-day-inner">${day}</span></button>`;
    }

    container.innerHTML = `
      <div class="drp-cal-header">
        <div class="drp-cal-nav">${showPrev ? '<button type="button" class="drp-nav-btn" data-nav="prev" aria-label="Previous month"><i data-lucide="chevron-left" class="h-4 w-4"></i></button>' : ''}</div>
        <div class="drp-cal-title">${drpMonthTitle(year, month)}</div>
        <div class="drp-cal-nav">${showNext ? '<button type="button" class="drp-nav-btn" data-nav="next" aria-label="Next month"><i data-lucide="chevron-right" class="h-4 w-4"></i></button>' : ''}</div>
      </div>
      <div class="drp-weekdays">
        ${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => `<div class="drp-weekday">${d}</div>`).join('')}
      </div>
      <div class="drp-days">${daysHtml}</div>
    `;
    lucide.createIcons({ nodes: [container] });
  }

  function drpRenderCalendars() {
    const left = document.getElementById('drp-calendar-left');
    const right = document.getElementById('drp-calendar-right');
    if (!left || !right || !dateRangePicker.viewMonth) return;
    const y = dateRangePicker.viewMonth.getFullYear();
    const m = dateRangePicker.viewMonth.getMonth();
    const compact = drpIsCompact();
    drpRenderCalendar(left, y, m, true, compact);
    if (compact) {
      right.innerHTML = '';
      return;
    }
    const rightMonth = m === 11 ? 0 : m + 1;
    const rightYear = m === 11 ? y + 1 : y;
    drpRenderCalendar(right, rightYear, rightMonth, false, true);
  }

  function drpIsCompact() {
    return window.matchMedia('(max-width: 1023px)').matches;
  }

  function drpIsSheet() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  function drpEnsurePortal() {
    const popover = document.getElementById('date-range-popover');
    if (popover && popover.parentElement !== document.body) {
      document.body.appendChild(popover);
    }
  }

  function drpUpdateLayoutMode() {
    const popover = document.getElementById('date-range-popover');
    if (!popover) return;
    const sheet = drpIsSheet();
    const compact = drpIsCompact();
    popover.classList.toggle('drp-mode-sheet', sheet);
    popover.classList.toggle('drp-mode-modal', !sheet && compact);
    popover.classList.toggle('drp-mode-dropdown', !compact);
    document.body.classList.toggle('drp-scroll-lock', dateRangePicker.open && compact);
  }

  function drpPositionPopover() {
    const popover = document.getElementById('date-range-popover');
    const trigger = document.getElementById('date-range-trigger');
    const panel = popover?.querySelector('.drp-panel');
    if (!popover || !trigger || !panel || !dateRangePicker.open) return;

    drpUpdateLayoutMode();
    if (drpIsCompact()) {
      popover.style.removeProperty('--drp-top');
      popover.style.removeProperty('--drp-left');
      popover.style.removeProperty('--drp-width');
      return;
    }

    const panelWidth = Math.min(720, window.innerWidth - 32);
    const rect = trigger.getBoundingClientRect();
    let left = rect.left;
    const maxLeft = window.innerWidth - panelWidth - 16;
    if (left > maxLeft) left = Math.max(16, maxLeft);
    if (left < 16) left = 16;

    let top = rect.bottom + 6;
    const panelHeight = panel.offsetHeight || 420;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    if (spaceBelow < panelHeight && spaceAbove > spaceBelow) {
      top = Math.max(16, rect.top - panelHeight - 6);
    }

    popover.style.setProperty('--drp-top', `${top}px`);
    popover.style.setProperty('--drp-left', `${left}px`);
    popover.style.setProperty('--drp-width', `${panelWidth}px`);
  }

  function drpSetDraftRange(start, end, preset) {
    const normalized = drpNormalizeRange(start, end);
    dateRangePicker.draftStart = normalized.start;
    dateRangePicker.draftEnd = normalized.end;
    dateRangePicker.draftPreset = preset || drpDetectPreset(normalized.start, normalized.end);
    dateRangePicker.viewMonth = new Date(normalized.start.getFullYear(), normalized.start.getMonth(), 1);
    drpSyncInputs();
    drpUpdatePresetButtons();
    drpRenderCalendars();
  }

  function drpOpenPopover() {
    const popover = document.getElementById('date-range-popover');
    const trigger = document.getElementById('date-range-trigger');
    if (!popover || !trigger) return;
    drpEnsurePortal();
    const applied = state.filters.dateRange || drpDefaultRange();
    dateRangePicker.draftStart = drpCloneDate(applied.start);
    dateRangePicker.draftEnd = drpCloneDate(applied.end);
    dateRangePicker.draftPreset = applied.preset || 'custom';
    dateRangePicker.viewMonth = new Date(applied.start.getFullYear(), applied.start.getMonth(), 1);
    dateRangePicker.selectingEnd = false;
    popover.hidden = false;
    dateRangePicker.open = true;
    trigger.setAttribute('aria-expanded', 'true');
    drpSyncInputs();
    drpUpdatePresetButtons();
    drpRenderCalendars();
    requestAnimationFrame(() => {
      drpPositionPopover();
      lucide.createIcons({ nodes: [popover] });
    });
  }

  function drpClosePopover() {
    const popover = document.getElementById('date-range-popover');
    const trigger = document.getElementById('date-range-trigger');
    if (!popover) return;
    popover.hidden = true;
    dateRangePicker.open = false;
    document.body.classList.remove('drp-scroll-lock');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function drpApplyDraft() {
    if (!dateRangePicker.draftStart || !dateRangePicker.draftEnd) return;
    state.filters.dateRange = {
      start: drpCloneDate(dateRangePicker.draftStart),
      end: drpCloneDate(dateRangePicker.draftEnd),
      preset: dateRangePicker.draftPreset,
    };
    drpUpdateTriggerLabel();
    drpClosePopover();
  }

  function drpHandleDayClick(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const clicked = new Date(year, month, day, 0, 0, 0, 0);
    if (!dateRangePicker.draftStart || (dateRangePicker.draftStart && dateRangePicker.draftEnd && !dateRangePicker.selectingEnd)) {
      dateRangePicker.draftStart = clicked;
      dateRangePicker.draftEnd = null;
      dateRangePicker.selectingEnd = true;
    } else {
      const normalized = drpNormalizeRange(dateRangePicker.draftStart, clicked);
      dateRangePicker.draftStart = normalized.start;
      dateRangePicker.draftEnd = drpEndOfDay(normalized.end);
      dateRangePicker.selectingEnd = false;
    }
    dateRangePicker.draftPreset = dateRangePicker.draftEnd
      ? drpDetectPreset(dateRangePicker.draftStart, dateRangePicker.draftEnd)
      : 'custom';
    drpSyncInputs();
    drpUpdatePresetButtons();
    drpRenderCalendars();
  }

  function initDateRangePicker() {
    state.filters.dateRange = state.filters.dateRange || drpDefaultRange();
    drpUpdateTriggerLabel();
    drpEnsurePortal();

    const trigger = document.getElementById('date-range-trigger');
    const popover = document.getElementById('date-range-popover');
    const backdrop = document.getElementById('date-range-backdrop');
    const mobileClose = document.getElementById('drp-mobile-close');
    const cancelBtn = document.getElementById('drp-cancel');
    const applyBtn = document.getElementById('drp-apply');
    const startInput = document.getElementById('drp-start-input');
    const endInput = document.getElementById('drp-end-input');

    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dateRangePicker.open) drpClosePopover();
      else drpOpenPopover();
    });

    backdrop?.addEventListener('click', () => drpClosePopover());
    mobileClose?.addEventListener('click', () => drpClosePopover());
    cancelBtn?.addEventListener('click', () => drpClosePopover());

    applyBtn?.addEventListener('click', () => {
      drpApplyDraft();
      applyFilters();
    });

    document.querySelectorAll('.drp-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const presets = drpGetPresetRanges(new Date());
        const preset = presets[btn.dataset.preset];
        if (!preset) return;
        drpSetDraftRange(preset.start, preset.end, btn.dataset.preset);
      });
    });

    popover?.addEventListener('click', (e) => {
      e.stopPropagation();
      const navBtn = e.target.closest('[data-nav]');
      if (navBtn && dateRangePicker.viewMonth) {
        const delta = navBtn.dataset.nav === 'prev' ? -1 : 1;
        dateRangePicker.viewMonth = drpAddMonths(dateRangePicker.viewMonth, delta);
        drpRenderCalendars();
        if (!drpIsCompact()) requestAnimationFrame(drpPositionPopover);
        return;
      }
      const dayBtn = e.target.closest('.drp-day[data-date]');
      if (dayBtn) drpHandleDayClick(dayBtn.dataset.date);
    });

    startInput?.addEventListener('change', () => {
      const parsed = drpParseInputValue(startInput.value);
      if (!parsed) return;
      dateRangePicker.draftStart = parsed;
      if (dateRangePicker.draftEnd) {
        const normalized = drpNormalizeRange(dateRangePicker.draftStart, dateRangePicker.draftEnd);
        dateRangePicker.draftStart = normalized.start;
        dateRangePicker.draftEnd = normalized.end;
      }
      dateRangePicker.draftPreset = 'custom';
      drpUpdatePresetButtons();
      drpRenderCalendars();
    });

    endInput?.addEventListener('change', () => {
      const parsed = drpParseInputValue(endInput.value);
      if (!parsed) return;
      dateRangePicker.draftEnd = parsed;
      if (dateRangePicker.draftStart) {
        const normalized = drpNormalizeRange(dateRangePicker.draftStart, dateRangePicker.draftEnd);
        dateRangePicker.draftStart = normalized.start;
        dateRangePicker.draftEnd = normalized.end;
      }
      dateRangePicker.draftPreset = 'custom';
      drpUpdatePresetButtons();
      drpRenderCalendars();
    });

    document.addEventListener('click', (e) => {
      if (!dateRangePicker.open) return;
      if (e.target.closest('.filter-field-date') || e.target.closest('.date-range-popover')) return;
      drpClosePopover();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dateRangePicker.open) drpClosePopover();
    });

    window.addEventListener('resize', () => {
      if (!dateRangePicker.open) return;
      drpRenderCalendars();
      drpPositionPopover();
    });
  }

  function initFilters() {
    populateZoneFilter();
    populateDivisionFilter();
    populateSubstationFilter();
  }

  function applyFilters() {
    state.filters.zone = document.getElementById('filter-zone').value;
    state.filters.division = document.getElementById('filter-division').value;
    state.filters.substation = document.getElementById('filter-substation').value;
    initMockData();
    updateDOM();
    scheduleChartRefresh();
  }

  function clearAllFilters() {
    state.filters.zone = 'north-circle';
    state.filters.division = 'div-n1';
    state.filters.substation = 'alpha-1';
    state.filters.dateRange = drpDefaultRange();
    populateZoneFilter();
    populateDivisionFilter();
    populateSubstationFilter();
    drpUpdateTriggerLabel();
    initMockData();
    updateDOM();
    scheduleChartRefresh();
  }

  // ─── Sidebar ─────────────────────────────────────────────────────────
  function setSidebarCollapsed(collapsed) {
    state.sidebarCollapsed = collapsed;
    localStorage.setItem('substation-sidebar', collapsed ? 'collapsed' : 'expanded');
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed', collapsed);
    const btn = document.getElementById('sidebar-collapse');
    if (btn) {
      btn.innerHTML = collapsed
        ? '<i data-lucide="panel-left-open" class="h-4 w-4"></i>'
        : '<i data-lucide="panel-left-close" class="h-4 w-4"></i>';
      btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      lucide.createIcons({ nodes: [btn] });
    }
  }

  function toggleSidebarCollapse() {
    setSidebarCollapsed(!state.sidebarCollapsed);
  }

  // ─── Navigation ────────────────────────────────────────────────────────
  function switchView(viewId, clickedBtn) {
    state.currentView = viewId;
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    const viewEl = document.getElementById(`view-${viewId}`);
    if (viewEl) viewEl.classList.add('active');

    document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
      if (clickedBtn) {
        btn.classList.toggle('active', btn === clickedBtn);
      } else {
        btn.classList.toggle('active', btn.dataset.view === viewId && !btn.classList.contains('nav-alias'));
      }
    });

    document.getElementById('page-title').textContent = VIEW_TITLES[viewId] || 'Dashboard';

    const filterToolbar = document.querySelector('.filter-toolbar');
    if (filterToolbar) filterToolbar.hidden = viewId === 'settings';

    // Keep TSA parent open when a TSA child view is selected
    if (String(viewId).startsWith('tsa-')) {
      const tsaGroup = document.getElementById('nav-tsa-group');
      const tsaToggle = document.getElementById('nav-tsa-toggle');
      if (tsaGroup && tsaToggle) {
        tsaGroup.classList.add('is-open');
        tsaToggle.classList.add('is-open');
        tsaToggle.setAttribute('aria-expanded', 'true');
      }
    }

    document.getElementById('sidebar').classList.remove('open');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.remove();

    requestAnimationFrame(() => {
      scheduleChartRefresh();
      updateAlarmNavIndicator();
      lucide.createIcons();
    });
  }

  // ─── Clock ─────────────────────────────────────────────────────────────
  function startClock() {
    const el = document.getElementById('live-clock');
    const tick = () => { el.textContent = formatTime(); };
    tick();
    setInterval(tick, 1000);
  }

  // ─── Init ──────────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view, btn));
    });

    // Grouped sidebar menus: parent toggles reveal sub-menu items.
    document.querySelectorAll('.nav-group-toggle').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const groupId = toggle.getAttribute('data-nav-group-target') || toggle.getAttribute('aria-controls');
        const group = groupId ? document.getElementById(groupId) : null;
        if (!group) return;
        const open = group.classList.toggle('is-open');
        toggle.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });

    document.getElementById('tsa-ac-voltage-filter')?.addEventListener('change', (e) => {
      if (!state.data?.tsa?.acLines) return;
      state.data.tsa.acLines.voltageFilter = e.target.value;
      renderTsaAcLines();
    });

    document.getElementById('tsa-ac-export-csv')?.addEventListener('click', () => {
      exportTsaAcLinesCsv();
    });

    document.getElementById('tsa-reactive-export-csv')?.addEventListener('click', () => {
      exportTsaReactiveCsv();
    });

    document.getElementById('tsa-deemed-export-csv')?.addEventListener('click', () => {
      exportTsaDeemedExemptCsv();
    });

    document.getElementById('tsa-tripping-export-csv')?.addEventListener('click', () => {
      exportTsaTrippingRegisterCsv();
    });

    document.getElementById('tsa-deemed-body')?.addEventListener('click', (e) => {
      const link = e.target.closest('.tsa-attach-link');
      if (!link) return;
      e.preventDefault();
    });

    document.querySelectorAll('.alarm-filter-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.alarmFilter = btn.dataset.filter;
        document.querySelectorAll('.alarm-filter-tab').forEach((b) => b.classList.toggle('active', b === btn));
        renderLiveAlarms();
      });
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.alarm-action-btn');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const alarm = state.liveAlarms.find((a) => a.id === id);
      if (!alarm) return;
      if (action === 'ack') alarm.acked = true;
      if (action === 'shelve') alarm.shelved = true;
      if (action === 'unshelve') alarm.shelved = false;
      renderLiveAlarms();
    });

    document.getElementById('sidebar-collapse')?.addEventListener('click', toggleSidebarCollapse);

    document.getElementById('feeder-select').addEventListener('change', (e) => {
      state.currentFeeder = e.target.value;
      updateCharts();
      renderLoadAnalytics();
      document.getElementById('ov-load').textContent =
        `${(state.data.feeders[state.currentFeeder]?.mw || state.data.feeders.all.mw).toFixed(1)} MW`;
    });

    document.getElementById('filter-zone').addEventListener('change', (e) => {
      state.filters.zone = e.target.value;
      state.filters.division = Object.keys(FILTER_HIERARCHY[state.filters.zone].divisions)[0];
      state.filters.substation = Object.keys(
        FILTER_HIERARCHY[state.filters.zone].divisions[state.filters.division].substations
      )[0];
      populateDivisionFilter();
      populateSubstationFilter();
    });

    document.getElementById('filter-division').addEventListener('change', (e) => {
      state.filters.division = e.target.value;
      state.filters.substation = Object.keys(
        FILTER_HIERARCHY[state.filters.zone].divisions[state.filters.division].substations
      )[0];
      populateSubstationFilter();
    });

    document.getElementById('filter-substation').addEventListener('change', (e) => {
      state.filters.substation = e.target.value;
    });

    document.getElementById('filter-apply').addEventListener('click', applyFilters);
    document.getElementById('filter-clear').addEventListener('click', clearAllFilters);

    document.getElementById('set-save-security')?.addEventListener('click', () => {
      if (!state.settingsAccess) return;
      state.settingsAccess.security = {
        mfa: document.getElementById('set-mfa-toggle')?.checked ?? false,
        sessionTimeout: document.getElementById('set-session-timeout')?.value ?? '30',
        auditLogging: document.getElementById('set-audit-toggle')?.checked ?? false,
        ipAllowlist: document.getElementById('set-ip-toggle')?.checked ?? false,
      };
      const btn = document.getElementById('set-save-security');
      const prev = btn.textContent;
      btn.textContent = 'Saved';
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = prev;
        btn.disabled = false;
      }, 1500);
    });

    document.getElementById('set-add-user-btn')?.addEventListener('click', () => {
      window.alert('User provisioning is managed through your identity provider (mock).');
    });

    document.getElementById('set-export-audit')?.addEventListener('click', () => {
      window.alert('Audit log export started (mock CSV download).');
    });

    document.querySelectorAll('.chart-time-filter').forEach((sel) => {
      sel.addEventListener('change', (e) => setChartTimeFilter(e.target.value));
    });

    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      sidebar.classList.toggle('open');
      if (sidebar.classList.contains('open')) {
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', () => {
          sidebar.classList.remove('open');
          overlay.remove();
        });
        document.body.appendChild(overlay);
      }
    });
  }

  function init() {
    applyTheme(state.theme);
    setSidebarCollapsed(state.sidebarCollapsed);
    initFilters();
    initDateRangePicker();
    initMockData();
    populateTsaAcVoltageFilter();
    lucide.createIcons();
    initCharts();
    initChartFocusMode();
    applyChartTimeFilter(false);
    bindEvents();
    startClock();
    updateDOM();
    scheduleChartRefresh();

    const mainContent = document.getElementById('main-content');
    if (mainContent && typeof ResizeObserver !== 'undefined') {
      const chartResizeObserver = new ResizeObserver(() => scheduleChartRefresh());
      chartResizeObserver.observe(mainContent);
    }

    // Live data refresh every 3 seconds
    setInterval(() => {
      tickMockData();
      updateDOM();
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
