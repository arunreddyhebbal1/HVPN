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
    filters: {
      zone: 'north-circle',
      division: 'div-n1',
      substation: 'alpha-1',
    },
    charts: {},
    data: {},
    anomalyLog: [],
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
    'system-operation': 'System Operation Analytics',
    'load-analytics': 'Load Analytics',
    'asset-health': 'Asset Health & Predictive Maintenance',
    'fault-risk': 'Fault & Risk Analytics',
    'grid-reliability': 'Grid Reliability & Planning',
    'grid-intelligence': 'Grid Intelligence Analytics',
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
      losses: {
        technical: 3.2,
        nonTechnical: 1.1,
        feeders: { F1: 1.2, F2: 0.9, F3: 0.8, F4: 0.5 },
        regions: { North: 1.4, South: 1.1, East: 0.9, West: 0.9 },
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
      maintenance: { total: 8, completed: 5, pending: 2, overdue: 1 },
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
    };

    state.lastUpdateAt = Date.now();

    state.anomalyLog = [
      { level: 'critical', msg: 'Unexpected temperature spike in Transformer TX-02', time: now - 120000 },
      { level: 'warning', msg: 'Isolator pattern mismatch on Feeder F2', time: now - 300000 },
      { level: 'warning', msg: 'Elevated partial discharge in Bay B', time: now - 480000 },
      { level: 'info', msg: 'CT-202 ratio error drift detected (+0.3%)', time: now - 600000 },
      { level: 'info', msg: 'Breaker CB-102 operation time exceeded nominal', time: now - 900000 },
    ];
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

    // Overview load sparkline
    state.data.overviewLoad.push(rand(120, 160));
    if (state.data.overviewLoad.length > 20) state.data.overviewLoad.shift();

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
        labels: Array.from({ length: 20 }, (_, i) => i),
        datasets: [{
          label: 'Load (MW)',
          data: state.data.overviewLoad,
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
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { display: false },
          y: { ticks: d.ticks, grid: d.grid, border: { display: false } },
        },
      },
    });

    // Overview health distribution
    state.charts.ovHealth = new Chart(document.getElementById('ov-health-chart'), {
      type: 'doughnut',
      data: {
        labels: ['Healthy (>75)', 'Degraded (50-75)', 'Critical (<50)'],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: [CHART_SUCCESS, CHART_WARNING, CHART_DANGER],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: d.color, font: { size: 10 }, padding: 12 } },
          tooltip: d.tooltip,
        },
      },
    });

    // Availability sparkline
    state.charts.availSpark = new Chart(document.getElementById('availability-sparkline'), {
      type: 'bar',
      data: {
        labels: state.data.availabilityHistory.map((_, i) => i),
        datasets: [
          {
            label: 'Planned',
            data: state.data.availabilityHistory.map((h) => h.planned),
            backgroundColor: '#f59e0b',
            borderRadius: 1,
          },
          {
            label: 'Forced',
            data: state.data.availabilityHistory.map((h) => h.forced),
            backgroundColor: '#ef4444',
            borderRadius: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: { stacked: true, display: false },
          y: { stacked: true, display: false },
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

    // PQ gauges
    state.charts.pqThd = makeGauge(document.getElementById('pq-thd-gauge'), 2.8, 8, '#06b6d4');
    state.charts.pqVoltage = makeGauge(document.getElementById('pq-voltage-gauge'), 98.2, 100, '#22c55e');
    state.charts.pqFlicker = makeGauge(document.getElementById('pq-flicker-gauge'), 0.42, 1.5, '#f59e0b');
    state.charts.pqTransient = makeGauge(document.getElementById('pq-transient-gauge'), 3, 12, '#ef4444');

    // Loss pie
    state.charts.lossPie = new Chart(document.getElementById('loss-pie-chart'), {
      type: 'doughnut',
      data: {
        labels: ['Technical', 'Non-Technical'],
        datasets: [{
          data: [state.data.losses.technical, state.data.losses.nonTechnical],
          backgroundColor: ['#06b6d4', '#f59e0b'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: d.color } },
          tooltip: d.tooltip,
          title: { display: true, text: 'Technical vs Non-Technical (%)', color: d.color, font: { size: 12 } },
        },
      },
    });

    // Loss stacked bar
    state.charts.lossStacked = new Chart(document.getElementById('loss-stacked-chart'), {
      type: 'bar',
      data: {
        labels: ['Feeder-wise', 'Region-wise'],
        datasets: [
          ...Object.entries(state.data.losses.feeders).map(([k, v], i) => ({
            label: k,
            data: i === 0 ? [v, 0] : i === 1 ? [0, 0] : [0, 0],
          })),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: d.color } },
          tooltip: d.tooltip,
          title: { display: true, text: 'Loss Breakdown (%)', color: d.color, font: { size: 12 } },
        },
        scales: {
          x: { stacked: true, ticks: d.ticks, grid: d.grid },
          y: { stacked: true, ticks: d.ticks, grid: d.grid },
        },
      },
    });

    // Rebuild loss stacked with proper data
    const feederColors = ['#06b6d4', '#8b5cf6', '#22c55e', '#f59e0b'];
    const regionColors = ['#06b6d4', '#8b5cf6', '#22c55e', '#f59e0b'];
    state.charts.lossStacked.data.datasets = [
      ...Object.entries(state.data.losses.feeders).map(([k, v], i) => ({
        label: `Feeder ${k}`,
        data: [v, 0],
        backgroundColor: feederColors[i],
        borderRadius: 2,
      })),
      ...Object.entries(state.data.losses.regions).map(([k, v], i) => ({
        label: `Region ${k}`,
        data: [0, v],
        backgroundColor: regionColors[i],
        borderRadius: 2,
      })),
    ];
    state.charts.lossStacked.update();

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
  }

  // ─── DOM Updates ───────────────────────────────────────────────────────
  function secsAgo() {
    const s = Math.max(1, Math.round((Date.now() - (state.lastUpdateAt || Date.now())) / 1000));
    return `${s} sec ago`;
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

  function updateCharts() {
    const data = state.data;

    // Overview
    if (state.charts.ovLoad) {
      state.charts.ovLoad.data.datasets[0].data = data.overviewLoad;
      state.charts.ovLoad.update('none');
    }
    if (state.charts.ovHealth) {
      const healthy = data.assets.filter((a) => a.score > 75).length;
      const degraded = data.assets.filter((a) => a.score >= 50 && a.score <= 75).length;
      const critical = data.assets.filter((a) => a.score < 50).length;
      state.charts.ovHealth.data.datasets[0].data = [healthy, degraded, critical];
      state.charts.ovHealth.update('none');
    }

    // Availability sparkline
    if (state.charts.availSpark) {
      state.data.availabilityHistory.push({ planned: data.plannedOutage, forced: data.forcedOutage });
      if (state.data.availabilityHistory.length > 30) state.data.availabilityHistory.shift();
      state.charts.availSpark.data.datasets[0].data = state.data.availabilityHistory.map((h) => h.planned);
      state.charts.availSpark.data.datasets[1].data = state.data.availabilityHistory.map((h) => h.forced);
      state.charts.availSpark.update('none');
    }

    // Load profile
    if (state.charts.loadProfile) {
      const feeder = state.currentFeeder;
      state.charts.loadProfile.data.labels = data.loadProfile.labels;
      if (feeder === 'all') {
        state.charts.loadProfile.data.datasets[0].data = data.loadProfile.mw;
        state.charts.loadProfile.data.datasets[1].data = data.loadProfile.mva;
        state.charts.loadProfile.data.datasets[0].label = 'MW (Total)';
        state.charts.loadProfile.data.datasets[1].label = 'MVA (Total)';
      } else {
        const ratio = data.feeders[feeder].mw / data.feeders.all.mw;
        state.charts.loadProfile.data.datasets[0].data = data.loadProfile.mw.map((v) => v * ratio);
        state.charts.loadProfile.data.datasets[1].data = data.loadProfile.mva.map((v) => v * ratio);
        state.charts.loadProfile.data.datasets[0].label = `MW (${feeder.toUpperCase()})`;
        state.charts.loadProfile.data.datasets[1].label = `MVA (${feeder.toUpperCase()})`;
      }
      state.charts.loadProfile.update('none');
    }

    // Forecast
    if (state.charts.loadForecast) {
      const fc = data.loadForecast;
      state.charts.loadForecast.data.datasets[0].data = fc.actual;
      state.charts.loadForecast.data.datasets[1].data = fc.predicted;
      state.charts.loadForecast.data.datasets[2].data = fc.predicted.map((v, i) => v + fc.margin[i]);
      state.charts.loadForecast.data.datasets[3].data = fc.predicted.map((v, i) => v - fc.margin[i]);
      state.charts.loadForecast.update('none');
    }

    // Feeder comparison
    if (state.charts.loadFeeder) {
      const keys = ['f1', 'f2', 'f3', 'f4'];
      state.charts.loadFeeder.data.datasets[0].data = keys.map((k) => data.feeders[k].mw);
      state.charts.loadFeeder.update('none');
    }

    // PQ gauges
    const pq = data.powerQuality;
    const gauges = [
      { chart: state.charts.pqThd, val: pq.thd, max: 8, color: pq.thd > 5 ? '#ef4444' : '#06b6d4' },
      { chart: state.charts.pqVoltage, val: pq.voltage, max: 100, color: pq.voltage < 96 ? '#ef4444' : '#22c55e' },
      { chart: state.charts.pqFlicker, val: pq.flicker, max: 1.5, color: pq.flicker > 0.8 ? '#ef4444' : '#f59e0b' },
      { chart: state.charts.pqTransient, val: pq.transients, max: 12, color: pq.transients > 6 ? '#ef4444' : '#06b6d4' },
    ];
    gauges.forEach(({ chart, val, max, color }) => {
      if (!chart) return;
      const track = getChartColors().track;
      chart.data.datasets[0].data = [val, max - val];
      chart.data.datasets[0].backgroundColor = [color, track];
      chart.update('none');
    });

    // Loss charts
    if (state.charts.lossPie) {
      state.charts.lossPie.data.datasets[0].data = [data.losses.technical, data.losses.nonTechnical];
      state.charts.lossPie.update('none');
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
      state.charts.lostLoad.data.datasets[0].data = data.lostLoad.monthly;
      state.charts.lostLoad.update('none');
    }
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

    document.getElementById('sidebar').classList.remove('open');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.remove();

    requestAnimationFrame(() => {
      Object.values(state.charts).forEach((chart) => {
        if (chart && typeof chart.resize === 'function') chart.resize();
      });
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
    initMockData();
    lucide.createIcons();
    initCharts();
    bindEvents();
    startClock();
    updateDOM();

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
