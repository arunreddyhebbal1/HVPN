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
      zone: 'all',
      circle: 'all',
      division: 'all',
      substation: 'all',
      voltageLevel: 'all',
      dateRange: null,
    },
    charts: {},
    chartTimeFilter: 'hour',
    loadForecastInterval: 'hourly',
    zonePeakInterval: 'hourly',
    chartFocus: null,
    data: {},
    anomalyLog: [],
    liveAlarms: [],
    tick: 0,
    tsaDeemedFilter: 'all',
    tsaTrippingDrill: { level: 'zone', parentKey: null },
    currentUser: { name: 'Priya Sharma', email: 'priya.s@hvpn.gov.in', role: 'O&M Engineer' },
    tsaDeemedEditingKey: null,
    oaRegionalLevel: 'circle',
    oaCategoryFilter: { shutdown: true, breakdown: true, tripping: true },
    execTrippingLevel: 'zone',
    execCategoryFilter: { shutdown: true, breakdown: true, tripping: true },
    execTrippingDrill: { zoneKey: null, circleKey: null, zoneLabel: null, circleLabel: null },
    soAvailGranularity: 'hourly',
    soAvailMetric: 'availability',
    soAvailSelectedIndex: null,
    inventoryFy: 'all',
    inventoryStoreType: 'all',
    inventoryRequestType: 'all',
    lastUpdateAt: Date.now(),
  };

  const FILTER_ALL = 'all';
  const FILTER_DATA = window.FILTER_HIERARCHY_DATA || {};
  const FILTER_HIERARCHY = FILTER_DATA.hierarchy || {};
  const FILTER_VOLTAGE_LEVELS = FILTER_DATA.voltageLevels || [
    { value: 'all', label: 'All' },
    { value: '400', label: '400 kV' },
    { value: '220', label: '220 kV' },
    { value: '132', label: '132 kV' },
    { value: '66', label: '66 kV' },
  ];

  function isFilterAll(value) {
    return !value || value === FILTER_ALL;
  }

  function getFilterZone() {
    if (isFilterAll(state.filters.zone)) return null;
    return FILTER_HIERARCHY[state.filters.zone] || null;
  }

  function getCirclesForFilter() {
    if (!isFilterAll(state.filters.zone)) {
      return getFilterZone()?.circles || {};
    }
    const merged = {};
    Object.values(FILTER_HIERARCHY).forEach((zone) => {
      Object.assign(merged, zone.circles || {});
    });
    return merged;
  }

  function getFilterCircle() {
    if (isFilterAll(state.filters.circle)) return null;
    return getCirclesForFilter()[state.filters.circle] || null;
  }

  function getDivisionsForFilter() {
    const circles = getCirclesForFilter();
    if (!isFilterAll(state.filters.circle)) {
      return circles[state.filters.circle]?.divisions || {};
    }
    const merged = {};
    Object.values(circles).forEach((circle) => {
      Object.assign(merged, circle.divisions || {});
    });
    return merged;
  }

  function getFilterDivision() {
    if (isFilterAll(state.filters.division)) return null;
    return getDivisionsForFilter()[state.filters.division] || null;
  }

  function getSubstationsForFilter() {
    const divisions = getDivisionsForFilter();
    if (!isFilterAll(state.filters.division)) {
      return divisions[state.filters.division]?.substations || {};
    }
    const merged = {};
    Object.values(divisions).forEach((div) => {
      Object.assign(merged, div.substations || {});
    });
    return merged;
  }

  function getSubstationLabel(ss) {
    if (!ss) return '';
    if (typeof ss === 'string') return ss;
    return ss.name || ss.code || '';
  }

  function getSubstationVoltage(ss) {
    if (!ss || typeof ss === 'string') return '';
    return String(ss.voltage || '');
  }

  function getFilteredSubstationEntries(substations) {
    const entries = Object.entries(substations || {});
    const volt = state.filters.voltageLevel;
    if (isFilterAll(volt)) return entries;
    return entries.filter(([, ss]) => getSubstationVoltage(ss) === String(volt));
  }

  function ensureChildSelection(map, current) {
    if (isFilterAll(current)) return FILTER_ALL;
    if (map && map[current]) return current;
    return FILTER_ALL;
  }

  function resetFilterCascadeFromZone() {
    state.filters.circle = ensureChildSelection(getCirclesForFilter(), state.filters.circle);
    resetFilterCascadeFromCircle();
  }

  function resetFilterCascadeFromCircle() {
    state.filters.division = ensureChildSelection(getDivisionsForFilter(), state.filters.division);
    resetFilterCascadeFromDivision();
  }

  function resetFilterCascadeFromDivision() {
    const entries = getFilteredSubstationEntries(getSubstationsForFilter());
    const keys = Object.fromEntries(entries);
    state.filters.substation = ensureChildSelection(keys, state.filters.substation);
  }

  function filterAllOption(selected) {
    return `<option value="${FILTER_ALL}"${isFilterAll(selected) ? ' selected' : ''}>All</option>`;
  }

  function isOtherHierarchyLabel(value) {
    return String(value || '').trim().toLowerCase() === 'other';
  }

  function listHierarchyCircles() {
    const out = [];
    Object.entries(FILTER_HIERARCHY).forEach(([zoneKey, zone]) => {
      if (isOtherHierarchyLabel(zone?.label) || isOtherHierarchyLabel(zoneKey)) return;
      Object.entries(zone.circles || {}).forEach(([circleKey, circle]) => {
        const label = String(circle?.label || '').trim();
        if (!label || isFilterAll(label) || label.toLowerCase() === 'all') return;
        if (isFilterAll(circleKey) || String(circleKey).toLowerCase() === 'all') return;
        if (isOtherHierarchyLabel(label) || isOtherHierarchyLabel(circleKey)) return;
        out.push({ zoneKey, circleKey, label });
      });
    });
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }

  function buildOutageByCircleSeries() {
    const circles = listHierarchyCircles();
    return {
      labels: circles.map((c) => c.label),
      circleKeys: circles.map((c) => c.circleKey),
      zoneKeys: circles.map((c) => c.zoneKey),
      shutdown: circles.map((_, i) => Number((0.8 + (i % 4) * 0.9 + rand(0.2, 2.4)).toFixed(1))),
      breakdown: circles.map((_, i) => Number((1.1 + (i % 5) * 1.1 + rand(0.3, 3.2)).toFixed(1))),
      tripping: circles.map((_, i) => Number((1.4 + (i % 3) * 1.6 + rand(0.4, 4.5)).toFixed(1))),
    };
  }

  function getOutageByCircleChartSeries(oa) {
    const by = oa?.byCircle;
    if (!by?.labels?.length) {
      return { labels: [], shutdown: [], breakdown: [], tripping: [] };
    }

    const selectedCircle = !isFilterAll(state.filters.circle)
      ? getCirclesForFilter()[state.filters.circle]
      : null;

    const indices = [];
    by.labels.forEach((label, i) => {
      const name = String(label || '').trim();
      if (!name || isFilterAll(name) || name.toLowerCase() === 'all') return;
      if (isOtherHierarchyLabel(name)) return;

      const circleKey = by.circleKeys?.[i];
      const zoneKey = by.zoneKeys?.[i];
      if (circleKey && (isFilterAll(circleKey) || String(circleKey).toLowerCase() === 'all')) return;
      if (isOtherHierarchyLabel(circleKey) || isOtherHierarchyLabel(zoneKey)) return;

      if (!isFilterAll(state.filters.zone) && zoneKey && zoneKey !== state.filters.zone) return;
      if (!isFilterAll(state.filters.circle)) {
        const matchesKey = circleKey && circleKey === state.filters.circle;
        const matchesLabel = selectedCircle && selectedCircle.label === name;
        if (!matchesKey && !matchesLabel) return;
      }
      indices.push(i);
    });

    const use = indices.length
      ? indices
      : by.labels
        .map((label, i) => ({ label, i }))
        .filter(({ label }) => {
          const name = String(label || '').trim();
          return name && !isFilterAll(name) && name.toLowerCase() !== 'all';
        })
        .map(({ i }) => i);

    return {
      labels: use.map((i) => by.labels[i]),
      shutdown: use.map((i) => Number(by.shutdown[i]) || 0),
      breakdown: use.map((i) => Number(by.breakdown[i]) || 0),
      tripping: use.map((i) => Number(by.tripping[i]) || 0),
    };
  }

  function listHierarchyZones() {
    return Object.entries(FILTER_HIERARCHY)
      .filter(([zoneKey, zone]) => !isOtherHierarchyLabel(zone?.label) && !isOtherHierarchyLabel(zoneKey))
      .map(([zoneKey, zone]) => ({ zoneKey, label: zone.label || zoneKey }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function listHierarchyDivisions() {
    const out = [];
    Object.entries(FILTER_HIERARCHY).forEach(([zoneKey, zone]) => {
      if (isOtherHierarchyLabel(zone?.label) || isOtherHierarchyLabel(zoneKey)) return;
      Object.entries(zone.circles || {}).forEach(([circleKey, circle]) => {
        if (isOtherHierarchyLabel(circle?.label) || isOtherHierarchyLabel(circleKey)) return;
        Object.entries(circle.divisions || {}).forEach(([divisionKey, division]) => {
          if (isOtherHierarchyLabel(division?.label) || isOtherHierarchyLabel(divisionKey)) return;
          out.push({
            zoneKey,
            circleKey,
            divisionKey,
            label: division.label || divisionKey,
          });
        });
      });
    });
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }

  function getOaRegionalSeries(oa, level = state.oaRegionalLevel) {
    const seed = hashFilterSeed();
    const cats = state.oaCategoryFilter || { shutdown: true, breakdown: true, tripping: true };
    const mask = (vals) => vals.map((v, i) => Number((v * (0.92 + seededUnit(seed, i + 17) * 0.16)).toFixed(1)));

    if (level === 'circle') {
      const series = getOutageByCircleChartSeries(oa);
      return {
        level: 'Circle',
        labels: series.labels,
        shutdown: cats.shutdown ? series.shutdown : series.shutdown.map(() => 0),
        breakdown: cats.breakdown ? series.breakdown : series.breakdown.map(() => 0),
        tripping: cats.tripping ? series.tripping : series.tripping.map(() => 0),
      };
    }

    if (level === 'zone') {
      const by = oa?.byCircle;
      const zones = listHierarchyZones().filter((z) =>
        isFilterAll(state.filters.zone) || z.zoneKey === state.filters.zone
      );
      const shutdown = [];
      const breakdown = [];
      const tripping = [];
      zones.forEach((zone, zi) => {
        let s = 0;
        let b = 0;
        let t = 0;
        (by?.zoneKeys || []).forEach((zk, i) => {
          if (zk !== zone.zoneKey) return;
          s += Number(by.shutdown[i]) || 0;
          b += Number(by.breakdown[i]) || 0;
          t += Number(by.tripping[i]) || 0;
        });
        if (!s && !b && !t) {
          s = 2.4 + seededUnit(seed, zi + 1) * 4;
          b = 1.8 + seededUnit(seed, zi + 2) * 3.5;
          t = 2.1 + seededUnit(seed, zi + 3) * 5;
        }
        shutdown.push(Number(s.toFixed(1)));
        breakdown.push(Number(b.toFixed(1)));
        tripping.push(Number(t.toFixed(1)));
      });
      return {
        level: 'Zone',
        labels: zones.map((z) => z.label),
        shutdown: cats.shutdown ? shutdown : shutdown.map(() => 0),
        breakdown: cats.breakdown ? breakdown : breakdown.map(() => 0),
        tripping: cats.tripping ? tripping : tripping.map(() => 0),
      };
    }

    const divisions = listHierarchyDivisions().filter((div) => {
      if (!isFilterAll(state.filters.zone) && div.zoneKey !== state.filters.zone) return false;
      if (!isFilterAll(state.filters.circle) && div.circleKey !== state.filters.circle) return false;
      if (!isFilterAll(state.filters.division) && div.divisionKey !== state.filters.division) return false;
      return true;
    });
    const shutdown = divisions.map((_, i) => Number((1.2 + seededUnit(seed, i + 40) * 4.2).toFixed(1)));
    const breakdown = divisions.map((_, i) => Number((0.9 + seededUnit(seed, i + 50) * 3.8).toFixed(1)));
    const tripping = divisions.map((_, i) => Number((1.4 + seededUnit(seed, i + 60) * 5.1).toFixed(1)));
    return {
      level: 'Division',
      labels: divisions.map((d) => d.label),
      shutdown: cats.shutdown ? shutdown : shutdown.map(() => 0),
      breakdown: cats.breakdown ? breakdown : breakdown.map(() => 0),
      tripping: cats.tripping ? tripping : tripping.map(() => 0),
    };
  }

  function applyExecCategoryMask(cats, shutdown, breakdown, tripping) {
    return {
      shutdown: cats.shutdown ? shutdown : shutdown.map(() => 0),
      breakdown: cats.breakdown ? breakdown : breakdown.map(() => 0),
      tripping: cats.tripping ? tripping : tripping.map(() => 0),
    };
  }

  function getExecTrippingSeries() {
    const oa = state.data?.tsa?.outageAnalytics;
    const cats = state.execCategoryFilter || { shutdown: true, breakdown: true, tripping: true };
    const drill = state.execTrippingDrill || {};
    const seed = hashFilterSeed();
    const by = oa?.byCircle;

    if (drill.circleKey) {
      const divisions = listHierarchyDivisions().filter((div) => {
        if (div.circleKey !== drill.circleKey) return false;
        if (!isFilterAll(state.filters.zone) && div.zoneKey !== state.filters.zone) return false;
        if (!isFilterAll(state.filters.division) && div.divisionKey !== state.filters.division) return false;
        return true;
      });
      const shutdown = divisions.map((_, i) => Number((1.2 + seededUnit(seed, i + 40) * 4.2).toFixed(1)));
      const breakdown = divisions.map((_, i) => Number((0.9 + seededUnit(seed, i + 50) * 3.8).toFixed(1)));
      const tripping = divisions.map((_, i) => Number((1.4 + seededUnit(seed, i + 60) * 5.1).toFixed(1)));
      const masked = applyExecCategoryMask(cats, shutdown, breakdown, tripping);
      return {
        level: 'Division',
        drillLabel: drill.circleLabel || drill.zoneLabel,
        labels: divisions.map((d) => d.label),
        meta: divisions.map((d) => ({ zoneKey: d.zoneKey, circleKey: d.circleKey, divisionKey: d.divisionKey })),
        ...masked,
      };
    }

    if (drill.zoneKey) {
      const circles = listHierarchyCircles().filter((c) => {
        if (c.zoneKey !== drill.zoneKey) return false;
        if (!isFilterAll(state.filters.circle) && c.circleKey !== state.filters.circle) return false;
        return true;
      });
      const shutdown = [];
      const breakdown = [];
      const tripping = [];
      circles.forEach((c, i) => {
        const idx = by?.circleKeys?.indexOf(c.circleKey) ?? -1;
        if (idx >= 0) {
          shutdown.push(Number(by.shutdown[idx]) || 0);
          breakdown.push(Number(by.breakdown[idx]) || 0);
          tripping.push(Number(by.tripping[idx]) || 0);
        } else {
          shutdown.push(Number((1.2 + seededUnit(seed, i + 20) * 4.2).toFixed(1)));
          breakdown.push(Number((0.9 + seededUnit(seed, i + 30) * 3.8).toFixed(1)));
          tripping.push(Number((1.4 + seededUnit(seed, i + 40) * 5.1).toFixed(1)));
        }
      });
      const masked = applyExecCategoryMask(cats, shutdown, breakdown, tripping);
      return {
        level: 'Circle',
        drillLabel: drill.zoneLabel,
        labels: circles.map((c) => c.label),
        meta: circles.map((c) => ({ zoneKey: c.zoneKey, circleKey: c.circleKey })),
        ...masked,
      };
    }

    const level = state.execTrippingLevel || 'zone';
    if (level === 'circle') {
      const series = getOutageByCircleChartSeries(oa);
      const meta = series.labels.map((_, i) => ({
        zoneKey: by?.zoneKeys?.[i] || null,
        circleKey: by?.circleKeys?.[i] || null,
      }));
      const masked = applyExecCategoryMask(cats, series.shutdown, series.breakdown, series.tripping);
      return { level: 'Circle', labels: series.labels, meta, ...masked };
    }

    if (level === 'zone') {
      const zones = listHierarchyZones().filter((z) =>
        isFilterAll(state.filters.zone) || z.zoneKey === state.filters.zone
      );
      const shutdown = [];
      const breakdown = [];
      const tripping = [];
      zones.forEach((zone, zi) => {
        let s = 0;
        let b = 0;
        let t = 0;
        (by?.zoneKeys || []).forEach((zk, i) => {
          if (zk !== zone.zoneKey) return;
          s += Number(by.shutdown[i]) || 0;
          b += Number(by.breakdown[i]) || 0;
          t += Number(by.tripping[i]) || 0;
        });
        if (!s && !b && !t) {
          s = 2.4 + seededUnit(seed, zi + 1) * 4;
          b = 1.8 + seededUnit(seed, zi + 2) * 3.5;
          t = 2.1 + seededUnit(seed, zi + 3) * 5;
        }
        shutdown.push(Number(s.toFixed(1)));
        breakdown.push(Number(b.toFixed(1)));
        tripping.push(Number(t.toFixed(1)));
      });
      const masked = applyExecCategoryMask(cats, shutdown, breakdown, tripping);
      return {
        level: 'Zone',
        labels: zones.map((z) => z.label),
        meta: zones.map((z) => ({ zoneKey: z.zoneKey })),
        ...masked,
      };
    }

    const divisions = listHierarchyDivisions().filter((div) => {
      if (!isFilterAll(state.filters.zone) && div.zoneKey !== state.filters.zone) return false;
      if (!isFilterAll(state.filters.circle) && div.circleKey !== state.filters.circle) return false;
      if (!isFilterAll(state.filters.division) && div.divisionKey !== state.filters.division) return false;
      return true;
    });
    const shutdown = divisions.map((_, i) => Number((1.2 + seededUnit(seed, i + 40) * 4.2).toFixed(1)));
    const breakdown = divisions.map((_, i) => Number((0.9 + seededUnit(seed, i + 50) * 3.8).toFixed(1)));
    const tripping = divisions.map((_, i) => Number((1.4 + seededUnit(seed, i + 60) * 5.1).toFixed(1)));
    const masked = applyExecCategoryMask(cats, shutdown, breakdown, tripping);
    return {
      level: 'Division',
      labels: divisions.map((d) => d.label),
      meta: divisions.map((d) => ({ zoneKey: d.zoneKey, circleKey: d.circleKey, divisionKey: d.divisionKey })),
      ...masked,
    };
  }

  function getOaFilteredDeemedRows() {
    const rows = state.data?.tsa?.deemedExempt?.rows || [];
    return rows.filter((row) => {
      if (!isFilterAll(state.filters.substation)) {
        const subs = getSubstationsForFilter();
        const match = Object.values(subs).some((ss) =>
          row.element?.includes(getSubstationLabel(ss)) || row.element?.includes(ss?.label)
        );
        if (!match && !row.element?.toLowerCase().includes('kv')) return false;
      }
      return true;
    });
  }

  function buildOaDashboardSnapshot(oa) {
    const seed = hashFilterSeed();
    const deemed = getOaFilteredDeemedRows();
    const trips = getTsaTrippingRows();
    const target = oa?.target ?? 98.5;
    const scale = 0.88 + (seed % 9) * 0.03;

    const sumByCat = (cat) => deemed.filter((r) => r.category === cat);
    const trippingRows = sumByCat('Tripping');
    const breakdownRows = sumByCat('Breakdown');
    const shutdownRows = sumByCat('Shutdown');
    const sumHours = (rows) => rows.reduce((s, r) => s + r.hours, 0);
    const plannedRows = deemed.filter((r) => /maintenance|testing|construction|oil/i.test(r.reason || ''));
    const unplannedRows = deemed.filter((r) => !plannedRows.includes(r));

    const totalHours = sumHours(deemed) * scale || 52.4;
    const countableHours = deemed.filter((r) => r.countable === 'Counted').reduce((s, r) => s + r.hours, 0) * scale;
    const exemptHours = deemed.filter((r) => r.countable === 'Deemed exempt').reduce((s, r) => s + r.hours, 0) * scale;
    const effectiveHours = countableHours * 0.94;
    const netHours = Math.max(totalHours - exemptHours * 0.35, 0);

    const tsa = clamp((oa?.tafmTrend?.values?.slice(-1)[0] ?? 99.62) - (seed % 5) * 0.02, 98.2, 99.95);
    const gap = tsa - target;

    const waterfall = {
      steps: [
        { label: 'Nominal', range: [target, 100] },
        { label: 'Shutdown', range: [tsa + 0.42, tsa + 0.42 + 0.38] },
        { label: 'Breakdown', range: [tsa + 0.18, tsa + 0.42] },
        { label: 'Trip Penalty', range: [tsa + 0.08, tsa + 0.18] },
        { label: 'Generator', range: [tsa + 0.03, tsa + 0.08] },
        { label: 'Other', range: [tsa, tsa + 0.03] },
        { label: 'Actual TSA', range: [tsa - 0.02, tsa + 0.02] },
      ],
      actual: tsa,
    };

    const durationBuckets = {
      labels: ['< 6 hrs', '6–12 hrs', '12–24 hrs', '> 1 Day'],
      values: [
        Math.round(8 + seededUnit(seed, 71) * 10),
        Math.round(5 + seededUnit(seed, 72) * 8),
        Math.round(3 + seededUnit(seed, 73) * 6),
        Math.round(1 + seededUnit(seed, 74) * 4),
      ],
    };

    const voltageWeight = (kv) => (kv >= 400 ? 1.4 : kv >= 220 ? 1.2 : kv >= 132 ? 1.0 : 0.8);
    const impactElements = (oa?.pareto || []).map((item, i) => {
      const tripsCount = trips[i % trips.length]?.z || Math.round(1 + seededUnit(seed, i + 80) * 4);
      const kvMatch = item.label.match(/(\d+)kV/i);
      const kv = kvMatch ? Number(kvMatch[1]) : 220;
      const impact = Number((item.hours * (1 + tripsCount * 0.15) * voltageWeight(kv)).toFixed(1));
      return {
        name: item.label,
        hours: item.hours,
        trips: tripsCount,
        kv,
        impact,
        generator: /ict|generator|gss/i.test(item.label),
      };
    }).sort((a, b) => b.impact - a.impact);

    const generatorEvents = impactElements.filter((e) => e.generator);
    const longDuration = [...deemed]
      .filter((r) => r.hours >= 6)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5)
      .map((r) => ({ element: r.element, hours: r.hours, category: r.category, date: r.date }));

    const regional = getOaRegionalSeries(oa, 'circle');
    const underperforming = regional.labels.map((label, i) => {
      const total = (regional.shutdown[i] || 0) + (regional.breakdown[i] + regional.tripping[i]);
      const unitTsa = clamp(100 - total * 0.045, 97.5, 99.9);
      return { unit: label, level: 'Circle', tsa: unitTsa, target, gap: unitTsa - target };
    }).filter((u) => u.tsa < target).sort((a, b) => a.gap - b.gap);

    return {
      tsa,
      target,
      gap,
      totalHours,
      countableHours,
      effectiveHours,
      netHours,
      tripping: { count: trippingRows.length || Math.round(12 + seed % 8), hours: sumHours(trippingRows) * scale || 24.6 },
      breakdown: { count: breakdownRows.length || Math.round(8 + seed % 6), hours: sumHours(breakdownRows) * scale || 16.8 },
      shutdown: { count: shutdownRows.length || Math.round(6 + seed % 5), hours: sumHours(shutdownRows) * scale || 11.0 },
      planned: { count: plannedRows.length || 7, hours: sumHours(plannedRows) * scale || 14.2 },
      unplanned: { count: unplannedRows.length || 31, hours: sumHours(unplannedRows) * scale || 38.2 },
      waterfall,
      durationBuckets,
      impactElements,
      generatorEvents: {
        count: generatorEvents.length || 4,
        hours: generatorEvents.reduce((s, e) => s + e.hours, 0) || 18.5,
      },
      longDuration,
      underperforming,
    };
  }

  function getOaActiveScopeLabel() {
    const parts = [];
    const zone = getFilterZone();
    const circle = getFilterCircle();
    const division = getFilterDivision();
    const subs = getSubstationsForFilter();
    const ss = !isFilterAll(state.filters.substation) ? subs[state.filters.substation] : null;
    if (ss) parts.push(getSubstationLabel(ss));
    else if (division) parts.push(division.label);
    else if (circle) parts.push(circle.label);
    else if (zone) parts.push(zone.label);
    else parts.push('All Zones');
    const preset = state.filters.dateRange?.preset || 'last7';
    const presetLabels = {
      last7: 'Last 7 Days',
      thisMonth: 'Month-to-Date',
      thisYear: 'YTD',
      allTime: 'All Time',
    };
    parts.push(presetLabels[preset] || 'Custom Range');
    return parts.join(' · ');
  }

  function applyOaKpiTone(cardEl, tone) {
    if (!cardEl) return;
    cardEl.classList.remove('tsa-kpi-tone-good', 'tsa-kpi-tone-warn', 'tsa-kpi-tone-bad');
    if (tone) cardEl.classList.add(`tsa-kpi-tone-${tone}`);
  }

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
    'inventory-overview': 'Inventory — Overview & Store Summary',
    'inventory-consumption-and-age': 'Inventory — Consumption & Age Analytics',
    'inventory-category-distribution': 'Inventory — Circle & Category Distribution',
  };

  const VIEW_ROUTES = {
    'inventory/overview': 'inventory-overview',
    'inventory/consumption-and-age': 'inventory-consumption-and-age',
    'inventory/category-distribution': 'inventory-category-distribution',
  };
  const ROUTE_BY_VIEW = Object.fromEntries(
    Object.entries(VIEW_ROUTES).map(([route, viewId]) => [viewId, route])
  );

  function viewIdFromHash() {
    const path = (location.hash || '').replace(/^#\/?/, '').trim();
    return VIEW_ROUTES[path] || null;
  }

  function syncHashFromView(viewId) {
    const route = ROUTE_BY_VIEW[viewId];
    if (!route) return;
    const next = `#/${route}`;
    if (location.hash !== next) location.hash = next;
  }

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
  const LOSS_BAR_NEUTRAL = '#60A5FA';
  const LOSS_MONTHLY_HIGH = '#ef4444';
  const LOSS_MONTHLY_LOW = '#22c55e';
  const LOSS_MONTHLY_NORMAL = '#5b5ce2';
  const LOSS_MONTHLY_HIGH_DARK = '#991b1b';
  const LOSS_MONTHLY_HIGH_LIGHT = '#ff9d9d';
  const LOSS_MONTHLY_LOW_DARK = '#166534';
  const LOSS_MONTHLY_LOW_LIGHT = '#9ef5b3';

  function lossMonthlyBarColor(ctx) {
    const value = Number(ctx.raw);
    const chart = ctx.chart;
    const data = (chart.data.datasets[0].data || []).map((v) => Number(v) || 0);
    if (!data.length) return LOSS_MONTHLY_NORMAL;
    const max = Math.max(...data);
    const min = Math.min(...data);
    if (max !== min && value === max) {
      const { ctx: canvas, chartArea } = chart;
      if (!chartArea) return LOSS_MONTHLY_HIGH;
      const g = canvas.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
      g.addColorStop(0, LOSS_MONTHLY_HIGH_DARK);
      g.addColorStop(0.5, LOSS_MONTHLY_HIGH);
      g.addColorStop(1, LOSS_MONTHLY_HIGH_LIGHT);
      return g;
    }
    if (max !== min && value === min) {
      const { ctx: canvas, chartArea } = chart;
      if (!chartArea) return LOSS_MONTHLY_LOW;
      const g = canvas.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
      g.addColorStop(0, LOSS_MONTHLY_LOW_DARK);
      g.addColorStop(0.5, LOSS_MONTHLY_LOW);
      g.addColorStop(1, LOSS_MONTHLY_LOW_LIGHT);
      return g;
    }
    const { ctx: canvas, chartArea } = chart;
    if (!chartArea) return LOSS_MONTHLY_NORMAL;
    const gradient = canvas.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    gradient.addColorStop(0, '#4338ca');
    gradient.addColorStop(0.35, '#6d5ef5');
    gradient.addColorStop(0.70, '#4f8df8');
    gradient.addColorStop(1, '#22d3c5');
    return gradient;
  }

  function uptimeTrendBarColor(ctx) {
    const value = Number(ctx.raw);
    const chart = ctx.chart;
    const data = (chart.data.datasets[0].data || []).map((v) => Number(v) || 0);
    if (!data.length) return LOSS_MONTHLY_NORMAL;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const { ctx: canvas, chartArea } = chart;
    if (max !== min && value === max) {
      if (!chartArea) return LOSS_MONTHLY_LOW;
      const g = canvas.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
      g.addColorStop(0, LOSS_MONTHLY_LOW_DARK);
      g.addColorStop(0.5, LOSS_MONTHLY_LOW);
      g.addColorStop(1, LOSS_MONTHLY_LOW_LIGHT);
      return g;
    }
    if (max !== min && value === min) {
      if (!chartArea) return LOSS_MONTHLY_HIGH;
      const g = canvas.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
      g.addColorStop(0, LOSS_MONTHLY_HIGH_DARK);
      g.addColorStop(0.5, LOSS_MONTHLY_HIGH);
      g.addColorStop(1, LOSS_MONTHLY_HIGH_LIGHT);
      return g;
    }
    if (!chartArea) return LOSS_MONTHLY_NORMAL;
    const gradient = canvas.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    gradient.addColorStop(0, '#4338ca');
    gradient.addColorStop(0.35, '#6d5ef5');
    gradient.addColorStop(0.70, '#4f8df8');
    gradient.addColorStop(1, '#22d3c5');
    return gradient;
  }

  const monthlyLossDataLabelsPlugin = {
    id: 'monthlyLossDataLabels',
    afterDatasetsDraw(chart) {
      if (chart.canvas?.id !== 'tl-monthly-trend-chart') return;
      const dataset = chart.data.datasets?.[0];
      const values = (dataset?.data || []).map((v) => Number(v));
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.length || !values.length) return;
      const { ctx } = chart;

      meta.data.forEach((bar, i) => {
        const value = values[i];
        if (!Number.isFinite(value)) return;
        const prev = i > 0 ? values[i - 1] : null;
        const diff = prev == null ? null : Number((value - prev).toFixed(1));

        ctx.save();
        ctx.textAlign = 'center';

        // Top value label
        ctx.fillStyle = isDark() ? '#F8FAFC' : '#222222';
        ctx.textBaseline = 'bottom';
        ctx.font = "700 13px 'Inter', sans-serif";
        ctx.fillText(`${value.toFixed(1)}%`, bar.x, bar.y - 2);

        // Delta label above value (except first point)
        if (diff != null) {
          let deltaText = '\u25AC 0';
          let deltaColor = '#666666';
          if (diff > 0) {
            deltaText = `\u25B2 +${diff}`;
            deltaColor = '#dc2626';
          } else if (diff < 0) {
            deltaText = `\u25BC ${Math.abs(diff)}`;
            deltaColor = '#16a34a';
          }
          ctx.fillStyle = deltaColor;
          ctx.font = "700 11px 'Inter', sans-serif";
          ctx.fillText(deltaText, bar.x, bar.y - 24);
        }
        ctx.restore();
      });
    },
  };

  function buildLossGeoData() {
    const zones = {};
    const circles = {};
    Object.entries(FILTER_HIERARCHY).forEach(([zoneKey, zone]) => {
      if (isOtherHierarchyLabel(zone?.label) || isOtherHierarchyLabel(zoneKey)) return;
      zones[zone.label] = Number(rand(0.9, 2.4).toFixed(2));
      Object.entries(zone.circles || {}).forEach(([circleKey, circle]) => {
        if (isOtherHierarchyLabel(circle?.label) || isOtherHierarchyLabel(circleKey)) return;
        circles[circle.label] = Number(rand(0.6, 2.8).toFixed(2));
      });
    });
    return { zones, circles };
  }

  function buildLossHotspots(geo) {
    const rows = [];
    Object.entries(FILTER_HIERARCHY).forEach(([zoneKey, zone]) => {
      if (isOtherHierarchyLabel(zone?.label) || isOtherHierarchyLabel(zoneKey)) return;
      Object.entries(zone.circles || {}).forEach(([circleKey, circle]) => {
        if (isOtherHierarchyLabel(circle?.label) || isOtherHierarchyLabel(circleKey)) return;
        const loss = geo.circles[circle.label] ?? rand(0.6, 2.8);
        const value = Number(Number(loss).toFixed(2));
        rows.push({
          zone: zone.label,
          circle: circle.label,
          loss: value,
          priority: value > 2.4 ? 'Critical' : value > 2.0 ? 'High' : value > 1.4 ? 'Medium' : 'Normal',
        });
      });
    });
    return rows.sort((a, b) => b.loss - a.loss);
  }

  function lossBarHighlightColors(values, neutral = LOSS_BAR_NEUTRAL) {
    const nums = values.map((v) => Number(v) || 0);
    if (!nums.length) return [];
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    const maxIdx = nums.indexOf(max);
    const minIdx = nums.indexOf(min);
    return nums.map((_, i) => {
      if (max !== min && i === maxIdx) return CHART_DANGER;
      if (max !== min && i === minIdx) return CHART_SUCCESS;
      return neutral;
    });
  }

  const lossBarValuePlugin = {
    id: 'lossBarValueLabels',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.length) return;
      const { ctx } = chart;
      const horizontal = chart.options.indexAxis === 'y';
      meta.data.forEach((bar, i) => {
        const val = chart.data.datasets[0].data[i];
        if (val == null) return;
        const label = `${Number(val).toFixed(1)}%`;
        ctx.save();
        ctx.fillStyle = isDark() ? '#F8FAFC' : '#0F172A';
        ctx.font = "600 10px 'Inter', sans-serif";
        if (horizontal) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, bar.x + 6, bar.y);
        } else {
          const { top } = chart.chartArea;
          const above = bar.y - 6;
          ctx.textAlign = 'center';
          if (above < top + 14) {
            ctx.textBaseline = 'top';
            ctx.fillText(label, bar.x, bar.y + 6);
          } else {
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, bar.x, above);
          }
        }
        ctx.restore();
      });
    },
  };

  function syncLossMonthlyChart(chart, monthly) {
    if (!chart || !monthly) return;
    const values = monthly.total.map(Number);
    chart.data.labels = monthly.labels.slice();
    chart.data.datasets[0].data = values;
    const yScale = getMonthlyLossYScale(values);
    if (chart.options.scales?.y) {
      chart.options.scales.y.min = yScale.min;
      chart.options.scales.y.max = yScale.max;
      chart.options.scales.y.beginAtZero = false;
      chart.options.scales.y.grid = { display: false };
    }
    if (chart.canvas?.offsetParent !== null) chart.resize();
    chart.update('none');
  }

  const GEO_LOSS_FILL_CLASSES = [
    'so-geo-loss-fill--c1',
    'so-geo-loss-fill--c2',
    'so-geo-loss-fill--c3',
    'so-geo-loss-fill--c4',
    'so-geo-loss-fill--c5',
  ];

  function buildGeoLossRows(map) {
    return Object.entries(map || {})
      .map(([name, loss]) => ({ name, loss: Number(loss) || 0 }))
      .filter((row) => row.name && !isOtherHierarchyLabel(row.name))
      .sort((a, b) => b.loss - a.loss);
  }

  function renderGeoLossList(listId, avgId, map, { showNotes = false } = {}) {
    const listEl = document.getElementById(listId);
    const avgEl = document.getElementById(avgId);
    if (!listEl) return;

    const rows = buildGeoLossRows(map);
    if (!rows.length) {
      listEl.innerHTML = '<p class="so-geo-loss-empty">No loss data</p>';
      if (avgEl) avgEl.textContent = 'Average : —';
      return;
    }

    const max = Math.max(...rows.map((r) => r.loss), 0.01);
    const avg = rows.reduce((sum, r) => sum + r.loss, 0) / rows.length;
    if (avgEl) avgEl.textContent = `Average : ${avg.toFixed(2)}%`;

    const maxIdx = 0;
    const minIdx = rows.length - 1;
    const distinct = rows.length > 1 && rows[maxIdx].loss !== rows[minIdx].loss;

    listEl.innerHTML = rows.map((row, i) => {
      const isHigh = distinct && i === maxIdx;
      const isLow = distinct && i === minIdx;
      const width = Math.max(8, Math.round((row.loss / max) * 100));
      let fillClass = GEO_LOSS_FILL_CLASSES[(i - (isHigh ? 1 : 0)) % GEO_LOSS_FILL_CLASSES.length];
      if (isHigh) fillClass = 'so-geo-loss-fill--high';
      if (isLow) fillClass = 'so-geo-loss-fill--low';

      let badge = '';
      if (isHigh) badge = '<span class="so-geo-loss-badge so-geo-loss-badge--high">Highest</span>';
      if (isLow) badge = '<span class="so-geo-loss-badge so-geo-loss-badge--low">Lowest</span>';

      let note = '';
      if (showNotes && isHigh) {
        note = '<div class="so-geo-loss-note so-geo-loss-note--up">▲ Above Average</div>';
      } else if (showNotes && isLow) {
        const below = Math.max(avg - row.loss, 0);
        note = `<div class="so-geo-loss-note so-geo-loss-note--down">▼ ${below.toFixed(2)}% Below Avg</div>`;
      }

      return `
        <div class="so-geo-loss-item">
          <div class="so-geo-loss-item-top">
            <div class="so-geo-loss-rank">
              <span class="so-geo-loss-name">${row.name}</span>
              ${badge}
            </div>
            <div class="so-geo-loss-value">${row.loss.toFixed(1)}%</div>
          </div>
          <div class="so-geo-loss-track">
            <div class="so-geo-loss-fill ${fillClass}" style="width:${width}%"></div>
          </div>
          ${note}
        </div>
      `;
    }).join('');

    // Restart grow animation on next frame
    requestAnimationFrame(() => {
      listEl.querySelectorAll('.so-geo-loss-fill').forEach((el) => {
        const target = el.style.width;
        el.style.width = '0';
        requestAnimationFrame(() => { el.style.width = target; });
      });
    });
  }

  function renderZoneCircleLoss(losses) {
    if (!losses) return;
    renderGeoLossList('tl-zone-loss-list', 'tl-zone-loss-avg', losses.zones, { showNotes: true });
    renderGeoLossList('tl-circle-loss-list', 'tl-circle-loss-avg', losses.circles, { showNotes: false });
  }

  function getMonthlyLossYScale(values) {
    const nums = (values || []).map(Number).filter((v) => Number.isFinite(v));
    if (!nums.length) return { min: 0, max: 6 };
    const minVal = Math.min(...nums);
    const maxVal = Math.max(...nums);
    const span = Math.max(maxVal - minVal, 0.8);
    const min = Math.max(0, Number((minVal - span * 0.28).toFixed(1)));
    const max = Number((maxVal + span * 0.4).toFixed(1));
    return { min, max };
  }

  function buildMonthlyLossChartOptions(d, values = []) {
    const tickColor = isDark() ? d.ticks.color : '#4b5563';
    const yScale = getMonthlyLossYScale(values);
    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 36, left: 2, right: 6, bottom: 2 } },
      datasets: {
        bar: {
          categoryPercentage: 0.7,
          barPercentage: 0.78,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...d.tooltip,
          backgroundColor: '#333',
          callbacks: {
            label(ctx) {
              const value = Number(ctx.raw);
              const index = ctx.dataIndex;
              const data = (ctx.dataset.data || []).map((v) => Number(v));
              let text = `Loss : ${value}%`;
              if (index > 0 && Number.isFinite(data[index - 1])) {
                const diff = Number((value - data[index - 1]).toFixed(1));
                if (diff > 0) text += ` | Increased by ${diff}%`;
                else if (diff < 0) text += ` | Reduced by ${Math.abs(diff)}%`;
                else text += ' | No Change';
              }
              return text;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: false,
          ticks: { color: tickColor, font: { size: 11, weight: '600' } },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          stacked: false,
          beginAtZero: false,
          min: yScale.min,
          max: yScale.max,
          ticks: { color: d.ticks.color, callback(v) { return `${v}%`; } },
          grid: { display: false },
          border: { display: false },
        },
      },
    };
  }

  function computeReactiveMvar(mw, mva) {
    const p = Number(mw) || 0;
    const s = Number(mva) || p;
    if (s <= p) return 0;
    return Math.sqrt(Math.max(s * s - p * p, 0));
  }

  function getSoPowerQualitySnapshot(data) {
    const feeder = data.feeders?.all || { mw: 0, mva: 0 };
    const pq = data.powerQuality || {};
    const activeMw = feeder.mw;
    const reactiveMvar = computeReactiveMvar(feeder.mw, feeder.mva);
    const voltageBand = pq.voltageBandCompliance ?? pq.voltage ?? 98.2;
    const activeMax = Math.max(220, activeMw * 1.25);
    const reactiveMax = Math.max(100, reactiveMvar * 1.35);
    return { activeMw, reactiveMvar, voltageBand, activeMax, reactiveMax };
  }

  function buildGeoLossChartOptions(d, horizontal = true) {
    const scales = horizontal
      ? {
        x: {
          ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
          grid: d.grid,
          title: { display: true, text: 'Loss %', color: d.color, font: { size: 11 } },
        },
        y: { ticks: { ...d.ticks, font: { size: 9 } }, grid: { display: false } },
      }
      : {
        x: { ticks: d.ticks, grid: { display: false } },
        y: {
          ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
          grid: d.grid,
          title: { display: true, text: 'Loss %', color: d.color, font: { size: 11 } },
        },
      };
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: { legend: { display: false }, tooltip: d.tooltip },
      scales,
    };
  }

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

  const SO_HERC_TARGET = 98.5;
  const OUTAGE_CLASS_PALETTE = {
    shutdown: '#7E57C2',
    breakdown: '#42A5F5',
    tripping: '#26C6DA',
  };
  const SO_AVAIL_LINE_COLOR = '#10B981';
  const SO_AVAIL_TARGET_COLOR = '#F59E0B';
  const SO_AVAIL_PLANNED_COLOR = OUTAGE_CLASS_PALETTE.shutdown;
  const SO_AVAIL_FORCED_COLOR = OUTAGE_CLASS_PALETTE.tripping;
  const SO_AVAIL_PLANNED_FILL = 'rgba(126, 87, 194, 0.55)';
  const SO_AVAIL_FORCED_FILL = 'rgba(38, 198, 218, 0.55)';
  const SO_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SO_AVAIL_GRANULARITY_META = {
    hourly: {
      subtitle: 'Hourly availability tracking against HERC regulatory target (98.5%)',
      xTitle: 'Hour',
      maxRotation: 45,
      minRotation: 45,
      autoSkip: false,
      maxBarThickness: 10,
      layoutPaddingBottom: 55,
      tickFontSize: 10,
    },
    daily: {
      subtitle: 'Daily availability tracking against HERC regulatory target (98.5%)',
      xTitle: 'Day',
      maxRotation: 45,
      minRotation: 45,
      autoSkip: false,
      maxBarThickness: 8,
      layoutPaddingBottom: 75,
      tickFontSize: 10,
    },
    monthly: {
      subtitle: 'Monthly availability tracking against HERC regulatory target (98.5%)',
      xTitle: 'Month',
      maxTicksLimit: 12,
      maxRotation: 0,
      minRotation: 0,
      autoSkip: false,
      maxBarThickness: 28,
      layoutPaddingBottom: 16,
      tickFontSize: 11,
    },
  };

  function getSoHourlyAvailabilityLabels() {
    return Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  }

  function getSoDailyAvailabilityLabels(referenceDate = new Date()) {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    });
  }

  function getSoMonthlyAvailabilityLabels() {
    return SO_MONTH_LABELS.slice();
  }

  function updateSoAvailabilitySubtitle(granularity = state.soAvailGranularity) {
    const meta = SO_AVAIL_GRANULARITY_META[granularity] || SO_AVAIL_GRANULARITY_META.hourly;
    const el = document.getElementById('so-avail-subtitle');
    if (el) el.textContent = meta.subtitle;
  }

  function getSoAvailabilityLayoutPadding(granularity = state.soAvailGranularity) {
    const meta = SO_AVAIL_GRANULARITY_META[granularity] || SO_AVAIL_GRANULARITY_META.hourly;
    return {
      top: 8,
      right: 8,
      left: 4,
      bottom: meta.layoutPaddingBottom ?? 8,
    };
  }

  function applySoAvailabilityChartLayout(granularity = state.soAvailGranularity) {
    const wrap = document.querySelector('#view-system-operation .so-avail-chart-wrap');
    if (!wrap) return;
    wrap.classList.toggle('so-avail-chart-wrap--daily', granularity === 'daily');
    wrap.classList.toggle('so-avail-chart-wrap--hourly', granularity === 'hourly');
    wrap.classList.toggle('so-avail-chart-wrap--monthly', granularity === 'monthly');
  }

  function getSoAvailabilityXAxisOptions(granularity) {
    const d = chartDefaults();
    const meta = SO_AVAIL_GRANULARITY_META[granularity] || SO_AVAIL_GRANULARITY_META.hourly;
    const ticks = {
      ...d.ticks,
      font: { size: meta.tickFontSize ?? 11, family: 'Inter, system-ui, sans-serif' },
      maxRotation: meta.maxRotation,
      minRotation: meta.minRotation ?? meta.maxRotation,
      autoSkip: meta.autoSkip,
      padding: (granularity === 'daily' || granularity === 'hourly') ? 6 : 4,
    };
    if (meta.maxTicksLimit != null) ticks.maxTicksLimit = meta.maxTicksLimit;
    return {
      stacked: true,
      grid: { display: false },
      border: { display: false },
      title: {
        display: true,
        text: meta.xTitle,
        color: d.color,
        font: { size: 11 },
      },
      ticks,
    };
  }

  function buildAvailabilityHistoryPoint(planned, forced) {
    const p = planned != null ? Number(planned) : rand(0.05, 0.2);
    const f = forced != null ? Number(forced) : rand(0.02, 0.12);
    const availability = clamp(100 - p - f, 97.2, 99.98);
    return {
      planned: p,
      forced: f,
      availability,
      plannedHr: Number((p * 7.44).toFixed(1)),
      forcedHr: Number((f * 7.44).toFixed(1)),
    };
  }

  function normalizeAvailabilityPoint(h) {
    if (!h) return buildAvailabilityHistoryPoint();
    if (h.availability != null) {
      return {
        planned: Number(h.planned) || 0,
        forced: Number(h.forced) || 0,
        availability: Number(h.availability),
        plannedHr: h.plannedHr != null ? Number(h.plannedHr) : Number(((h.planned || 0) * 7.44).toFixed(1)),
        forcedHr: h.forcedHr != null ? Number(h.forcedHr) : Number(((h.forced || 0) * 7.44).toFixed(1)),
      };
    }
    return buildAvailabilityHistoryPoint(h.planned, h.forced);
  }

  function getSoAvailabilitySeries(granularity = state.soAvailGranularity) {
    const points = (state.data?.availabilityHistory || []).map(normalizeAvailabilityPoint);
    const now = new Date();
    const seed = hashFilterSeed();

    if (granularity === 'hourly') {
      const labels = getSoHourlyAvailabilityLabels();
      const hist = points.slice(-labels.length);
      const slice = labels.map((_, i) => {
        if (hist[i]) return normalizeAvailabilityPoint(hist[i]);
        return buildAvailabilityHistoryPoint(
          0.05 + seededUnit(seed, i + 1) * 0.15,
          0.02 + seededUnit(seed, i + 25) * 0.1
        );
      });
      return {
        labels,
        points: slice,
        availability: slice.map((p) => p.availability),
        planned: slice.map((p) => p.planned),
        forced: slice.map((p) => p.forced),
        plannedHr: slice.map((p) => p.plannedHr),
        forcedHr: slice.map((p) => p.forcedHr),
      };
    }

    if (granularity === 'daily') {
      const labels = getSoDailyAvailabilityLabels(now);
      const slice = labels.map((_, i) => buildAvailabilityHistoryPoint(
        0.08 + seededUnit(seed, i + 1) * 0.12,
        0.04 + seededUnit(seed, i + 31) * 0.08
      ));
      return {
        labels,
        points: slice,
        availability: slice.map((p) => p.availability),
        planned: slice.map((p) => p.planned),
        forced: slice.map((p) => p.forced),
        plannedHr: slice.map((p) => p.plannedHr),
        forcedHr: slice.map((p) => p.forcedHr),
      };
    }

    const labels = getSoMonthlyAvailabilityLabels();
    const monthly = state.data?.losses?.monthly;
    const slice = labels.map((_, i) => {
      const loss = Number(monthly?.total?.[i]) || (4.0 + seededUnit(seed, i + 50) * 1.5);
      return buildAvailabilityHistoryPoint(loss * 0.35 / 100, loss * 0.65 / 100);
    });
    return {
      labels,
      points: slice,
      availability: slice.map((p) => p.availability),
      planned: slice.map((p) => p.planned),
      forced: slice.map((p) => p.forced),
      plannedHr: slice.map((p) => p.plannedHr),
      forcedHr: slice.map((p) => p.forcedHr),
    };
  }

  const soAvailThresholdPlugin = {
    id: 'soAvailThreshold',
    beforeDatasetsDraw(chart) {
      if (chart.canvas?.id !== 'so-availability-chart') return;
      if (state.soAvailMetric !== 'availability') return;
      const { ctx, chartArea } = chart;
      const yScale = chart.scales.y;
      if (!yScale || !chartArea) return;
      const targetY = yScale.getPixelForValue(SO_HERC_TARGET);
      const bottomY = yScale.getPixelForValue(yScale.min);
      ctx.save();
      ctx.fillStyle = isDark() ? 'rgba(239, 68, 68, 0.09)' : 'rgba(239, 68, 68, 0.06)';
      ctx.fillRect(chartArea.left, targetY, chartArea.right - chartArea.left, bottomY - targetY);
      ctx.restore();
    },
  };

  function updateSoAvailabilityKpis(series) {
    const latest = series.points[series.points.length - 1] || buildAvailabilityHistoryPoint();
    const loss = latest.planned + latest.forced;
    const currentEl = document.getElementById('so-avail-current');
    const lossEl = document.getElementById('so-avail-loss');
    const targetEl = document.getElementById('so-avail-target-kpi');
    if (targetEl) targetEl.textContent = `${SO_HERC_TARGET.toFixed(2)}%`;
    if (currentEl) {
      currentEl.textContent = `${latest.availability.toFixed(2)}%`;
      currentEl.classList.toggle('is-good', latest.availability >= SO_HERC_TARGET);
      currentEl.classList.toggle('is-bad', latest.availability < SO_HERC_TARGET);
    }
    if (lossEl) lossEl.textContent = `${loss.toFixed(2)}%`;
  }

  function renderZoneCircleLossForAvailPoint(pointIndex) {
    const losses = state.data?.losses;
    if (!losses) return;
    const titleEl = document.getElementById('tl-zone-loss-title');
    if (pointIndex == null || pointIndex < 0) {
      if (titleEl) titleEl.textContent = 'Zone & Circle Loss';
      renderZoneCircleLoss(losses);
      return;
    }
    const series = getSoAvailabilitySeries();
    const point = series.points[pointIndex];
    const label = series.labels[pointIndex];
    if (!point) {
      renderZoneCircleLoss(losses);
      return;
    }
    const severity = clamp((point.planned + point.forced) / 0.18, 0.75, 1.35);
    const scaleMap = (map) => {
      const scaled = {};
      Object.entries(map || {}).forEach(([k, v]) => {
        scaled[k] = clamp(Number(v) * severity, 0.1, 12);
      });
      return scaled;
    };
    renderZoneCircleLoss({
      ...losses,
      zones: scaleMap(losses.zones),
      circles: scaleMap(losses.circles),
    });
    if (titleEl) titleEl.textContent = `Zone & Circle Loss · ${label}`;
  }

  function syncSoAvailabilityChart(animate = false) {
    const chart = state.charts.soAvailability || state.charts.availSpark;
    if (!chart) return;
    const granularity = state.soAvailGranularity || 'hourly';
    const granMeta = SO_AVAIL_GRANULARITY_META[granularity] || SO_AVAIL_GRANULARITY_META.hourly;
    const series = getSoAvailabilitySeries();
    state._lastSoAvailSeries = series;
    updateSoAvailabilityKpis(series);
    updateSoAvailabilitySubtitle(granularity);

    const targetLine = series.labels.map(() => SO_HERC_TARGET);
    const metric = state.soAvailMetric || 'availability';
    const d = chartDefaults();
    const barThickness = granMeta.maxBarThickness;
    const barSizing = granularity === 'daily'
      ? { categoryPercentage: 0.92, barPercentage: 0.98 }
      : granularity === 'hourly'
        ? { categoryPercentage: 0.9, barPercentage: 0.95 }
        : { categoryPercentage: 0.8, barPercentage: 0.9 };

    if (metric === 'outage-hours') {
      chart.data.labels = series.labels;
      chart.data.datasets = [
        {
          type: 'bar',
          label: 'Planned Outage',
          data: series.plannedHr,
          backgroundColor: SO_AVAIL_PLANNED_COLOR,
          borderRadius: 4,
          stack: 'hours',
          maxBarThickness: barThickness,
          ...barSizing,
          order: 2,
        },
        {
          type: 'bar',
          label: 'Forced Outage',
          data: series.forcedHr,
          backgroundColor: SO_AVAIL_FORCED_COLOR,
          borderRadius: 4,
          stack: 'hours',
          maxBarThickness: barThickness,
          ...barSizing,
          order: 3,
        },
      ];
      chart.options.scales.y = {
        min: 0,
        grace: '8%',
        ticks: { ...d.ticks, callback(v) { return `${v}h`; } },
        grid: d.grid,
        title: { display: true, text: 'Outage hours', color: d.color, font: { size: 11 } },
      };
      if (chart.options.scales.y1) chart.options.scales.y1.display = false;
    } else {
      chart.data.labels = series.labels;
      chart.data.datasets = [
        {
          type: 'bar',
          label: 'Planned Outage',
          data: series.planned,
          backgroundColor: SO_AVAIL_PLANNED_FILL,
          borderRadius: 3,
          stack: 'outage',
          maxBarThickness: barThickness,
          ...barSizing,
          yAxisID: 'y1',
          order: 4,
        },
        {
          type: 'bar',
          label: 'Forced Outage',
          data: series.forced,
          backgroundColor: SO_AVAIL_FORCED_FILL,
          borderRadius: 3,
          stack: 'outage',
          maxBarThickness: barThickness,
          ...barSizing,
          yAxisID: 'y1',
          order: 5,
        },
        {
          type: 'line',
          label: 'Actual Availability %',
          data: series.availability,
          borderColor: SO_AVAIL_LINE_COLOR,
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          fill: true,
          tension: 0.42,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2.5,
          yAxisID: 'y',
          order: 1,
        },
        {
          type: 'line',
          label: 'HERC Target',
          data: targetLine,
          borderColor: SO_AVAIL_TARGET_COLOR,
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0,
          yAxisID: 'y',
          order: 0,
        },
      ];
      chart.options.scales.y = {
        min: 97,
        max: 100,
        ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
        grid: { color: isDark() ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.18)' },
        title: { display: true, text: 'Availability %', color: d.color, font: { size: 11 } },
      };
      chart.options.scales.y1 = {
        position: 'right',
        min: 0,
        display: true,
        ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
        grid: { drawOnChartArea: false },
      };
    }

    document.querySelectorAll('[data-so-avail-gran]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.soAvailGran === state.soAvailGranularity);
    });
    document.querySelectorAll('[data-so-avail-metric]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.soAvailMetric === state.soAvailMetric);
    });

    chart.options.scales.x = getSoAvailabilityXAxisOptions(granularity);
    chart.options.layout = { padding: getSoAvailabilityLayoutPadding(granularity) };
    applySoAvailabilityChartLayout(granularity);

    chart.update(animate ? 'default' : 'none');
  }

  function handleSoAvailChartClick(_evt, elements) {
    if (!elements?.length) return;
    const idx = elements[0].index;
    state.soAvailSelectedIndex = idx;
    renderZoneCircleLossForAvailPoint(idx);
  }

  function exportSoAvailabilityCsv() {
    const series = getSoAvailabilitySeries();
    const lines = ['Timestamp,Availability %,Planned %,Forced %,Planned Hrs,Forced Hrs'];
    series.labels.forEach((label, i) => {
      const p = series.points[i];
      lines.push([
        label,
        p.availability.toFixed(2),
        p.planned.toFixed(2),
        p.forced.toFixed(2),
        p.plannedHr.toFixed(1),
        p.forcedHr.toFixed(1),
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transmission-availability-trend.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetSoAvailabilityWidget() {
    state.soAvailGranularity = 'hourly';
    state.soAvailMetric = 'availability';
    state.soAvailSelectedIndex = null;
    renderZoneCircleLossForAvailPoint(null);
    syncSoAvailabilityChart(true);
  }

  function syncAvailabilityChart(animate) {
    syncSoAvailabilityChart(animate);
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
      syncLoadForecastChart(animate);
    }

    if (state.charts.pqTrend) {
      const trend = data.powerQualityTrend;
      state.charts.pqTrend.data.labels = loadSeries.labels;
      state.charts.pqTrend.data.datasets[0].data = resampleSeries(trend.voltageDeviation, filter);
      state.charts.pqTrend.data.datasets[1].data = resampleSeries(trend.activePower, filter);
      state.charts.pqTrend.data.datasets[2].data = resampleSeries(trend.reactivePower, filter);
      state.charts.pqTrend.data.datasets[3].data = resampleSeries(trend.frequency, filter);
      applyTimeFilterToChartScales(state.charts.pqTrend, filter, animate);
    }

    if (state.charts.lostLoad) {
      state.charts.lostLoad.data.labels = loadSeries.labels;
      state.charts.lostLoad.data.datasets[0].data = resampleSeries(data.lostLoad.monthly, filter);
      applyTimeFilterToChartScales(state.charts.lostLoad, filter, animate);
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

  const TSA_OUTAGE_CLASS_LABELS = ['Shutdown', 'Breakdown', 'Tripping'];
  const TSA_OUTAGE_CLASS_COLORS = [
    OUTAGE_CLASS_PALETTE.shutdown,
    OUTAGE_CLASS_PALETTE.breakdown,
    OUTAGE_CLASS_PALETTE.tripping,
  ];

  function renderDonutSplitLegend(legendId, labels, values, colors, { decimals = 0 } = {}) {
    const legend = document.getElementById(legendId);
    if (!legend) return;
    const total = values.reduce((s, v) => s + v, 0) || 1;
    legend.innerHTML = labels.map((label, i) => {
      const pct = decimals > 0
        ? ((values[i] / total) * 100).toFixed(decimals)
        : Math.round((values[i] / total) * 100);
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

  function syncTsaExecOutageClassChart(classification) {
    const rows = filterTsaDeemedRows([...(state.data?.tsa?.deemedExempt?.rows || [])]);
    const outageClass = classification || getTsaOutageClassification(rows);
    const values = outageClass.values || [0, 0, 0];
    renderDonutSplitLegend(
      'tsa-outage-class-legend',
      TSA_OUTAGE_CLASS_LABELS,
      values,
      TSA_OUTAGE_CLASS_COLORS,
      { decimals: 1 }
    );
    if (!state.charts.tsaExecOutageClass) return;
    const cardBg = getCardBgColor();
    state.charts.tsaExecOutageClass.data.labels = TSA_OUTAGE_CLASS_LABELS;
    state.charts.tsaExecOutageClass.data.datasets[0].data = values;
    state.charts.tsaExecOutageClass.data.datasets[0].backgroundColor = TSA_OUTAGE_CLASS_COLORS;
    state.charts.tsaExecOutageClass.data.datasets[0].borderColor = cardBg;
    state.charts.tsaExecOutageClass.update('none');
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
    syncTsaExecOutageClassChart();
  }

  // ─── Mock Data Engine ──────────────────────────────────────────────────
  const INVENTORY_CONSUMPTION_CIRCLES = [
    'TS Panchkula', 'TS Karnal', 'TS Rohtak', 'TS Gurugram', 'TS Faridabad',
    'TS Hisar', 'MNP Dhulkot', 'MNP Delhi', 'Head Office', 'Other',
  ];
  const INVENTORY_CATEGORY_CIRCLES = [
    'TS Panchkula', 'TS Karnal', 'TS Rohtak', 'TS Gurugram', 'TS Faridabad',
    'TS Hisar', 'MNP Dhulkot', 'Head Office', 'Other',
  ];
  const INVENTORY_MATERIAL_CATEGORIES = [
    { key: 'equipments', label: 'Equipments', color: '#3B82F6' },
    { key: 'dismantledHealthy', label: 'Dismantled Healthy Material', color: '#06B6D4' },
    { key: 'packaging', label: 'Packaging', color: '#22C55E' },
    { key: 'scrap', label: 'Scrap', color: '#F97316' },
    { key: 'scrapDecommissioned', label: 'Scrap-Decommissioned', color: '#EAB308' },
    { key: 'spares', label: 'Spares', color: '#86EFAC' },
    { key: 'consumables', label: 'Consumables', color: '#A855F7' },
  ];
  const INVENTORY_AGE_BUCKETS = [
    { key: '<3m', label: '< Less Than 3 Months', color: '#3B82F6' },
    { key: '3-6m', label: '> 3 Months < 6 Months', color: '#EAB308' },
    { key: '6-12m', label: '> 6 Months < 1 Year', color: '#22C55E' },
    { key: '1-2y', label: '> 1 Year < 2 Years', color: '#A855F7' },
    { key: '2-5y', label: '> 2 Year < 5 Years', color: '#EC4899' },
    { key: '>5y', label: '> Greater Than 5 Years', color: '#06B6D4' },
  ];
  const INVENTORY_DD_CLASS_COLORS = ['#3B82F6', '#F97316', '#06B6D4', '#22C55E', '#EAB308'];

  function formatInvCr(value) {
    return `₹${Number(value).toFixed(2)} Cr.`;
  }

  function renderInvDdClassLegend(classification) {
    const legend = document.getElementById('inv-dd-class-legend');
    if (!legend || !classification) return;
    const { labels, percentages, values } = classification;
    legend.innerHTML = labels.map((label, i) => {
      const color = INVENTORY_DD_CLASS_COLORS[i % INVENTORY_DD_CLASS_COLORS.length];
      const pct = Number(percentages[i]).toFixed(1);
      const amount = formatInvCr(values[i]);
      return `
        <li class="donut-split-legend-item inv-dd-class-legend-item">
          <span class="donut-split-legend-bar" style="background:${color}" aria-hidden="true"></span>
          <div class="donut-split-legend-text inv-dd-class-legend-text">
            <span class="inv-dd-class-legend-name">${label}</span>
            <span class="inv-dd-class-legend-metrics">
              <span class="inv-dd-class-legend-pct">${pct}%</span>
              <span class="inv-dd-class-legend-sep" aria-hidden="true">·</span>
              <span class="inv-dd-class-legend-amount">${amount}</span>
            </span>
          </div>
        </li>`;
    }).join('');
  }
  const INV_STORE_HEALTHY_COLOR = '#3A7BD5';
  const INV_STORE_SCRAP_COLOR = '#FF6A00';
  const INV_STORE_LABEL_MIN_PX = 38;

  const invStoreBreakdownPlugin = {
    id: 'invStoreBreakdownLabels',
    beforeDatasetsDraw(chart) {
      if (chart.canvas?.id !== 'inv-store-breakdown-chart') return;
      const { ctx, chartArea, scales } = chart;
      const yScale = scales.y;
      if (!yScale || !chartArea) return;
      const labels = chart.data.labels || [];
      labels.forEach((_, i) => {
        const center = yScale.getPixelForValue(i);
        const prev = i > 0 ? yScale.getPixelForValue(i - 1) : null;
        const next = i < labels.length - 1 ? yScale.getPixelForValue(i + 1) : null;
        const top = prev == null ? chartArea.top : (center + prev) / 2;
        const bottom = next == null ? chartArea.bottom : (center + next) / 2;
        if (i % 2 !== 0) return;
        ctx.save();
        ctx.fillStyle = isDark() ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.08)';
        ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
        ctx.restore();
      });
    },
    afterDatasetsDraw(chart) {
      if (chart.canvas?.id !== 'inv-store-breakdown-chart') return;
      const { ctx, chartArea } = chart;
      const healthyMeta = chart.getDatasetMeta(0);
      const scrapMeta = chart.getDatasetMeta(1);
      const healthy = chart.data.datasets[0]?.data || [];
      const scrap = chart.data.datasets[1]?.data || [];
      const totalColor = isDark() ? '#CBD5E1' : '#334155';

      const drawSegmentLabel = (bar, value) => {
        const width = Math.abs(bar.x - bar.base);
        if (width < INV_STORE_LABEL_MIN_PX || !Number.isFinite(Number(value))) return;
        const cx = (bar.x + bar.base) / 2;
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = "600 11px 'Inter', system-ui, sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Number(value).toFixed(1), cx, bar.y);
        ctx.restore();
      };

      healthyMeta.data.forEach((bar, i) => {
        if (bar) drawSegmentLabel(bar, healthy[i]);
      });
      scrapMeta.data.forEach((bar, i) => {
        if (bar) drawSegmentLabel(bar, scrap[i]);
      });

      healthyMeta.data.forEach((healthyBar, i) => {
        const scrapBar = scrapMeta.data[i];
        if (!healthyBar || !scrapBar) return;
        const total = Number(healthy[i] || 0) + Number(scrap[i] || 0);
        const endX = Math.max(healthyBar.x, scrapBar.x);
        ctx.save();
        ctx.fillStyle = totalColor;
        ctx.font = "700 12px 'Inter', system-ui, sans-serif";
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Total: ${total.toFixed(1)} Cr.`, Math.min(endX + 10, chartArea.right - 6), healthyBar.y);
        ctx.restore();
      });
    },
  };

  function formatInventoryCr(value) {
    return `₹${Number(value).toFixed(2)} Cr.`;
  }

  function formatInventoryCrShort(value) {
    return `${Number(value).toFixed(2)} Cr.`;
  }

  function updateInventoryKpiCard(prefix, store) {
    const total = Number(store.total) || 0;
    const healthy = Number(store.healthy) || 0;
    const pct = total > 0 ? (healthy / total) * 100 : 0;
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setText(`inv-${prefix}-total`, formatInventoryCr(total));
    setText(`inv-${prefix}-healthy`, formatInventoryCrShort(healthy));
    setText(`inv-${prefix}-healthy-pct`, `(${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%)`);
    setText(`inv-${prefix}-capital`, formatInventoryCr(store.capital));
    setText(`inv-${prefix}-om`, formatInventoryCr(store.om));
    const progress = document.getElementById(`inv-${prefix}-progress`);
    const progressWrap = document.getElementById(`inv-${prefix}-progress-wrap`);
    if (progress) progress.style.width = `${pct}%`;
    if (progressWrap) progressWrap.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function exportInventoryOverviewReport() {
    const inv = state.data?.inventory;
    if (!inv) return;
    const s = inv.summary;
    const lines = [
      'Inventory Overview & Store Summary',
      '',
      'Store,Total (Cr.),Healthy (Cr.),Capital (Cr.),O&M (Cr.),Healthy %',
      `DD Store,${s.ddStore.total},${s.ddStore.healthy},${s.ddStore.capital},${s.ddStore.om},${((s.ddStore.healthy / s.ddStore.total) * 100).toFixed(1)}`,
      `Site Store,${s.siteStore.total},${s.siteStore.healthy},${s.siteStore.capital},${s.siteStore.om},${((s.siteStore.healthy / s.siteStore.total) * 100).toFixed(1)}`,
      `Total,${s.total.total},${s.total.healthy},${s.total.capital},${s.total.om},${((s.total.healthy / s.total.total) * 100).toFixed(1)}`,
      '',
      'DD Store Classification,Percentage,Value (Cr.)',
      ...inv.ddClassification.labels.map((label, i) => `${label},${inv.ddClassification.percentages[i]},${inv.ddClassification.values[i]}`),
      '',
      'Store,Healthy (Cr.),Scrap (Cr.)',
      ...inv.storeBreakdown.labels.map((label, i) => `${label},${inv.storeBreakdown.healthy[i]},${inv.storeBreakdown.scrap[i]}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory-overview-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildInventoryConsumptionSeries(fyKey = 'all') {
    const baseCwip = [420, 385, 360, 510, 445, 390, 280, 240, 180, 95];
    const baseOm = [310, 295, 270, 380, 335, 300, 210, 185, 140, 72];
    const fyScale = fyKey === '2025-26' ? 0.92 : fyKey === '2026-27' ? 1.08 : 1;
    return {
      labels: INVENTORY_CONSUMPTION_CIRCLES.slice(),
      cwip: baseCwip.map((v) => Number((v * fyScale * (0.96 + seededUnit(hashFilterSeed(), v) * 0.08)).toFixed(1))),
      om: baseOm.map((v) => Number((v * fyScale * (0.94 + seededUnit(hashFilterSeed(), v + 17) * 0.1)).toFixed(1))),
    };
  }

  function buildInventoryAgeSeries(storeType = 'all', requestType = 'all') {
    const seed = hashFilterSeed();
    const storeScale = storeType === 'dd' ? 0.42 : storeType === 'site' ? 0.78 : storeType === 'workshop' ? 0.28 : 1;
    const requestScale = requestType === 'scrap' ? 0.55 : requestType === 'healthy' ? 0.82 : 1;
    const base = [1280, 980, 760, 620, 480, 340];
    return INVENTORY_AGE_BUCKETS.map((bucket, i) => ({
      ...bucket,
      value: Number((base[i] * storeScale * requestScale * (0.9 + seededUnit(seed, i + 41) * 0.2)).toFixed(1)),
    }));
  }

  function buildInventoryCategorySeries() {
    const seed = hashFilterSeed();
    return INVENTORY_CATEGORY_CIRCLES.map((circle, ci) => {
      const row = { circle };
      INVENTORY_MATERIAL_CATEGORIES.forEach((cat, mi) => {
        const base = [820, 180, 95, 240, 42, 120, 68][mi];
        row[cat.key] = Number((base * (0.75 + seededUnit(seed, ci * 11 + mi) * 0.5)).toFixed(1));
      });
      return row;
    });
  }

  function buildInventoryMockData() {
    return {
      summary: {
        ddStore: { total: 71.77, healthy: 52.41, capital: 26.59, om: 25.83 },
        siteStore: { total: 131.85, healthy: 123.87, capital: 86.48, om: 37.39 },
        total: { total: 203.62, healthy: 176.28, capital: 113.07, om: 63.22 },
      },
      ddClassification: {
        baseline: 71.77,
        labels: ['Equipments', 'Scrap', 'Dismantled Healthy Material', 'Spares', 'Scrap-Decommissioned'],
        percentages: [67.6, 26.9, 3.7, 1.7, 0.1],
        values: [48.52, 19.31, 2.65, 1.22, 0.07],
      },
      storeBreakdown: {
        labels: [
          'Ballabgarh Store', 'Hisar Store', 'Khera Store', 'Panipat Store',
          'PTRW Ballabgarh', 'Steel Structure Workshop Panipat', 'Carrier Store Sewah',
        ],
        healthy: [18.2, 14.6, 11.8, 9.4, 7.2, 5.8, 4.1],
        scrap: [4.2, 3.1, 2.8, 2.4, 1.9, 1.5, 1.2],
      },
      consumption: buildInventoryConsumptionSeries('all'),
      age: buildInventoryAgeSeries('all', 'all'),
      category: buildInventoryCategorySeries(),
    };
  }

  function initMockData() {
    const now = Date.now();
    const labels24 = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    const labels12 = Array.from({ length: 12 }, (_, i) => `T+${i}h`);

    state.data = {
      availability: 99.82,
      plannedOutage: 0.12,
      forcedOutage: 0.06,
      availabilityHistory: Array.from({ length: 48 }, () => buildAvailabilityHistoryPoint()),
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
      loadForecast: buildLoadForecastSeries('hourly'),
      powerQuality: {
        voltage: 98.2,
        voltageBandCompliance: 98.2,
        reactiveMvar: computeReactiveMvar(142.5, 158.3),
        voltageSags: 5,
        voltageSwells: 2,
      },
      powerQualityTrend: {
        labels: labels24,
        voltageDeviation: labels24.map((_, i) => clamp(1.2 + Math.sin(i / 4) * 0.8 + rand(-0.3, 0.3), 0.2, 4.5)),
        activePower: labels24.map((_, i) => clamp(120 + Math.sin(i / 3) * 25 + rand(-4, 4), 80, 180)),
        reactivePower: labels24.map((_, i) => clamp(55 + Math.sin(i / 3.5) * 15 + rand(-3, 3), 30, 95)),
        frequency: labels24.map((_, i) => clamp(50 + Math.sin(i / 6) * 0.08 + rand(-0.04, 0.04), 49.7, 50.3)),
      },
      pqEvents: { sags: 5, swells: 2 },
      losses: (() => {
        const geo = buildLossGeoData();
        return {
          technical: 3.2,
          nonTechnical: 1.1,
          availabilityTarget: 99.20,
          feeders: { F1: 1.2, F2: 0.9, F3: 0.8, F4: 0.5 },
          zones: geo.zones,
          circles: geo.circles,
          monthly: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            total: [4.8, 4.6, 5.1, 4.3, 4.4, 4.2, 4.5, 4.7, 3.9, 4.0, 3.8, 4.3],
          },
          hotspots: buildLossHotspots(geo),
        };
      })(),
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
        { asset: 'Transformers', load: 85, capacity: 100 },
        { asset: 'Lines', load: 65, capacity: 100 },
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
        trippingHierarchy: {
          zones: [
            { key: 'zone-hisar', label: 'Hisar', trips: 9 },
            { key: 'zone-panchkula', label: 'Panchkula', trips: 16 },
          ],
          circles: {
            'zone-hisar': [
              { key: 'circle-ts-hisar', label: 'TS Hisar', trips: 4 },
              { key: 'circle-ts-rohtak', label: 'TS Rohtak', trips: 5 },
            ],
            'zone-panchkula': [
              { key: 'circle-ts-karnal', label: 'TS Karnal', trips: 7 },
              { key: 'circle-ts-ambala', label: 'TS Ambala', trips: 4 },
              { key: 'circle-ts-panchkula', label: 'TS Panchkula', trips: 5 },
            ],
          },
          divisions: {
            'circle-ts-karnal': [
              { key: 'div-ts-karnal', label: 'TS Karnal', trips: 5 },
              { key: 'div-ts-panipat', label: 'TS Panipat', trips: 2 },
            ],
            'circle-ts-hisar': [
              { key: 'div-ts-hisar', label: 'TS Hisar', trips: 3 },
              { key: 'div-ts-fatehabad', label: 'TS Fatehabad', trips: 1 },
            ],
          },
          substations: {
            'div-ts-panipat': [
              { label: '132kV Panipat - Samalkha', trips: 4 },
              { label: '132kV Panipat - Israna', trips: 1 },
            ],
            'div-ts-karnal': [
              { label: '220kV Karnal - Kurukshetra', trips: 3 },
              { label: '132kV Karnal - Indri', trips: 2 },
            ],
          },
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
          lowThreshold: 98.5,
          highThreshold: 99.9,
          byCircle: buildOutageByCircleSeries(),
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
              id: 'de-001',
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
      inventory: buildInventoryMockData(),
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
      state.data.powerQuality.voltageBandCompliance = state.data.powerQuality.voltage;
      state.data.powerQuality.reactiveMvar = computeReactiveMvar(
        state.data.feeders.all.mw,
        state.data.feeders.all.mva
      );
      const pfStress = clamp(Math.round((1 - (unispur.summary.powerFactor || 0.95)) * 100), 1, 12);
      state.data.powerQuality.voltageSags = clamp(Math.round(3 + pfStress / 3), 0, 12);
      state.data.powerQuality.voltageSwells = clamp(Math.round(1 + pfStress / 5), 0, 10);
      state.data.pqEvents.sags = state.data.powerQuality.voltageSags;
      state.data.pqEvents.swells = state.data.powerQuality.voltageSwells;
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
    if (state.data.loadForecast?.actual?.length) {
      state.data.loadForecast.actual = state.data.loadForecast.actual.map((v) => clamp(v + rand(-2, 2), 60, 240));
      state.data.loadForecast.predicted = state.data.loadForecast.actual.map((v, i) =>
        v + rand(-(state.data.loadForecast.margin[i] || 3), state.data.loadForecast.margin[i] || 3)
      );
      if (state.charts.loadForecast) {
        const fc = state.data.loadForecast;
        state.charts.loadForecast.data.datasets[0].data = fc.actual.slice();
        state.charts.loadForecast.data.datasets[1].data = fc.predicted.slice();
        state.charts.loadForecast.data.datasets[2].data = fc.predicted.map((v, i) => v + fc.margin[i]);
        state.charts.loadForecast.data.datasets[3].data = fc.predicted.map((v, i) => v - fc.margin[i]);
        state.charts.loadForecast.update('none');
      }
    }

    // Power quality
    const pq = state.data.powerQuality;
    pq.voltage = clamp(pq.voltage + rand(-0.3, 0.3), 95, 100);
    pq.voltageBandCompliance = clamp((pq.voltageBandCompliance ?? pq.voltage) + rand(-0.25, 0.25), 94, 100);
    pq.reactiveMvar = clamp(
      computeReactiveMvar(state.data.feeders.all.mw, state.data.feeders.all.mva) + rand(-1.5, 1.5),
      20,
      120
    );
    pq.voltageSags = clamp(Math.round((pq.voltageSags ?? state.data.pqEvents.sags) + rand(-1, 1)), 0, 12);
    pq.voltageSwells = clamp(Math.round((pq.voltageSwells ?? state.data.pqEvents.swells) + rand(-1, 1)), 0, 10);
    state.data.pqEvents.sags = pq.voltageSags;
    state.data.pqEvents.swells = pq.voltageSwells;
    state.data.gridFrequency = clamp(state.data.gridFrequency + rand(-0.03, 0.03), 49.7, 50.3);

    // Transmission losses drift
    state.data.losses.technical = clamp(state.data.losses.technical + rand(-0.06, 0.06), 2.4, 4.4);
    state.data.losses.nonTechnical = clamp(state.data.losses.nonTechnical + rand(-0.04, 0.04), 0.7, 1.8);
    Object.keys(state.data.losses.feeders).forEach((k) => {
      state.data.losses.feeders[k] = clamp(state.data.losses.feeders[k] + rand(-0.07, 0.07), 0.2, 2.2);
    });
    Object.keys(state.data.losses.zones || {}).forEach((k) => {
      state.data.losses.zones[k] = Number(clamp(Number(state.data.losses.zones[k]) + rand(-0.05, 0.05), 0.5, 3.2).toFixed(2));
    });
    Object.keys(state.data.losses.circles || {}).forEach((k) => {
      state.data.losses.circles[k] = Number(clamp(Number(state.data.losses.circles[k]) + rand(-0.06, 0.06), 0.4, 3.5).toFixed(2));
    });
    if (state.data.losses.zones && state.data.losses.circles) {
      state.data.losses.hotspots = buildLossHotspots(state.data.losses);
    }

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

  const TAFM_CYAN = '#22D3EE';
  const TAFM_BLUE = '#3B82F6';
  const TAFM_DEEP = '#1D4ED8';
  const TAFM_ALERT = '#EF4444';

  function getTafmThresholds(oa) {
    const low = oa?.lowThreshold ?? oa?.target ?? 98.5;
    const high = oa?.highThreshold ?? 99.9;
    return { low, high };
  }

  function getTafmExtrema(values) {
    let peakIdx = 0;
    let lowIdx = 0;
    values.forEach((v, i) => {
      if (v > values[peakIdx]) peakIdx = i;
      if (v < values[lowIdx]) lowIdx = i;
    });
    return { peakIdx, lowIdx, peak: values[peakIdx], lowest: values[lowIdx] };
  }

  function tafmValueColor(value, lowTh, highTh, minV, maxV) {
    if (value < lowTh || value > highTh) return TAFM_ALERT;
    const span = Math.max(maxV - minV, 0.0001);
    const t = clamp((value - minV) / span, 0, 1);
    if (t < 0.45) return TAFM_CYAN;
    if (t < 0.75) return TAFM_BLUE;
    return TAFM_DEEP;
  }

  function makeTafmAreaFill(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return 'rgba(59, 130, 246, 0.12)';
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, 'rgba(59, 130, 246, 0.32)');
    g.addColorStop(0.55, 'rgba(34, 211, 238, 0.12)');
    g.addColorStop(1, 'rgba(59, 130, 246, 0)');
    return g;
  }

  const tafmPremiumPlugin = {
    id: 'tafmPremiumMarkers',
    afterDatasetsDraw(chart) {
      if (chart.canvas?.id !== 'tsa-outage-tafm-chart') return;
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.length) return;

      const cfg = chart.options.plugins?.tafmPremiumMarkers || {};
      const values = chart.data.datasets[0].data.map(Number);
      const labels = chart.data.labels || [];
      const { peakIdx, lowIdx } = getTafmExtrema(values);
      const pulse = (Math.sin(Date.now() / 420) + 1) / 2;
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;

      const roundRectPath = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      };

      const drawHighlight = (idx, kind) => {
        const pt = meta.data[idx];
        if (!pt) return;
        const x = pt.x;
        const y = pt.y;
        const baseY = scales.y.getPixelForValue(scales.y.min);
        const value = values[idx];
        const stamp = labels[idx] || '';
        const isAlert = value < (cfg.lowThreshold ?? 98.5) || value > (cfg.highThreshold ?? 99.9);
        const isLowest = kind === 'lowest';
        const core = (isAlert || isLowest) ? TAFM_ALERT : TAFM_DEEP;

        const beamGrad = ctx.createLinearGradient(0, y, 0, baseY);
        beamGrad.addColorStop(0, 'rgba(59, 130, 246, 0)');
        beamGrad.addColorStop(0.35, (isAlert || isLowest) ? 'rgba(239, 68, 68, 0.14)' : 'rgba(59, 130, 246, 0.18)');
        beamGrad.addColorStop(1, (isAlert || isLowest) ? 'rgba(239, 68, 68, 0.58)' : 'rgba(37, 99, 235, 0.72)');
        const beamW = 18;
        ctx.save();
        ctx.fillStyle = beamGrad;
        roundRectPath(x - beamW / 2, y, beamW, Math.max(baseY - y, 1), 6);
        ctx.fill();
        ctx.restore();

        const glowR = 14 + pulse * 5;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = (isAlert || isLowest)
          ? `rgba(239, 68, 68, ${0.18 + pulse * 0.12})`
          : `rgba(59, 130, 246, ${0.18 + pulse * 0.14})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = core;
        ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
        ctx.restore();

        const title = kind === 'peak' ? 'Peak' : 'Lowest';
        const line2 = `${value.toFixed(2)}% · ${stamp}`;
        ctx.save();
        ctx.font = `600 10px 'Inter', sans-serif`;
        const w1 = ctx.measureText(title).width;
        ctx.font = `600 12px 'Inter', sans-serif`;
        const w2 = ctx.measureText(line2).width;
        const boxW = Math.max(w1, w2) + 20;
        const boxH = 36;
        let boxX = x - boxW / 2;
        let boxY = y - boxH - 16;
        boxX = Math.max(chartArea.left + 4, Math.min(boxX, chartArea.right - boxW - 4));
        boxY = Math.max(chartArea.top + 4, boxY);

        ctx.fillStyle = isDark() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)';
        ctx.strokeStyle = isDark() ? 'rgba(148, 163, 184, 0.25)' : 'rgba(226, 232, 240, 0.95)';
        ctx.lineWidth = 1;
        ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
        roundRectPath(boxX, boxY, boxW, boxH, 10);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x - 5, boxY + boxH);
        ctx.lineTo(x, boxY + boxH + 6);
        ctx.lineTo(x + 5, boxY + boxH);
        ctx.closePath();
        ctx.fillStyle = isDark() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)';
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.fillStyle = isDark() ? '#94A3B8' : '#64748B';
        ctx.font = `600 10px 'Inter', sans-serif`;
        ctx.fillText(title, boxX + boxW / 2, boxY + 14);
        ctx.fillStyle = isDark() ? '#F8FAFC' : '#0F172A';
        ctx.font = `600 12px 'Inter', sans-serif`;
        ctx.fillText(line2, boxX + boxW / 2, boxY + 28);
        ctx.restore();

        if (scales.x) {
          const labelY = scales.x.bottom - 2;
          ctx.save();
          ctx.font = `600 11px 'Inter', sans-serif`;
          const tw = ctx.measureText(String(stamp)).width + 16;
          const lx = x - tw / 2;
          ctx.fillStyle = (isAlert || isLowest) ? 'rgba(239, 68, 68, 0.92)' : 'rgba(37, 99, 235, 0.95)';
          roundRectPath(lx, labelY - 16, tw, 18, 9);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(stamp), x, labelY - 7);
          ctx.restore();
        }
      };

      if (peakIdx !== lowIdx) {
        drawHighlight(lowIdx, 'lowest');
        drawHighlight(peakIdx, 'peak');
      } else {
        drawHighlight(peakIdx, 'peak');
      }
    },
  };

  let tafmPulseRaf = null;
  function stopTafmPulse() {
    if (tafmPulseRaf) {
      cancelAnimationFrame(tafmPulseRaf);
      tafmPulseRaf = null;
    }
  }
  function startTafmPulse() {
    stopTafmPulse();
    const tick = () => {
      if (state.currentView === 'tsa-outage-analytics' && state.charts.tsaOutageTafm) {
        state.charts.tsaOutageTafm.draw();
        tafmPulseRaf = requestAnimationFrame(tick);
      } else {
        tafmPulseRaf = null;
      }
    };
    tafmPulseRaf = requestAnimationFrame(tick);
  }

  const OA_CIRCLE_PALETTE = {
    shutdown: '#5141C3',
    breakdown: '#4E9BFA',
    tripping: '#76E2E1',
  };

  const OA_CIRCLE_COLORS = {
    shutdown: { top: '#6B5CE7', bottom: '#3D31A8', solid: OA_CIRCLE_PALETTE.shutdown },
    breakdown: { top: '#7CB8FF', bottom: '#2563EB', solid: OA_CIRCLE_PALETTE.breakdown },
    tripping: { top: '#A8F0EF', bottom: '#1EC2C4', solid: OA_CIRCLE_PALETTE.tripping },
  };

  const OA_CIRCLE_HOVER_COLORS = {
    shutdown: { top: '#8578F0', bottom: '#5141C3', solid: '#6B5CE7' },
    breakdown: { top: '#93C5FD', bottom: '#3B82F6', solid: '#60B5FF' },
    tripping: { top: '#B8F5F4', bottom: '#4DD4D4', solid: '#8EEBEA' },
  };

  function getOaCircleSeries(byCircle) {
    const labels = byCircle?.labels || [];
    const shutdown = (byCircle?.shutdown || []).map(Number);
    const breakdown = (byCircle?.breakdown || []).map(Number);
    const tripping = (byCircle?.tripping || []).map(Number);
    const totals = labels.map((_, i) =>
      (shutdown[i] || 0) + (breakdown[i] || 0) + (tripping[i] || 0)
    );
    let highestIdx = 0;
    totals.forEach((t, i) => {
      if (t > totals[highestIdx]) highestIdx = i;
    });
    const typeSums = {
      Shutdown: shutdown.reduce((s, v) => s + v, 0),
      Breakdown: breakdown.reduce((s, v) => s + v, 0),
      Tripping: tripping.reduce((s, v) => s + v, 0),
    };
    const majorCause = Object.entries(typeSums).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    const totalHours = totals.reduce((s, v) => s + v, 0);
    let events = 0;
    labels.forEach((_, i) => {
      if ((shutdown[i] || 0) > 0.05) events += 1;
      if ((breakdown[i] || 0) > 0.05) events += 1;
      if ((tripping[i] || 0) > 0.05) events += 1;
    });
    return {
      labels,
      shutdown,
      breakdown,
      tripping,
      totals,
      highestIdx,
      highestLabel: labels[highestIdx] || '—',
      highestTotal: totals[highestIdx] || 0,
      majorCause,
      typeSums,
      totalHours,
      events,
    };
  }

  function makeOaCircleBarGradient(chart, palette) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return palette.solid;
    const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    g.addColorStop(0, palette.bottom);
    g.addColorStop(0.55, palette.solid);
    g.addColorStop(1, palette.top);
    return g;
  }

  function oaCircleStackRadius(ctx) {
    const chart = ctx.chart;
    const i = ctx.dataIndex;
    const ds = ctx.datasetIndex;
    const vals = chart.data.datasets.map((d) => Number(d.data[i]) || 0);
    let first = -1;
    let last = -1;
    vals.forEach((v, idx) => {
      if (v > 0.001) {
        if (first < 0) first = idx;
        last = idx;
      }
    });
    const r = 8;
    if (first < 0) return 0;
    if (ds === first && ds === last) return r;
    if (ds === first) return { bottomLeft: r, bottomRight: r, topLeft: 0, topRight: 0 };
    if (ds === last) return { topLeft: r, topRight: r, bottomLeft: 0, bottomRight: 0 };
    return 0;
  }

  function exportOaCircleCsv() {
    const oa = state.data?.tsa?.outageAnalytics;
    if (!oa?.byCircle) return;
    const series = getOutageByCircleChartSeries(oa);
    const stats = getOaCircleSeries(series);
    const lines = ['Circle,Shutdown (h),Breakdown (h),Tripping (h),Total (h)'];
    stats.labels.forEach((label, i) => {
      if (!label || isFilterAll(label) || String(label).toLowerCase() === 'all') return;
      lines.push([
        label,
        stats.shutdown[i].toFixed(1),
        stats.breakdown[i].toFixed(1),
        stats.tripping[i].toFixed(1),
        stats.totals[i].toFixed(1),
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'outage-by-circle.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const OA_PREMIUM_CHART_IDS = new Set(['tsa-outage-circle-chart', 'tsa-exec-tripping-chart']);

  function isOaPremiumChart(chart) {
    return OA_PREMIUM_CHART_IDS.has(chart?.canvas?.id);
  }

  function makeOaStackedBarDatasets(series) {
    return [
      {
        label: 'Shutdown',
        data: (series.shutdown || []).slice(),
        backgroundColor: (ctx) => makeOaCircleBarGradient(ctx.chart, OA_CIRCLE_COLORS.shutdown),
        hoverBackgroundColor: (ctx) => makeOaCircleBarGradient(ctx.chart, OA_CIRCLE_HOVER_COLORS.shutdown),
        borderColor: 'transparent',
        borderWidth: 0,
        borderSkipped: false,
        borderRadius: oaCircleStackRadius,
        stack: 'outage',
        maxBarThickness: 42,
      },
      {
        label: 'Breakdown',
        data: (series.breakdown || []).slice(),
        backgroundColor: (ctx) => makeOaCircleBarGradient(ctx.chart, OA_CIRCLE_COLORS.breakdown),
        hoverBackgroundColor: (ctx) => makeOaCircleBarGradient(ctx.chart, OA_CIRCLE_HOVER_COLORS.breakdown),
        borderColor: 'transparent',
        borderWidth: 0,
        borderSkipped: false,
        borderRadius: oaCircleStackRadius,
        stack: 'outage',
        maxBarThickness: 42,
      },
      {
        label: 'Tripping',
        data: (series.tripping || []).slice(),
        backgroundColor: (ctx) => makeOaCircleBarGradient(ctx.chart, OA_CIRCLE_COLORS.tripping),
        hoverBackgroundColor: (ctx) => makeOaCircleBarGradient(ctx.chart, OA_CIRCLE_HOVER_COLORS.tripping),
        borderColor: 'transparent',
        borderWidth: 0,
        borderSkipped: false,
        borderRadius: oaCircleStackRadius,
        stack: 'outage',
        maxBarThickness: 42,
      },
    ];
  }

  function getOaStackedBarChartOptions(d, softGrid, { onClick } = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 900,
        easing: 'easeOutQuart',
        delay: (ctx) => (ctx.type === 'data' ? ctx.dataIndex * 70 + ctx.datasetIndex * 45 : 0),
      },
      interaction: { mode: 'index', intersect: false },
      onHover(evt, elements) {
        const target = evt.native?.target || evt.chart?.canvas;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      onClick,
      layout: { padding: { top: 44, right: 8, bottom: 4, left: 4 } },
      datasets: {
        bar: {
          categoryPercentage: 0.62,
          barPercentage: 0.78,
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: d.color,
            font: { size: 11, weight: '500', family: "'Inter', sans-serif" },
            usePointStyle: true,
            pointStyle: 'rectRounded',
            padding: 16,
            boxWidth: 10,
            boxHeight: 10,
            generateLabels(chart) {
              const defaults = Chart.defaults.plugins.legend.labels.generateLabels(chart);
              const solids = [
                OA_CIRCLE_PALETTE.shutdown,
                OA_CIRCLE_PALETTE.breakdown,
                OA_CIRCLE_PALETTE.tripping,
              ];
              return defaults.map((item, i) => ({
                ...item,
                fillStyle: solids[i] || item.fillStyle,
                strokeStyle: solids[i] || item.strokeStyle,
              }));
            },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          titleColor: '#F8FAFC',
          bodyColor: '#CBD5E1',
          footerColor: '#F8FAFC',
          borderColor: 'rgba(148, 163, 184, 0.25)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          displayColors: true,
          boxPadding: 6,
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 11 },
          footerFont: { size: 11, weight: '600' },
          callbacks: {
            title(items) {
              return items[0]?.label || '';
            },
            label(ctx) {
              const v = Number(ctx.parsed.y) || 0;
              return ` ${ctx.dataset.label}: ${v.toFixed(1)}h`;
            },
            footer(items) {
              const total = items.reduce((s, it) => s + (Number(it.parsed.y) || 0), 0);
              return `Total: ${total.toFixed(1)}h`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            ...d.ticks,
            font: { size: 10, weight: '600', family: "'Inter', sans-serif" },
            color: d.color,
            maxRotation: 40,
            minRotation: 0,
            autoSkip: false,
          },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          stacked: true,
          min: 0,
          grace: '8%',
          ticks: {
            ...d.ticks,
            font: { size: 10, family: "'Inter', sans-serif" },
            callback(v) { return `${v}h`; },
          },
          grid: {
            color: softGrid,
            drawTicks: false,
            lineWidth: 1,
          },
          border: { display: false },
          title: {
            display: true,
            text: 'Outage hours',
            color: d.color,
            font: { size: 11, weight: '500', family: "'Inter', sans-serif" },
            padding: { bottom: 4 },
          },
        },
      },
    };
  }

  const oaCirclePremiumPlugin = {
    id: 'oaCirclePremium',
    beforeDatasetsDraw(chart) {
      if (!isOaPremiumChart(chart)) return;
      chart.$oaElevated = [];
      const hover = chart.getActiveElements()[0]?.index;
      if (hover == null || hover < 0) return;
      const dy = 4;
      chart.data.datasets.forEach((_, di) => {
        const el = chart.getDatasetMeta(di).data[hover];
        if (!el || el.hidden) return;
        chart.$oaElevated.push({ el, y: el.y, base: el.base });
        el.y -= dy;
        el.base -= dy;
      });
    },
    afterDatasetsDraw(chart) {
      if (!isOaPremiumChart(chart)) return;
      const { ctx, chartArea } = chart;
      if (!chartArea) return;

      const roundRectPath = (x, y, w, h, r) => {
        const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
      };

      const labels = chart.data.labels || [];
      const totals = labels.map((_, i) =>
        chart.data.datasets.reduce((s, ds) => s + (Number(ds.data[i]) || 0), 0)
      );
      let highestIdx = 0;
      totals.forEach((t, i) => {
        if (t > totals[highestIdx]) highestIdx = i;
      });

      const meta0 = chart.getDatasetMeta(0);
      const metaTop = chart.getDatasetMeta(chart.data.datasets.length - 1);
      if (!meta0?.data?.length || !metaTop?.data?.length) return;

      const pulse = (Math.sin(Date.now() / 500) + 1) / 2;

      totals.forEach((total, i) => {
        const topBar = metaTop.data[i];
        const bottomBar = meta0.data[i];
        if (!topBar || !bottomBar) return;

        const x = topBar.x;
        const topY = Math.min(...chart.data.datasets.map((_, di) => {
          const el = chart.getDatasetMeta(di).data[i];
          return el ? el.y : Infinity;
        }));
        const baseY = Math.max(...chart.data.datasets.map((_, di) => {
          const el = chart.getDatasetMeta(di).data[i];
          return el ? el.base : -Infinity;
        }));
        const width = topBar.width || 28;
        const isHighest = i === highestIdx;

        if (isHighest) {
          ctx.save();
          ctx.shadowColor = `rgba(81, 65, 195, ${0.38 + pulse * 0.22})`;
          ctx.shadowBlur = 18 + pulse * 8;
          ctx.shadowOffsetY = 4;
          ctx.strokeStyle = `rgba(118, 226, 225, ${0.82 + pulse * 0.12})`;
          ctx.lineWidth = 2.5;
          roundRectPath(x - width / 2 - 4, topY - 4, width + 8, Math.max(baseY - topY, 1) + 8, 10);
          ctx.stroke();
          ctx.restore();

          const badge = 'Highest';
          ctx.save();
          ctx.font = `700 10px 'Inter', sans-serif`;
          const bw = ctx.measureText(badge).width + 16;
          const bh = 18;
          let bx = x - bw / 2;
          let by = topY - 38;
          bx = Math.max(chartArea.left + 2, Math.min(bx, chartArea.right - bw - 2));
          by = Math.max(chartArea.top + 2, by);
          ctx.fillStyle = 'rgba(81, 65, 195, 0.95)';
          ctx.shadowColor = 'rgba(81, 65, 195, 0.35)';
          ctx.shadowBlur = 10;
          roundRectPath(bx, by, bw, bh, 9);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badge, bx + bw / 2, by + bh / 2 + 0.5);
          ctx.restore();
        }

        const label = `${total.toFixed(1)}h`;
        ctx.save();
        ctx.font = `600 11px 'Inter', sans-serif`;
        const tw = ctx.measureText(label).width + 12;
        const th = 18;
        let lx = x - tw / 2;
        let ly = topY - (isHighest ? 56 : 22);
        lx = Math.max(chartArea.left + 2, Math.min(lx, chartArea.right - tw - 2));
        ly = Math.max(chartArea.top + (isHighest ? 22 : 2), ly);
        ctx.fillStyle = isDark() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)';
        ctx.strokeStyle = isDark() ? 'rgba(148, 163, 184, 0.28)' : 'rgba(226, 232, 240, 0.95)';
        ctx.lineWidth = 1;
        ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        roundRectPath(lx, ly, tw, th, 8);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.stroke();
        ctx.fillStyle = isDark() ? '#F8FAFC' : '#0F172A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, lx + tw / 2, ly + th / 2 + 0.5);
        ctx.restore();
      });

      (chart.$oaElevated || []).forEach(({ el, y, base }) => {
        el.y = y;
        el.base = base;
      });
      chart.$oaElevated = [];
    },
  };

  let oaCirclePulseRaf = null;
  function stopOaCirclePulse() {
    if (oaCirclePulseRaf) {
      cancelAnimationFrame(oaCirclePulseRaf);
      oaCirclePulseRaf = null;
    }
  }
  function startOaCirclePulse() {
    stopOaCirclePulse();
    const tick = () => {
      const oaView = state.currentView === 'tsa-outage-analytics' && state.charts.tsaOutageCircle;
      const execView = state.currentView === 'tsa-executive-summary' && state.charts.tsaExecTripping;
      if (oaView) state.charts.tsaOutageCircle.draw();
      if (execView) state.charts.tsaExecTripping.draw();
      if (oaView || execView) {
        oaCirclePulseRaf = requestAnimationFrame(tick);
      } else {
        oaCirclePulseRaf = null;
      }
    };
    oaCirclePulseRaf = requestAnimationFrame(tick);
  }

  function buildTsaOutageCircleChart() {
    const oa = state.data.tsa.outageAnalytics;
    const d = chartDefaults();
    const softGrid = isDark() ? 'rgba(148, 163, 184, 0.10)' : 'rgba(148, 163, 184, 0.16)';
    const series = getOutageByCircleChartSeries(oa);

    return new Chart(document.getElementById('tsa-outage-circle-chart'), {
      type: 'bar',
      plugins: [oaCirclePremiumPlugin],
      data: {
        labels: series.labels,
        datasets: makeOaStackedBarDatasets(series),
      },
      options: getOaStackedBarChartOptions(d, softGrid),
    });
  }

  function handleExecTrippingChartClick(_evt, elements) {
    if (!elements?.length) return;
    const series = state._lastExecTrippingSeries;
    if (!series?.meta) return;
    const idx = elements[0].index;
    const item = series.meta[idx];
    if (!item) return;
    const drill = state.execTrippingDrill || {};

    if (series.level === 'Zone' && item.zoneKey && !drill.zoneKey) {
      state.execTrippingDrill = {
        zoneKey: item.zoneKey,
        zoneLabel: series.labels[idx],
        circleKey: null,
        circleLabel: null,
      };
      renderTsaExecutiveSummary();
      return;
    }
    if (series.level === 'Circle' && item.circleKey && !drill.circleKey) {
      state.execTrippingDrill = {
        zoneKey: drill.zoneKey || item.zoneKey,
        zoneLabel: drill.zoneLabel,
        circleKey: item.circleKey,
        circleLabel: series.labels[idx],
      };
      renderTsaExecutiveSummary();
    }
  }

  function buildTsaExecTrippingChart() {
    const d = chartDefaults();
    const softGrid = isDark() ? 'rgba(148, 163, 184, 0.10)' : 'rgba(148, 163, 184, 0.16)';
    const series = getExecTrippingSeries();
    state._lastExecTrippingSeries = series;

    return new Chart(document.getElementById('tsa-exec-tripping-chart'), {
      type: 'bar',
      plugins: [oaCirclePremiumPlugin],
      data: {
        labels: series.labels,
        datasets: makeOaStackedBarDatasets(series),
      },
      options: getOaStackedBarChartOptions(d, softGrid, {
        onClick: handleExecTrippingChartClick,
      }),
    });
  }

  function exportExecTrippingCsv() {
    const series = getExecTrippingSeries();
    const lines = ['Location,Shutdown (h),Breakdown (h),Tripping (h),Total (h)'];
    (series.labels || []).forEach((label, i) => {
      const s = Number(series.shutdown[i]) || 0;
      const b = Number(series.breakdown[i]) || 0;
      const t = Number(series.tripping[i]) || 0;
      lines.push([label, s.toFixed(1), b.toFixed(1), t.toFixed(1), (s + b + t).toFixed(1)].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tripping-analytics.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetExecTrippingWidget() {
    state.execTrippingDrill = { zoneKey: null, circleKey: null, zoneLabel: null, circleLabel: null };
    state.execCategoryFilter = { shutdown: true, breakdown: true, tripping: true };
    document.querySelectorAll('[data-exec-cat]').forEach((input) => {
      input.checked = true;
    });
    renderTsaExecutiveSummary();
  }

  function buildTsaOutageTafmChart() {
    const oa = state.data.tsa.outageAnalytics;
    const d = chartDefaults();
    const { low, high } = getTafmThresholds(oa);
    const values = oa.tafmTrend.values.slice();
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const { peakIdx, lowIdx } = getTafmExtrema(values);

    return new Chart(document.getElementById('tsa-outage-tafm-chart'), {
      type: 'line',
      plugins: [tafmPremiumPlugin],
      data: {
        labels: oa.tafmTrend.labels,
        datasets: [
          {
            label: 'TAFM',
            data: values,
            borderColor: TAFM_BLUE,
            borderWidth: 3,
            borderCapStyle: 'round',
            borderJoinStyle: 'round',
            tension: 0.42,
            fill: true,
            pointHoverRadius: 7,
            pointHoverBorderWidth: 3,
            pointHoverBorderColor: '#fff',
            pointBackgroundColor: (ctx) => tafmValueColor(values[ctx.dataIndex], low, high, minV, maxV),
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: (ctx) => (ctx.dataIndex === peakIdx || ctx.dataIndex === lowIdx ? 0 : 3.5),
            segment: {
              borderColor: (ctx) => {
                const v0 = ctx.p0.parsed.y;
                const v1 = ctx.p1.parsed.y;
                if (v0 < low || v0 > high || v1 < low || v1 > high) return TAFM_ALERT;
                return tafmValueColor((v0 + v1) / 2, low, high, minV, maxV);
              },
            },
            backgroundColor(ctx) {
              return makeTafmAreaFill(ctx.chart);
            },
          },
          {
            label: `HERC target ${oa.target}%`,
            data: oa.tafmTrend.labels.map(() => oa.target),
            borderColor: 'rgba(245, 158, 11, 0.85)',
            borderDash: [6, 5],
            pointRadius: 0,
            borderWidth: 1.5,
            fill: false,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 1400, easing: 'easeInOutQuart' },
        plugins: {
          legend: { display: false },
          tafmPremiumMarkers: { lowThreshold: low, highThreshold: high },
          tooltip: {
            enabled: true,
            backgroundColor: isDark() ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.97)',
            titleColor: isDark() ? '#F8FAFC' : '#0F172A',
            bodyColor: isDark() ? '#CBD5E1' : '#475569',
            borderColor: isDark() ? 'rgba(148, 163, 184, 0.25)' : 'rgba(226, 232, 240, 1)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 12,
            displayColors: false,
            titleFont: { size: 12, weight: '600', family: "'Inter', sans-serif" },
            bodyFont: { size: 13, weight: '500', family: "'Inter', sans-serif" },
            callbacks: {
              title(items) {
                return items[0]?.label ? `Period · ${items[0].label}` : '';
              },
              label(item) {
                if (item.datasetIndex !== 0) return `Target ${Number(item.raw).toFixed(2)}%`;
                return `TAFM  ${Number(item.raw).toFixed(2)}%`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: d.color,
              font: { size: 11, weight: '600', family: "'Inter', sans-serif" },
              padding: 8,
            },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            min: 98,
            max: 100,
            ticks: {
              color: d.color,
              font: { size: 11, family: "'Inter', sans-serif" },
              callback(v) { return `${v}%`; },
              padding: 8,
            },
            grid: {
              color: isDark() ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.28)',
              borderDash: [4, 4],
              drawTicks: false,
            },
            border: { display: false },
            title: {
              display: true,
              text: 'TAFM (%)',
              color: d.color,
              font: { size: 11, weight: '600', family: "'Inter', sans-serif" },
            },
          },
        },
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

    // Transmission availability trend (System Operation)
    const soAvailEl = document.getElementById('so-availability-chart');
    if (soAvailEl) {
      const series = getSoAvailabilitySeries('hourly');
      state.charts.soAvailability = new Chart(soAvailEl, {
        type: 'bar',
        plugins: [soAvailThresholdPlugin],
        data: {
          labels: series.labels,
          datasets: [
            {
              type: 'bar',
              label: 'Planned Outage',
              data: series.planned,
              backgroundColor: SO_AVAIL_PLANNED_FILL,
              borderRadius: 3,
              stack: 'outage',
              maxBarThickness: 18,
              yAxisID: 'y1',
              order: 4,
            },
            {
              type: 'bar',
              label: 'Forced Outage',
              data: series.forced,
              backgroundColor: SO_AVAIL_FORCED_FILL,
              borderRadius: 3,
              stack: 'outage',
              maxBarThickness: 18,
              yAxisID: 'y1',
              order: 5,
            },
            {
              type: 'line',
              label: 'Actual Availability %',
              data: series.availability,
              borderColor: SO_AVAIL_LINE_COLOR,
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              fill: true,
              tension: 0.42,
              pointRadius: 3,
              borderWidth: 2.5,
              yAxisID: 'y',
              order: 1,
            },
            {
              type: 'line',
              label: 'HERC Target',
              data: series.labels.map(() => SO_HERC_TARGET),
              borderColor: SO_AVAIL_TARGET_COLOR,
              borderDash: [6, 4],
              borderWidth: 2,
              pointRadius: 0,
              yAxisID: 'y',
              order: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          onClick: handleSoAvailChartClick,
          layout: { padding: getSoAvailabilityLayoutPadding('hourly') },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                color: d.color,
                font: { size: 11, weight: '500' },
                usePointStyle: true,
                boxWidth: 10,
                padding: 14,
              },
            },
            tooltip: {
              ...d.tooltip,
              backgroundColor: isDark() ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.98)',
              titleColor: isDark() ? '#F8FAFC' : '#0F172A',
              bodyColor: isDark() ? '#CBD5E1' : '#475569',
              borderColor: isDark() ? 'rgba(148, 163, 184, 0.25)' : 'rgba(226, 232, 240, 1)',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 10,
              callbacks: {
                title(items) {
                  return items[0]?.label || '';
                },
                label(ctx) {
                  const val = Number(ctx.parsed.y);
                  if (ctx.dataset.label === 'HERC Target') return ` HERC Target: ${SO_HERC_TARGET.toFixed(2)}%`;
                  if (ctx.dataset.label === 'Actual Availability %') return ` Availability: ${val.toFixed(2)}%`;
                  if (ctx.dataset.label?.includes('Planned')) return ` Planned Outage: ${val.toFixed(2)}%`;
                  if (ctx.dataset.label?.includes('Forced')) return ` Forced Outage: ${val.toFixed(2)}%`;
                  return ` ${ctx.dataset.label}: ${val.toFixed(2)}`;
                },
                afterBody(items) {
                  const idx = items[0]?.dataIndex;
                  const point = getSoAvailabilitySeries().points[idx];
                  if (!point) return [];
                  const gap = point.availability - SO_HERC_TARGET;
                  const status = gap >= 0
                    ? `PASS (+${gap.toFixed(2)}% above target)`
                    : `FAIL (${gap.toFixed(2)}% below target)`;
                  return [
                    `Planned Outage: ${point.planned.toFixed(2)}% (${point.plannedHr.toFixed(1)} hrs)`,
                    `Forced Outage: ${point.forced.toFixed(2)}% (${point.forcedHr.toFixed(1)} hrs)`,
                    `Compliance Status: ${status}`,
                  ];
                },
              },
            },
          },
          scales: {
            x: {
              stacked: true,
              grid: { display: false },
              ticks: { ...d.ticks, maxTicksLimit: 10, maxRotation: 0 },
            },
            y: {
              min: 97,
              max: 100,
              stacked: false,
              ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
              grid: { color: isDark() ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.18)' },
              title: { display: true, text: 'Availability %', color: d.color, font: { size: 11 } },
            },
            y1: {
              position: 'right',
              min: 0,
              stacked: true,
              ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
              grid: { drawOnChartArea: false },
            },
          },
        },
      });
      syncSoAvailabilityChart(false);
    }

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
    const fc = state.data.loadForecast || buildLoadForecastSeries(state.loadForecastInterval);
    state.data.loadForecast = fc;
    const forecastCanvas = document.getElementById('load-forecast-chart');
    if (forecastCanvas) {
      state.charts.loadForecast = new Chart(forecastCanvas, {
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
            x: {
              ticks: d.ticks,
              grid: d.grid,
              title: { display: true, text: fc.xTitle || 'Time', color: d.color },
            },
            y: { ticks: d.ticks, grid: d.grid, title: { display: true, text: 'MW', color: d.color } },
          },
        },
      });
    }

    // Feeder load comparison removed (feeder-level measurements unavailable — pending HVPN confirmation)

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

    state.charts.tlMonthlyTrend = new Chart(document.getElementById('tl-monthly-trend-chart'), {
      type: 'bar',
      plugins: [monthlyLossDataLabelsPlugin],
      data: {
        labels: state.data.losses.monthly.labels,
        datasets: [{
          label: 'Loss (%)',
          data: state.data.losses.monthly.total,
          backgroundColor: lossMonthlyBarColor,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 42,
          categoryPercentage: 0.7,
          barPercentage: 0.78,
        }],
      },
      options: {
        ...buildMonthlyLossChartOptions(d, state.data.losses.monthly.total),
        animation: { duration: 500, easing: 'easeOutQuart' },
      },
    });

    renderZoneCircleLoss(state.data.losses);

    const soPq = getSoPowerQualitySnapshot(state.data);
    state.charts.pqActive = makeGauge(document.getElementById('pq-active-gauge'), soPq.activeMw, soPq.activeMax, CHART_PRIMARY);
    state.charts.pqReactive = makeGauge(
      document.getElementById('pq-reactive-gauge'),
      soPq.reactiveMvar,
      soPq.reactiveMax,
      CHART_TEAL
    );
    state.charts.pqVband = makeGauge(
      document.getElementById('pq-vband-gauge'),
      soPq.voltageBand,
      100,
      soPq.voltageBand < 96 ? CHART_DANGER : CHART_SUCCESS
    );

    // PQ gauges (Power Quality tab)
    const pqSnap = state.data.powerQuality;
    const pqReactiveMax = Math.max(100, (pqSnap.reactiveMvar || 70) * 1.35);
    state.charts.pqReactiveTab = makeGauge(
      document.getElementById('pq-tab-reactive-gauge'),
      pqSnap.reactiveMvar || 68.9,
      pqReactiveMax,
      CHART_TEAL
    );
    state.charts.pqVoltageTab = makeGauge(document.getElementById('pq-tab-voltage-gauge'), 98.2, 100, '#22c55e');
    state.charts.pqSagTab = makeGauge(document.getElementById('pq-tab-sag-gauge'), pqSnap.voltageSags || 5, 12, '#3B82F6');
    state.charts.pqSwellTab = makeGauge(document.getElementById('pq-tab-swell-gauge'), pqSnap.voltageSwells || 2, 10, '#F59E0B');

    state.charts.pqTrend = new Chart(document.getElementById('pq-trend-chart'), {
      type: 'line',
      data: {
        labels: state.data.powerQualityTrend.labels,
        datasets: [
          {
            label: 'Voltage Deviation (%)',
            data: state.data.powerQualityTrend.voltageDeviation,
            borderColor: '#6366F1',
            backgroundColor: 'rgba(99,102,241,0.08)',
            fill: false,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2,
            yAxisID: 'y',
          },
          {
            label: 'Active Power (MW)',
            data: state.data.powerQualityTrend.activePower,
            borderColor: CHART_PRIMARY,
            backgroundColor: 'rgba(0,102,204,0.08)',
            fill: false,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2,
            yAxisID: 'y1',
          },
          {
            label: 'Reactive Power (MVAR)',
            data: state.data.powerQualityTrend.reactivePower,
            borderColor: CHART_TEAL,
            backgroundColor: 'rgba(20,184,166,0.08)',
            fill: false,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2,
            yAxisID: 'y1',
          },
          {
            label: 'Frequency (Hz)',
            data: state.data.powerQualityTrend.frequency,
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245,158,11,0.08)',
            fill: false,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2,
            yAxisID: 'y2',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: d.color, boxWidth: 12, padding: 12, font: { size: 11 } },
          },
          tooltip: d.tooltip,
        },
        scales: {
          x: {
            ticks: { ...d.ticks, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
            grid: { display: false },
            border: { display: false },
            title: { display: true, text: 'Time', color: d.color, font: { size: 11 } },
          },
          y: {
            type: 'linear',
            position: 'left',
            ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
            grid: { color: d.grid?.color || 'rgba(148,163,184,0.15)' },
            border: { display: false },
            title: { display: true, text: 'Deviation %', color: d.color, font: { size: 10 } },
          },
          y1: {
            type: 'linear',
            position: 'right',
            ticks: d.ticks,
            grid: { drawOnChartArea: false },
            border: { display: false },
            title: { display: true, text: 'MW / MVAR', color: d.color, font: { size: 10 } },
          },
          y2: {
            type: 'linear',
            position: 'right',
            offset: true,
            min: 49.6,
            max: 50.4,
            ticks: { ...d.ticks, callback(v) { return `${Number(v).toFixed(1)}`; } },
            grid: { drawOnChartArea: false },
            border: { display: false },
            title: { display: true, text: 'Hz', color: d.color, font: { size: 10 } },
          },
        },
      },
    });

    state.charts.pqEvents = new Chart(document.getElementById('pq-events-chart'), {
      type: 'bar',
      data: {
        labels: ['Voltage Sags', 'Voltage Swells'],
        datasets: [{
          label: 'Count',
          data: [
            state.data.pqEvents.sags,
            state.data.pqEvents.swells,
          ],
          backgroundColor: ['#3B82F6', '#F59E0B'],
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 72,
          categoryPercentage: 0.55,
          barPercentage: 0.7,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: d.tooltip },
        scales: {
          x: {
            ticks: { ...d.ticks, font: { size: 11, weight: '600' } },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { ...d.ticks, stepSize: 1, precision: 0 },
            grid: { color: d.grid?.color || 'rgba(148,163,184,0.15)' },
            border: { display: false },
          },
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
    const utilizationCanvas = document.getElementById('utilization-chart');
    if (utilizationCanvas) {
      state.charts.utilization = new Chart(utilizationCanvas, {
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
    }

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
    const uptimeLabels = getUptimeTrendLabels();
    const uptimeDaily = buildUptimeDailySeries();
    state.data.uptime.dailyPct = uptimeDaily;
    const uptimeTrendCanvas = document.getElementById('uptime-trend-chart');
    if (uptimeTrendCanvas) {
      state.charts.uptimeTrend = new Chart(uptimeTrendCanvas, {
        type: 'bar',
        data: {
          labels: uptimeLabels,
          datasets: [{
            label: 'Uptime %',
            data: uptimeDaily,
            backgroundColor: uptimeTrendBarColor,
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 16,
            categoryPercentage: 0.94,
            barPercentage: 0.92,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: d.tooltip },
          scales: {
            x: {
              ticks: {
                ...d.ticks,
                autoSkip: false,
                maxRotation: 0,
                minRotation: 0,
                callback(value, index) {
                  return index % 4 === 0 ? this.getLabelForValue(value) : '';
                },
              },
              grid: { display: false },
            },
            y: { min: 99.65, max: 100, ticks: d.ticks, grid: d.grid },
          },
        },
      });
    }

    const compareSeries = getUptimeComparisonSeries();
    const uptimeCompareCanvas = document.getElementById('uptime-compare-chart');
    if (uptimeCompareCanvas) {
      state.charts.uptimeCompare = new Chart(uptimeCompareCanvas, {
        type: 'bar',
        data: {
          labels: compareSeries.labels,
          datasets: [{
            label: '30d Uptime %',
            data: compareSeries.values,
            backgroundColor: compareSeries.values.map((_, i) =>
              i === compareSeries.selectedIndex ? CHART_PRIMARY : 'rgba(14, 165, 233, 0.45)'
            ),
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 42,
            categoryPercentage: 0.62,
            barPercentage: 0.78,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: d.tooltip },
          scales: {
            x: {
              ticks: { ...d.ticks, maxRotation: 35, minRotation: 0, autoSkip: true, maxTicksLimit: 8 },
              grid: { display: false },
            },
            y: { min: 99.65, max: 100, ticks: d.ticks, grid: d.grid },
          },
        },
      });
    }

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

    const tsaExecTrippingEl = document.getElementById('tsa-exec-tripping-chart');
    if (tsaExecTrippingEl) {
      state.charts.tsaExecTripping = buildTsaExecTrippingChart();
    }

    const tsaExecOutageEl = document.getElementById('tsa-exec-outage-class-chart');
    if (tsaExecOutageEl) {
      state.charts.tsaExecOutageClass = new Chart(tsaExecOutageEl, {
        type: 'doughnut',
        data: {
          labels: TSA_OUTAGE_CLASS_LABELS,
          datasets: [{
            data: [0, 0, 0],
            backgroundColor: TSA_OUTAGE_CLASS_COLORS,
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
            tooltip: {
              ...d.tooltip,
              callbacks: {
                label(ctx) {
                  const total = (ctx.dataset.data || []).reduce((s, v) => s + v, 0) || 1;
                  const pct = ((ctx.raw / total) * 100).toFixed(1);
                  return `${ctx.label}: ${pct}%`;
                },
              },
            },
          },
        },
      });
      syncTsaExecOutageClassChart();
    }

    const tsaTrippingDrillEl = document.getElementById('tsa-tripping-drill-chart');
    if (tsaTrippingDrillEl) {
      state.charts.tsaTrippingDrill = new Chart(tsaTrippingDrillEl, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Trips', data: [], backgroundColor: CHART_PRIMARY, borderRadius: 6, maxBarThickness: 42 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: d.tooltip },
          scales: {
            x: { ticks: { ...d.ticks, maxRotation: 35 }, grid: { display: false } },
            y: { min: 0, ticks: { ...d.ticks, precision: 0 }, grid: d.grid },
          },
          onClick(evt, elements) {
            handleTsaTrippingDrillClick(elements);
          },
        },
      });
    }

    // Legacy availability category chart (other TSA views may reference)
    const tsaAvailEl = document.getElementById('tsa-avail-category-chart');
    if (tsaAvailEl) {
    state.charts.tsaAvailCategory = new Chart(tsaAvailEl, {
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
    }

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
    state.charts.tsaOutageCircle = buildTsaOutageCircleChart();

    const oaWaterfallEl = document.getElementById('oa-waterfall-chart');
    if (oaWaterfallEl) {
      state.charts.oaWaterfall = new Chart(oaWaterfallEl, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{
            label: 'Availability %',
            data: [],
            backgroundColor: [
              'rgba(148, 163, 184, 0.45)',
              OA_CIRCLE_PALETTE.shutdown,
              OA_CIRCLE_PALETTE.breakdown,
              OA_CIRCLE_PALETTE.tripping,
              '#F59E0B',
              '#94A3B8',
              CHART_SUCCESS,
            ],
            borderRadius: 6,
            maxBarThickness: 52,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...d.tooltip,
              callbacks: {
                label(ctx) {
                  const range = ctx.raw;
                  if (!Array.isArray(range)) return `${ctx.parsed.y}%`;
                  return `${range[0].toFixed(2)}% → ${range[1].toFixed(2)}%`;
                },
              },
            },
          },
          scales: {
            x: { ticks: d.ticks, grid: { display: false } },
            y: {
              min: 97.5,
              max: 100,
              ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
              grid: d.grid,
            },
          },
        },
      });
    }

    const oaDurationEl = document.getElementById('oa-duration-chart');
    if (oaDurationEl) {
      state.charts.oaDuration = new Chart(oaDurationEl, {
        type: 'bar',
        data: {
          labels: ['< 6 hrs', '6–12 hrs', '12–24 hrs', '> 1 Day'],
          datasets: [{
            label: 'Outage events',
            data: [0, 0, 0, 0],
            backgroundColor: [CHART_SUCCESS, CHART_TEAL, CHART_WARNING, CHART_DANGER],
            borderRadius: 6,
            maxBarThickness: 56,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: d.tooltip },
          scales: {
            x: { ticks: d.ticks, grid: { display: false } },
            y: { min: 0, ticks: { ...d.ticks, precision: 0 }, grid: d.grid },
          },
        },
      });
    }

    const paretoEl = document.getElementById('tsa-outage-pareto-chart');
    if (paretoEl) {
      state.charts.tsaOutagePareto = new Chart(paretoEl, {
        data: {
          labels: [],
          datasets: [
            {
              type: 'bar',
              label: 'Loss hours',
              data: [],
              backgroundColor: [],
              borderRadius: 4,
              maxBarThickness: 16,
              yAxisID: 'y',
            },
            {
              type: 'line',
              label: 'Cumulative %',
              data: [],
              borderColor: CHART_DANGER,
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 3,
              tension: 0.25,
              xAxisID: 'x1',
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, labels: { color: d.color, font: { size: 11 } } }, tooltip: d.tooltip },
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
            x1: {
              position: 'top',
              min: 0,
              max: 100,
              ticks: { ...d.ticks, callback(v) { return `${v}%`; } },
              grid: { drawOnChartArea: false },
            },
          },
        },
      });
    }

    const tsaOutageTafmEl = document.getElementById('tsa-outage-tafm-chart');
    if (tsaOutageTafmEl) {
      state.charts.tsaOutageTafm = buildTsaOutageTafmChart();
    }

    const tsaOutageReasonsEl = document.getElementById('tsa-outage-reasons-chart');
    if (tsaOutageReasonsEl) {
      state.charts.tsaOutageReasons = new Chart(tsaOutageReasonsEl, {
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
    }

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

    initInventoryCharts(d);

    scheduleChartRefresh();
  }

  function initInventoryCharts(d) {
    const inv = state.data?.inventory;
    if (!inv) return;

    const ddClassEl = document.getElementById('inv-dd-class-chart');
    if (ddClassEl) {
      state.charts.invDdClass = new Chart(ddClassEl, {
        type: 'doughnut',
        data: {
          labels: inv.ddClassification.labels,
          datasets: [{
            data: inv.ddClassification.values.slice(),
            backgroundColor: INVENTORY_DD_CLASS_COLORS,
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
            tooltip: {
              ...d.tooltip,
              callbacks: {
                label(ctx) {
                  const pct = inv.ddClassification.percentages[ctx.dataIndex];
                  const val = Number(ctx.parsed).toFixed(2);
                  return ` ${ctx.label}: ${pct}% · ₹${val} Cr.`;
                },
              },
            },
          },
        },
      });
    }

    const storeEl = document.getElementById('inv-store-breakdown-chart');
    if (storeEl) {
      state.charts.invStoreBreakdown = new Chart(storeEl, {
        type: 'bar',
        plugins: [invStoreBreakdownPlugin],
        data: {
          labels: inv.storeBreakdown.labels,
          datasets: [
            {
              label: 'Healthy',
              data: inv.storeBreakdown.healthy.slice(),
              backgroundColor: INV_STORE_HEALTHY_COLOR,
              borderRadius: { topLeft: 4, bottomLeft: 4, topRight: 0, bottomRight: 0 },
              stack: 'store',
              maxBarThickness: 26,
            },
            {
              label: 'Scrap',
              data: inv.storeBreakdown.scrap.slice(),
              backgroundColor: INV_STORE_SCRAP_COLOR,
              borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 4, bottomRight: 4 },
              stack: 'store',
              maxBarThickness: 26,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { left: 6, right: 96, top: 8, bottom: 4 } },
          datasets: {
            bar: {
              categoryPercentage: 0.68,
              barPercentage: 0.9,
            },
          },
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: d.color,
                font: { size: 12, weight: '700', family: 'Inter, system-ui, sans-serif' },
                usePointStyle: true,
                padding: 16,
              },
            },
            tooltip: {
              ...d.tooltip,
              callbacks: {
                label(ctx) {
                  return ` ${ctx.dataset.label}: ${Number(ctx.parsed.x).toFixed(1)} Cr.`;
                },
                afterBody(items) {
                  const idx = items[0]?.dataIndex;
                  const chartRef = items[0]?.chart;
                  if (idx == null || !chartRef) return [];
                  const healthy = Number(chartRef.data.datasets[0]?.data[idx] || 0);
                  const scrap = Number(chartRef.data.datasets[1]?.data[idx] || 0);
                  return [`Total: ${(healthy + scrap).toFixed(1)} Cr.`];
                },
              },
            },
          },
          scales: {
            x: {
              stacked: true,
              grace: '14%',
              ticks: { ...d.ticks, callback(v) { return `${v} Cr.`; }, font: { size: 11 } },
              grid: { color: isDark() ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.18)' },
              border: { display: false },
              title: { display: true, text: 'Value (Cr.)', color: d.color, font: { size: 11, weight: '600' } },
            },
            y: {
              stacked: true,
              ticks: {
                ...d.ticks,
                font: { size: 11, weight: '600', family: 'Inter, system-ui, sans-serif' },
                padding: 12,
                crossAlign: 'far',
                autoSkip: false,
              },
              grid: { display: false },
              border: { display: false },
            },
          },
        },
      });
    }

    const consumptionEl = document.getElementById('inv-consumption-chart');
    if (consumptionEl) {
      state.charts.invConsumption = new Chart(consumptionEl, {
        type: 'bar',
        data: {
          labels: inv.consumption.labels,
          datasets: [
            {
              label: 'CWIP',
              data: inv.consumption.cwip.slice(),
              backgroundColor: '#3B82F6',
              borderRadius: 4,
              maxBarThickness: 28,
            },
            {
              label: 'O&M',
              data: inv.consumption.om.slice(),
              backgroundColor: '#F97316',
              borderRadius: 4,
              maxBarThickness: 28,
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
            x: {
              ticks: { ...d.ticks, maxRotation: 45, minRotation: 45, font: { size: 10 } },
              grid: { display: false },
            },
            y: {
              ticks: { ...d.ticks, callback(v) { return `${v} L`; } },
              grid: d.grid,
              title: { display: true, text: 'Lakhs', color: d.color, font: { size: 11 } },
            },
          },
        },
      });
    }

    const ageEl = document.getElementById('inv-age-chart');
    if (ageEl) {
      const ageSeries = inv.age || buildInventoryAgeSeries();
      state.charts.invAge = new Chart(ageEl, {
        type: 'bar',
        data: {
          labels: ageSeries.map((b) => b.label),
          datasets: [{
            label: 'Inventory Value',
            data: ageSeries.map((b) => b.value),
            backgroundColor: ageSeries.map((b) => b.color),
            borderRadius: 6,
            maxBarThickness: 48,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...d.tooltip,
              callbacks: {
                label(ctx) {
                  return ` ${Number(ctx.parsed.y).toFixed(1)} Lakhs`;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { ...d.ticks, maxRotation: 35, minRotation: 35, font: { size: 9 }, autoSkip: false },
              grid: { display: false },
            },
            y: {
              ticks: { ...d.ticks, callback(v) { return `${v} L`; } },
              grid: d.grid,
              title: { display: true, text: 'Lakhs', color: d.color, font: { size: 11 } },
            },
          },
        },
      });
    }

    const categoryEl = document.getElementById('inv-category-chart');
    if (categoryEl) {
      const rows = inv.category || buildInventoryCategorySeries();
      state.charts.invCategory = new Chart(categoryEl, {
        type: 'bar',
        data: {
          labels: rows.map((r) => r.circle),
          datasets: INVENTORY_MATERIAL_CATEGORIES.map((cat) => ({
            label: cat.label,
            data: rows.map((r) => r[cat.key]),
            backgroundColor: cat.color,
            stack: 'category',
            borderRadius: 3,
            maxBarThickness: 42,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: d.color, font: { size: 10 }, usePointStyle: true, boxWidth: 10 },
            },
            tooltip: {
              ...d.tooltip,
              callbacks: {
                footer(items) {
                  const total = items.reduce((sum, item) => sum + Number(item.parsed.y || 0), 0);
                  return `Total: ${total.toFixed(1)} Lakhs`;
                },
                label(ctx) {
                  return ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(1)} Lakhs`;
                },
              },
            },
          },
          scales: {
            x: {
              stacked: true,
              ticks: { ...d.ticks, maxRotation: 35, minRotation: 35, font: { size: 10 } },
              grid: { display: false },
            },
            y: {
              stacked: true,
              ticks: { ...d.ticks, callback(v) { return `${v} L`; } },
              grid: d.grid,
              title: { display: true, text: 'Lakhs', color: d.color, font: { size: 11 } },
            },
          },
        },
      });
    }

    renderInventoryOverview();
    renderInventoryConsumptionAndAge();
    renderInventoryCategoryDistribution();
  }

  function renderInventoryOverview() {
    const inv = state.data?.inventory;
    if (!inv) return;
    const s = inv.summary;
    updateInventoryKpiCard('dd', s.ddStore);
    updateInventoryKpiCard('site', s.siteStore);
    updateInventoryKpiCard('total', s.total);

    renderInvDdClassLegend(inv.ddClassification);
    const centerLabel = document.querySelector('.inv-dd-class-center-label');
    const centerValue = document.querySelector('.inv-dd-class-center-value');
    const centerShare = document.querySelector('.inv-dd-class-center-share');
    const baseline = inv.ddClassification.baseline ?? s.ddStore.total;
    if (centerLabel) centerLabel.textContent = 'DD Store Total';
    if (centerValue) centerValue.textContent = formatInvCr(baseline);
    if (centerShare) centerShare.textContent = '100% Share';
    if (state.charts.invDdClass) {
      state.charts.invDdClass.data.labels = inv.ddClassification.labels;
      state.charts.invDdClass.data.datasets[0].data = inv.ddClassification.values.slice();
      state.charts.invDdClass.data.datasets[0].backgroundColor = INVENTORY_DD_CLASS_COLORS;
      state.charts.invDdClass.update('none');
    }
    if (state.charts.invStoreBreakdown) {
      state.charts.invStoreBreakdown.data.labels = inv.storeBreakdown.labels;
      state.charts.invStoreBreakdown.data.datasets[0].data = inv.storeBreakdown.healthy.slice();
      state.charts.invStoreBreakdown.data.datasets[1].data = inv.storeBreakdown.scrap.slice();
      state.charts.invStoreBreakdown.update('none');
    }
  }

  function renderInventoryConsumptionAndAge() {
    const inv = state.data?.inventory;
    if (!inv) return;
    inv.consumption = buildInventoryConsumptionSeries(state.inventoryFy || 'all');
    inv.age = buildInventoryAgeSeries(state.inventoryStoreType, state.inventoryRequestType);

    if (state.charts.invConsumption) {
      state.charts.invConsumption.data.labels = inv.consumption.labels;
      state.charts.invConsumption.data.datasets[0].data = inv.consumption.cwip.slice();
      state.charts.invConsumption.data.datasets[1].data = inv.consumption.om.slice();
      state.charts.invConsumption.update('none');
    }
    if (state.charts.invAge) {
      state.charts.invAge.data.labels = inv.age.map((b) => b.label);
      state.charts.invAge.data.datasets[0].data = inv.age.map((b) => b.value);
      state.charts.invAge.data.datasets[0].backgroundColor = inv.age.map((b) => b.color);
      state.charts.invAge.update('none');
    }
  }

  function renderInventoryCategoryDistribution() {
    const inv = state.data?.inventory;
    if (!inv) return;
    if (!state.charts.invCategory) return;
    const rows = inv.category || buildInventoryCategorySeries();
    state.charts.invCategory.data.labels = rows.map((r) => r.circle);
    INVENTORY_MATERIAL_CATEGORIES.forEach((cat, i) => {
      state.charts.invCategory.data.datasets[i].data = rows.map((r) => r[cat.key]);
    });
    state.charts.invCategory.update('none');
  }

  function applyInventoryFyFilter() {
    const select = document.getElementById('inv-fy-filter');
    state.inventoryFy = select?.value || 'all';
    renderInventoryConsumptionAndAge();
  }

  function applyInventoryAgeFilters() {
    state.inventoryStoreType = document.getElementById('inv-store-type-filter')?.value || 'all';
    state.inventoryRequestType = document.getElementById('inv-request-type-filter')?.value || 'all';
    renderInventoryConsumptionAndAge();
  }

  // ─── DOM Updates ───────────────────────────────────────────────────────
  function secsAgo() {
    const s = Math.max(1, Math.round((Date.now() - (state.lastUpdateAt || Date.now())) / 1000));
    return `${s} sec ago`;
  }

  const TSA_OUTAGE_EDIT_ROLES = new Set(['Super Admin', 'Circle Manager', 'O&M Engineer']);

  function canEditTsaOutage() {
    return TSA_OUTAGE_EDIT_ROLES.has(state.currentUser?.role);
  }

  function getTsaDeemedRowKey(row) {
    return row.id || `${row.date}|${row.element}`;
  }

  function filterTsaDeemedRows(rows, filter = state.tsaDeemedFilter) {
    if (filter === 'countable') return rows.filter((r) => r.countable === 'Counted');
    if (filter === 'exempt') return rows.filter((r) => r.countable === 'Deemed exempt');
    return rows;
  }

  function getTsaOutageClassification(rows) {
    const totals = { Shutdown: 0, Breakdown: 0, Tripping: 0 };
    rows.forEach((r) => {
      if (totals[r.category] != null) totals[r.category] += r.hours;
    });
    const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
    return {
      shutdownPct: (totals.Shutdown / sum) * 100,
      breakdownPct: (totals.Breakdown / sum) * 100,
      trippingPct: (totals.Tripping / sum) * 100,
      values: [totals.Shutdown, totals.Breakdown, totals.Tripping],
    };
  }

  function getTsaMaxTrippingLocation() {
    const rows = getTsaTrippingRows();
    if (!rows.length) return { name: '—', circle: '—', trips: 0 };
    const top = rows.reduce((best, row) => (row.z > best.z ? row : best), rows[0]);
    return { name: top.name, circle: top.circle, trips: top.z };
  }

  function applyTsaKpiTone(cardEl, tone) {
    if (!cardEl) return;
    cardEl.classList.remove('tsa-kpi-tone-good', 'tsa-kpi-tone-warn', 'tsa-kpi-tone-bad');
    if (tone) cardEl.classList.add(`tsa-kpi-tone-${tone}`);
  }

  function getTsaTrippingDrillSeries(drill = state.tsaTrippingDrill) {
    const h = state.data?.tsa?.trippingHierarchy;
    if (!h || !drill) return { level: 'Zone', items: [] };
    if (drill.level === 'zone') return { level: 'Zone', items: h.zones || [] };
    if (drill.level === 'circle') return { level: 'Circle', items: h.circles?.[drill.parentKey] || [] };
    if (drill.level === 'division') return { level: 'Division', items: h.divisions?.[drill.parentKey] || [] };
    return { level: 'Sub Station', items: h.substations?.[drill.parentKey] || [] };
  }

  function getTsaTrippingDrillBreadcrumb(drill = state.tsaTrippingDrill) {
    if (!drill?.parentLabel) return 'Zone level';
    const parts = [];
    if (drill.zoneLabel) parts.push(drill.zoneLabel);
    if (drill.circleLabel) parts.push(drill.circleLabel);
    if (drill.divisionLabel) parts.push(drill.divisionLabel);
    return parts.length ? parts.join(' → ') : drill.parentLabel;
  }

  function syncTsaTrippingDrillChart() {
    const series = getTsaTrippingDrillSeries();
    const chart = state.charts.tsaTrippingDrill;
    if (!chart) return;
    chart.data.labels = series.items.map((i) => i.label);
    chart.data.datasets[0].data = series.items.map((i) => i.trips);
    chart.data.datasets[0].backgroundColor = series.items.map((_, idx) =>
      idx === 0 ? CHART_PRIMARY : 'rgba(14, 165, 233, 0.45)'
    );
    chart.update('none');
    const breadcrumb = document.getElementById('tsa-tripping-modal-breadcrumb');
    if (breadcrumb) breadcrumb.textContent = `${series.level} · ${getTsaTrippingDrillBreadcrumb()}`;
  }

  function openTsaTrippingModal(level = 'zone', parentKey = null, parentLabel = null, meta = {}) {
    state.tsaTrippingDrill = {
      level,
      parentKey,
      parentLabel,
      zoneLabel: meta.zoneLabel || (level === 'zone' ? null : meta.zoneLabel),
      circleLabel: meta.circleLabel || null,
      divisionLabel: meta.divisionLabel || null,
    };
    if (level === 'circle' && parentLabel) {
      state.tsaTrippingDrill.zoneLabel = parentLabel;
    }
    if (level === 'division' && parentLabel) {
      state.tsaTrippingDrill.circleLabel = parentLabel;
    }
    if (level === 'substation' && parentLabel) {
      state.tsaTrippingDrill.divisionLabel = parentLabel;
    }
    syncTsaTrippingDrillChart();
    const modal = document.getElementById('tsa-tripping-modal');
    if (modal) {
      modal.hidden = false;
      document.body.classList.add('tsa-modal-open');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function closeTsaTrippingModal() {
    const modal = document.getElementById('tsa-tripping-modal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('tsa-modal-open');
    state.tsaTrippingDrill = { level: 'zone', parentKey: null };
  }

  function handleTsaTrippingDrillClick(elements) {
    if (!elements?.length) return;
    const drill = state.tsaTrippingDrill || { level: 'zone' };
    const series = getTsaTrippingDrillSeries(drill);
    const item = series.items[elements[0].index];
    if (!item) return;
    if (drill.level === 'zone' && item.key) {
      openTsaTrippingModal('circle', item.key, item.label, { zoneLabel: item.label });
      return;
    }
    if (drill.level === 'circle' && item.key) {
      openTsaTrippingModal('division', item.key, item.label, {
        zoneLabel: drill.zoneLabel,
        circleLabel: item.label,
      });
      return;
    }
    if (drill.level === 'division' && item.key) {
      openTsaTrippingModal('substation', item.key, item.label, {
        zoneLabel: drill.zoneLabel,
        circleLabel: drill.circleLabel,
        divisionLabel: item.label,
      });
    }
  }

  function setTsaDeemedFilter(filter) {
    state.tsaDeemedFilter = filter;
    document.querySelectorAll('[data-tsa-deemed-filter]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.tsaDeemedFilter === filter);
    });
    renderTsaDeemedExempt();
    renderTsaExecutiveSummary();
  }

  function findTsaDeemedRow(key) {
    return (state.data?.tsa?.deemedExempt?.rows || []).find((r) => getTsaDeemedRowKey(r) === key);
  }

  function renderTsaExecutiveSummary() {
    const tsa = state.data?.tsa;
    if (!tsa) return;

    const gapPp = tsa.monthlyTafm - tsa.target;
    const deemedRows = filterTsaDeemedRows([...(tsa.deemedExempt?.rows || [])]);
    const outageClass = getTsaOutageClassification(deemedRows);
    const maxTrip = getTsaMaxTrippingLocation();

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('tsa-kpi-tafm', `${tsa.monthlyTafm.toFixed(2)}%`);
    setText('tsa-kpi-herc', `Target: ${tsa.target.toFixed(1)}%`);
    setText('tsa-kpi-herc-var', `${gapPp >= 0 ? '+' : ''}${gapPp.toFixed(2)} pp vs actual`);
    setText('tsa-kpi-max-tripping', maxTrip.name);
    setText('tsa-kpi-max-tripping-meta', `${maxTrip.circle} · ${maxTrip.trips} trips`);
    setText('tsa-kpi-outage', `${tsa.countableOutageHr.toFixed(1)} hr`);
    setText('tsa-kpi-outage-status', tsa.countableOutageHr > 90 ? 'Above monthly band' : 'Within monthly band');
    setText('tsa-kpi-tafm-status', gapPp >= 0 ? 'Above HERC target' : 'Below HERC target');
    setText('tsa-gauge-value', `${tsa.monthlyTafm.toFixed(2)}%`);
    setText('tsa-gauge-period', tsa.periodLabel);

    const execTrippingSeries = getExecTrippingSeries();
    state._lastExecTrippingSeries = execTrippingSeries;
    let execScope = `Grouped by ${execTrippingSeries.level} · contribution hours`;
    if (execTrippingSeries.drillLabel) execScope += ` · ${execTrippingSeries.drillLabel}`;
    setText('tsa-exec-tripping-scope', execScope);

    applyTsaKpiTone(document.getElementById('tsa-kpi-tafm-card'), gapPp >= 0.5 ? 'good' : gapPp >= 0 ? 'warn' : 'bad');
    applyTsaKpiTone(document.getElementById('tsa-kpi-herc-card'), gapPp >= 0 ? 'good' : 'bad');
    applyTsaKpiTone(document.getElementById('tsa-kpi-max-tripping-card'), maxTrip.trips >= 4 ? 'bad' : maxTrip.trips >= 3 ? 'warn' : 'good');
    applyTsaKpiTone(document.getElementById('tsa-kpi-outage-card'), tsa.countableOutageHr > 90 ? 'warn' : 'good');

    const gaugeValueEl = document.getElementById('tsa-gauge-value');
    if (gaugeValueEl) {
      gaugeValueEl.style.color = gapPp >= 0 ? 'var(--success)' : 'var(--danger)';
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
      state.charts.tsaTafmGauge.data.datasets[0].backgroundColor = [
        gapPp >= 0 ? CHART_SUCCESS : CHART_DANGER,
        getChartColors().track,
      ];
      state.charts.tsaTafmGauge.update('none');
    }
    if (state.charts.tsaExecTripping) {
      state.charts.tsaExecTripping.data.labels = execTrippingSeries.labels;
      state.charts.tsaExecTripping.data.datasets[0].data = execTrippingSeries.shutdown.slice();
      state.charts.tsaExecTripping.data.datasets[1].data = execTrippingSeries.breakdown.slice();
      state.charts.tsaExecTripping.data.datasets[2].data = execTrippingSeries.tripping.slice();
      state.charts.tsaExecTripping.update('none');
    }
    if (state.charts.tsaExecOutageClass) {
      syncTsaExecOutageClassChart(outageClass);
    }
    if (state.charts.tsaAvailCategory) {
      state.charts.tsaAvailCategory.data.labels = tsa.category.labels;
      state.charts.tsaAvailCategory.data.datasets[0].data = tsa.category.values.slice();
      state.charts.tsaAvailCategory.update('none');
    }

    renderTsaDeemedRows('tsa-exec-deemed-body', deemedRows, { compact: true });

    document.querySelectorAll('[data-exec-level]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.execLevel === state.execTrippingLevel);
    });
    document.querySelectorAll('[data-exec-cat]').forEach((input) => {
      const key = input.dataset.execCat;
      input.checked = !!state.execCategoryFilter[key];
    });
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

    const snap = buildOaDashboardSnapshot(oa);
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('oa-active-scope', getOaActiveScopeLabel());
    setText('oa-kpi-tsa', `${snap.tsa.toFixed(2)}%`);
    setText('oa-kpi-target', `${snap.target.toFixed(1)}%`);
    setText('oa-kpi-gap', `${snap.gap >= 0 ? '+' : ''}${snap.gap.toFixed(2)} pp gap`);
    setText('oa-kpi-total-hr', `${snap.totalHours.toFixed(1)} hr`);
    setText('oa-kpi-net-hr', `Net ${snap.netHours.toFixed(1)} hr · Effective ${snap.effectiveHours.toFixed(1)} hr`);
    setText('oa-kpi-tripping', `${snap.tripping.count} · ${snap.tripping.hours.toFixed(1)} hr`);
    setText('oa-kpi-breakdown', `${snap.breakdown.count} · ${snap.breakdown.hours.toFixed(1)} hr`);
    setText('oa-kpi-shutdown', `${snap.shutdown.count} · ${snap.shutdown.hours.toFixed(1)} hr`);
    setText('oa-kpi-planned', `${snap.planned.count} · ${snap.planned.hours.toFixed(1)} hr`);
    setText('oa-kpi-unplanned', `Unplanned ${snap.unplanned.count} · ${snap.unplanned.hours.toFixed(1)} hr`);

    applyOaKpiTone(document.getElementById('oa-kpi-tsa-card'), snap.gap >= 0.5 ? 'good' : snap.gap >= 0 ? 'warn' : 'bad');
    applyOaKpiTone(document.getElementById('oa-kpi-target-card'), snap.gap >= 0 ? 'good' : 'bad');
    applyOaKpiTone(document.getElementById('oa-kpi-hours-card'), snap.totalHours > 80 ? 'warn' : 'good');
    applyOaKpiTone(document.getElementById('oa-kpi-tripping-card'), snap.tripping.count >= 15 ? 'bad' : snap.tripping.count >= 10 ? 'warn' : 'good');
    applyOaKpiTone(document.getElementById('oa-kpi-breakdown-card'), snap.breakdown.count >= 12 ? 'warn' : 'good');
    applyOaKpiTone(document.getElementById('oa-kpi-shutdown-card'), 'good');
    applyOaKpiTone(document.getElementById('oa-kpi-planned-card'), snap.unplanned.hours > snap.planned.hours ? 'warn' : 'good');

    const regional = getOaRegionalSeries(oa, state.oaRegionalLevel);
    setText('oa-regional-scope', `Grouped by ${regional.level} · contribution hours`);

    if (state.charts.tsaOutageCircle) {
      state.charts.tsaOutageCircle.data.labels = regional.labels;
      state.charts.tsaOutageCircle.data.datasets[0].data = regional.shutdown.slice();
      state.charts.tsaOutageCircle.data.datasets[1].data = regional.breakdown.slice();
      state.charts.tsaOutageCircle.data.datasets[2].data = regional.tripping.slice();
      state.charts.tsaOutageCircle.update('none');
    }

    if (state.charts.oaWaterfall) {
      const wf = snap.waterfall.steps;
      state.charts.oaWaterfall.data.labels = wf.map((s) => s.label);
      state.charts.oaWaterfall.data.datasets[0].data = wf.map((s) => s.range);
      state.charts.oaWaterfall.update('none');
    }

    if (state.charts.oaDuration) {
      state.charts.oaDuration.data.labels = snap.durationBuckets.labels;
      state.charts.oaDuration.data.datasets[0].data = snap.durationBuckets.values;
      state.charts.oaDuration.update('none');
    }

    if (state.charts.tsaOutagePareto) {
      const pareto = snap.impactElements.slice(0, 8);
      const hours = pareto.map((r) => r.hours);
      const total = hours.reduce((s, v) => s + v, 0) || 1;
      let cumulative = 0;
      const cumPct = hours.map((h) => {
        cumulative += h;
        return Number(((cumulative / total) * 100).toFixed(1));
      });
      state.charts.tsaOutagePareto.data.labels = pareto.map((r) => r.name.replace(/^(\d+kV)\s+/i, ''));
      state.charts.tsaOutagePareto.data.datasets[0].data = hours;
      state.charts.tsaOutagePareto.data.datasets[0].backgroundColor = hours.map((_, i) => {
        if (cumPct[i] <= 80) return CHART_DANGER;
        if (i <= 2) return CHART_WARNING;
        return CHART_PRIMARY;
      });
      if (state.charts.tsaOutagePareto.data.datasets[1]) {
        state.charts.tsaOutagePareto.data.datasets[1].data = cumPct;
      }
      state.charts.tsaOutagePareto.update('none');
    }

    const impactBody = document.getElementById('oa-impact-body');
    if (impactBody) {
      impactBody.innerHTML = snap.impactElements.slice(0, 8).map((row, i) => `
        <tr>
          <td class="font-mono">${i + 1}</td>
          <td>${row.name}</td>
          <td class="font-mono text-right">${row.hours.toFixed(1)}</td>
          <td class="font-mono text-right">${row.trips}</td>
          <td class="font-mono text-right">${row.kv}</td>
          <td class="font-mono text-right oa-impact-score">${row.impact.toFixed(1)}</td>
        </tr>
      `).join('');
    }

    setText('oa-generator-count', `${snap.generatorEvents.count} events`);
    setText('oa-generator-hours', `${snap.generatorEvents.hours.toFixed(1)} outage hours`);

    const longList = document.getElementById('oa-long-duration-list');
    if (longList) {
      longList.innerHTML = snap.longDuration.length
        ? snap.longDuration.map((item) => `
          <li class="oa-alert-item">
            <span class="oa-alert-title">${item.element}</span>
            <span class="oa-alert-meta">${item.category} · ${item.hours.toFixed(1)} hr · ${item.date}</span>
          </li>
        `).join('')
        : '<li class="oa-alert-item oa-alert-empty">No long-duration outages in scope.</li>';
    }

    const underList = document.getElementById('oa-underperform-list');
    if (underList) {
      underList.innerHTML = snap.underperforming.length
        ? snap.underperforming.map((u) => `
          <li class="oa-under-item ${u.gap < -0.5 ? 'is-critical' : 'is-warn'}">
            <div>
              <span class="oa-under-name">${u.unit}</span>
              <span class="oa-under-level">${u.level}</span>
            </div>
            <div class="oa-under-metrics">
              <span class="font-mono">${u.tsa.toFixed(2)}%</span>
              <span class="oa-under-gap">${u.gap.toFixed(2)} pp</span>
            </div>
          </li>
        `).join('')
        : '<li class="oa-under-item oa-alert-empty">All units above HERC target in selected scope.</li>';
    }

    document.querySelectorAll('[data-oa-level]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.oaLevel === state.oaRegionalLevel);
    });
    document.querySelectorAll('[data-oa-cat]').forEach((input) => {
      const key = input.dataset.oaCat;
      input.checked = !!state.oaCategoryFilter[key];
    });
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

  function renderTsaDeemedCategoryCell(row) {
    const key = getTsaDeemedRowKey(row);
    const canEdit = canEditTsaOutage();
    if (state.tsaDeemedEditingKey === key) {
      return `
        <select class="select-sm tsa-category-edit" data-row-key="${key}" aria-label="Edit outage category">
          <option value="Shutdown"${row.category === 'Shutdown' ? ' selected' : ''}>Shutdown</option>
          <option value="Breakdown"${row.category === 'Breakdown' ? ' selected' : ''}>Breakdown</option>
          <option value="Tripping"${row.category === 'Tripping' ? ' selected' : ''}>Tripping</option>
        </select>`;
    }
    return `<span class="tsa-category-pill ${categoryPillClass(row.category)}">${row.category}</span>`;
  }

  function renderTsaDeemedActionCell(row) {
    const key = getTsaDeemedRowKey(row);
    const canEdit = canEditTsaOutage();
    if (!canEdit) return '<span class="text-muted text-xs">View only</span>';
    if (state.tsaDeemedEditingKey === key) {
      return `
        <div class="tsa-row-actions">
          <button type="button" class="btn btn-primary btn-sm tsa-save-category" data-row-key="${key}">Save</button>
          <button type="button" class="btn btn-secondary btn-sm tsa-cancel-edit" data-row-key="${key}">Cancel</button>
        </div>`;
    }
    return `<button type="button" class="btn btn-secondary btn-sm tsa-edit-btn" data-row-key="${key}"><i data-lucide="pencil" class="h-3.5 w-3.5"></i> Edit</button>`;
  }

  function renderTsaDeemedRows(tbodyId, rows, { compact = false } = {}) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = rows.map((r) => {
      const attachHtml = r.attach
        ? `<a href="#" class="tsa-attach-link" data-file="${r.attach}"><i data-lucide="paperclip" class="h-3.5 w-3.5"></i>${r.attach}</a>`
        : '';
      if (compact) {
        return `
        <tr>
          <td class="font-mono">${r.date}</td>
          <td>${r.element}</td>
          <td>${renderTsaDeemedCategoryCell(r)}</td>
          <td>${r.reason}</td>
          <td class="font-mono text-right">${r.hours.toFixed(1)}</td>
          <td><span class="tsa-countable ${r.countable === 'Deemed exempt' ? 'is-exempt' : 'is-counted'}">${r.countable}</span></td>
          <td>${r.remarks || '—'}</td>
          <td class="text-right">${renderTsaDeemedActionCell(r)}</td>
        </tr>`;
      }
      return `
      <tr>
        <td class="font-mono">${r.date}</td>
        <td>${r.element}</td>
        <td>${renderTsaDeemedCategoryCell(r)}</td>
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
        <td class="text-right">${renderTsaDeemedActionCell(r)}</td>
      </tr>`;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function renderTsaDeemedExemptTable(rows) {
    renderTsaDeemedRows('tsa-deemed-body', rows, { compact: false });
  }

  function exportTsaDeemedExemptCsv() {
    const rows = filterTsaDeemedRows(state.data?.tsa?.deemedExempt?.rows || []);
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

    const rows = filterTsaDeemedRows([...(reg.rows || [])]).sort((a, b) => b.date.localeCompare(a.date));
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

  const LOAD_FORECAST_INTERVALS = {
    '15m': { count: 16, xTitle: 'Time', stepMin: 15 },
    hourly: { count: 12, xTitle: 'Hour', stepMin: 60 },
    '24h': { count: 24, xTitle: 'Hour of Day', stepMin: 60 },
    weekly: { count: 7, xTitle: 'Day', stepMin: 1440 },
  };

  function hashFilterSeed() {
    const key = [
      state.filters.zone,
      state.filters.circle,
      state.filters.division,
      state.filters.substation,
      state.filters.voltageLevel,
    ].join('|');
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function seededUnit(seed, salt) {
    const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function getSelectedLocationLabel() {
    const zone = getFilterZone();
    const circle = getFilterCircle();
    const division = getFilterDivision();
    const substations = getSubstationsForFilter();
    const ss = !isFilterAll(state.filters.substation) ? substations[state.filters.substation] : null;
    if (ss) return getSubstationLabel(ss);
    if (division) return division.label || state.filters.division;
    if (circle) return circle.label || state.filters.circle;
    if (zone) return zone.label || state.filters.zone;
    return 'All Zones';
  }

  function getUptimeTrendLabels() {
    const now = new Date();
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (29 - i));
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    });
  }

  function buildUptimeDailySeries() {
    const seed = hashFilterSeed();
    return Array.from({ length: 30 }, (_, i) => {
      const dip = i >= 12 && i <= 20 ? 0.14 : 0;
      const wave = Math.sin((i + (seed % 5)) / 3.5) * 0.08;
      const noise = (seededUnit(seed, i + 140) - 0.5) * 0.06;
      return Number(clamp(99.86 + wave + noise - dip, 99.68, 100).toFixed(3));
    });
  }

  function getUptimeComparisonSeries() {
    const seed = hashFilterSeed();
    let level = 'Zone';
    let items = [];

    if (!isFilterAll(state.filters.substation)) {
      level = 'Sub Station';
      items = getFilteredSubstationEntries(getSubstationsForFilter()).map(([key, ss]) => ({
        key,
        label: getSubstationLabel(ss),
        selected: key === state.filters.substation,
      }));
    } else if (!isFilterAll(state.filters.division)) {
      level = 'Sub Station';
      items = getFilteredSubstationEntries(getSubstationsForFilter()).map(([key, ss]) => ({
        key,
        label: getSubstationLabel(ss),
        selected: false,
      }));
    } else if (!isFilterAll(state.filters.circle)) {
      level = 'Division';
      const divisions = getDivisionsForFilter();
      items = Object.entries(divisions).map(([key, div]) => ({
        key,
        label: div.label || key,
        selected: key === state.filters.division,
      }));
    } else if (!isFilterAll(state.filters.zone)) {
      level = 'Circle';
      const circles = getCirclesForFilter();
      items = Object.entries(circles).map(([key, circle]) => ({
        key,
        label: circle.label || key,
        selected: key === state.filters.circle,
      }));
    } else {
      items = Object.entries(FILTER_HIERARCHY)
        .filter(([zoneKey, zone]) => !isOtherHierarchyLabel(zone?.label) && !isOtherHierarchyLabel(zoneKey))
        .map(([key, zone]) => ({
          key,
          label: zone.label || key,
          selected: key === state.filters.zone,
        }));
    }

    if (!items.length) {
      items = [{ key: 'all', label: 'All Zones', selected: true }];
    }

    const values = items.map((item, i) =>
      Number(clamp(99.72 + seededUnit(seed, i + 90 + item.key.length) * 0.26, 99.68, 99.99).toFixed(3))
    );

    let selectedIndex = items.findIndex((item) => item.selected);
    if (selectedIndex < 0 && !isFilterAll(state.filters.substation)) {
      selectedIndex = items.findIndex((item) => item.key === state.filters.substation);
    }

    return {
      level,
      labels: items.map((item) => item.label),
      values,
      selectedIndex,
    };
  }

  function getUptimeOutageSnapshot() {
    const seed = hashFilterSeed();
    const plannedPct = clamp(0.08 + seededUnit(seed, 31) * 0.18, 0.05, 0.35);
    const forcedPct = clamp(0.04 + seededUnit(seed, 32) * 0.14, 0.02, 0.28);
    const totalPct = plannedPct + forcedPct;
    const monthHours = 30 * 24;
    const plannedHr = (plannedPct / 100) * monthHours;
    const forcedHr = (forcedPct / 100) * monthHours;
    const totalHr = plannedHr + forcedHr;
    const availability = clamp(100 - totalPct, 99.5, 100);

    return {
      location: getSelectedLocationLabel(),
      plannedPct,
      forcedPct,
      totalPct,
      plannedHr,
      forcedHr,
      totalHr,
      availability,
    };
  }

  function syncUptimeCharts({ rebuildTrend = false } = {}) {
    if (rebuildTrend || !state.data.uptime.dailyPct?.length) {
      state.data.uptime.dailyPct = buildUptimeDailySeries();
    }
    const trend = state.data.uptime.dailyPct;
    const compare = getUptimeComparisonSeries();
    const outage = getUptimeOutageSnapshot();
    state.data.uptime.pct30d = trend.reduce((s, v) => s + v, 0) / trend.length;

    if (state.charts.uptimeTrend) {
      state.charts.uptimeTrend.data.labels = getUptimeTrendLabels();
      state.charts.uptimeTrend.data.datasets[0].data = trend;
      state.charts.uptimeTrend.data.datasets[0].backgroundColor = uptimeTrendBarColor;
      state.charts.uptimeTrend.update('none');
    }

    if (state.charts.uptimeCompare) {
      state.charts.uptimeCompare.data.labels = compare.labels;
      state.charts.uptimeCompare.data.datasets[0].data = compare.values;
      state.charts.uptimeCompare.data.datasets[0].backgroundColor = compare.values.map((_, i) =>
        i === compare.selectedIndex ? CHART_PRIMARY : 'rgba(14, 165, 233, 0.45)'
      );
      state.charts.uptimeCompare.update('none');
    }

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('up-trend-scope', outage.location);
    setText('up-compare-scope', `By ${compare.level}`);
    setText('up-compare-title', `${compare.level} Uptime Comparison`);
    setText('up-outage-location', outage.location);
    setText('up-outage-planned', `${outage.plannedPct.toFixed(2)}%`);
    setText('up-outage-forced', `${outage.forcedPct.toFixed(2)}%`);
    setText('up-outage-total', `${outage.totalPct.toFixed(2)}%`);
    setText('up-outage-planned-hr', `${outage.plannedHr.toFixed(1)} hr`);
    setText('up-outage-forced-hr', `${outage.forcedHr.toFixed(1)} hr`);
    setText('up-outage-total-hr', `${outage.totalHr.toFixed(1)} hr`);
    setText('up-outage-avail', `${outage.availability.toFixed(2)}%`);
    setText('up-outage-avail-note', 'Last 30 days');
  }

  function getFilterLoadScaleMw() {
    const seed = hashFilterSeed();
    let scale = 22 + (seed % 8);
    if (!isFilterAll(state.filters.zone)) scale *= 0.72 + seededUnit(seed, 1) * 0.2;
    if (!isFilterAll(state.filters.circle)) scale *= 0.78 + seededUnit(seed, 2) * 0.15;
    if (!isFilterAll(state.filters.division)) scale *= 0.7 + seededUnit(seed, 3) * 0.18;
    if (!isFilterAll(state.filters.substation)) scale *= 0.35 + seededUnit(seed, 4) * 0.2;
    if (!isFilterAll(state.filters.voltageLevel)) {
      const v = Number(state.filters.voltageLevel) || 220;
      scale *= clamp(v / 220, 0.55, 1.35);
    }
    return scale;
  }

  function formatClockLabel(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function buildLoadForecastSeries(intervalKey = state.loadForecastInterval) {
    const cfg = LOAD_FORECAST_INTERVALS[intervalKey] || LOAD_FORECAST_INTERVALS.hourly;
    const seed = hashFilterSeed();
    const baseMw = (state.data?.feeders?.all?.mw || 140) * (0.85 + seededUnit(seed, 5) * 0.3);
    const now = new Date();
    const labels = [];
    const actual = [];
    const predicted = [];
    const margin = [];

    for (let i = 0; i < cfg.count; i++) {
      const t = new Date(now);
      if (intervalKey === 'weekly') {
        t.setDate(t.getDate() - (cfg.count - 1 - i));
        labels.push(t.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }));
      } else if (intervalKey === '24h') {
        labels.push(`${String(i).padStart(2, '0')}:00`);
      } else {
        t.setMinutes(t.getMinutes() - (cfg.count - 1 - i) * cfg.stepMin);
        labels.push(formatClockLabel(t));
      }
      const wave = Math.sin((i + seed % 7) / 2.4) * (12 + seededUnit(seed, i + 1) * 8);
      const noise = (seededUnit(seed, i + 40) - 0.5) * 6;
      const act = clamp(baseMw + wave + noise, 60, 240);
      const pred = clamp(act + (seededUnit(seed, i + 80) - 0.5) * 8, 60, 240);
      const m = 2 + seededUnit(seed, i + 120) * 5;
      actual.push(Number(act.toFixed(1)));
      predicted.push(Number(pred.toFixed(1)));
      margin.push(Number(m.toFixed(1)));
    }

    return { labels, actual, predicted, margin, xTitle: cfg.xTitle };
  }

  function syncLoadForecastChart(animate = false) {
    const chart = state.charts.loadForecast;
    const emptyEl = document.getElementById('la-forecast-empty');
    const wrap = document.querySelector('.la-forecast-chart-wrap');
    const series = buildLoadForecastSeries(state.loadForecastInterval);
    state.data.loadForecast = series;

    if (!chart) {
      if (emptyEl) emptyEl.hidden = false;
      if (wrap) wrap.hidden = true;
      return;
    }

    if (!series.labels.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (wrap) wrap.hidden = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (wrap) wrap.hidden = false;

    chart.data.labels = series.labels;
    chart.data.datasets[0].data = series.actual;
    chart.data.datasets[1].data = series.predicted;
    chart.data.datasets[2].data = series.predicted.map((v, i) => v + series.margin[i]);
    chart.data.datasets[3].data = series.predicted.map((v, i) => v - series.margin[i]);
    if (chart.options.scales?.x) {
      chart.options.scales.x.title = {
        display: true,
        text: series.xTitle || 'Time',
        color: chartDefaults().color,
      };
    }
    chart.update(animate ? 'default' : 'none');
  }

  function getLocationWeather() {
    const seed = hashFilterSeed();
    const conditions = [
      { name: 'Sunny', icon: 'sun' },
      { name: 'Cloudy', icon: 'cloud' },
      { name: 'Partly Cloudy', icon: 'cloud-sun' },
      { name: 'Rainy', icon: 'cloud-rain' },
      { name: 'Hazy', icon: 'cloud-fog' },
      { name: 'Windy', icon: 'wind' },
    ];
    const condition = conditions[seed % conditions.length];
    const base = state.data?.weather || { temp: 32, humidity: 68, wind: 14 };
    return {
      temp: clamp(Math.round(base.temp + (seededUnit(seed, 9) - 0.5) * 10), 18, 44),
      condition: condition.name,
      icon: condition.icon,
      humidity: clamp(Math.round(base.humidity + (seededUnit(seed, 10) - 0.5) * 20), 35, 95),
      wind: clamp(Math.round(base.wind + (seededUnit(seed, 11) - 0.5) * 12), 4, 42),
      location: getSelectedLocationLabel(),
    };
  }

  function renderLoadWeatherOverview() {
    const loading = document.getElementById('la-weather-loading');
    const empty = document.getElementById('la-weather-empty');
    const overview = document.getElementById('la-weather-overview');
    if (!overview) return;

    const weather = getLocationWeather();
    if (!weather) {
      if (empty) empty.hidden = false;
      overview.hidden = true;
      return;
    }

    if (loading) loading.hidden = true;
    if (empty) empty.hidden = true;
    overview.hidden = false;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('la-weather-location', weather.location);
    setText('la-weather-temp', `${weather.temp}°C`);
    setText('la-weather-condition', weather.condition);
    setText('la-weather-humidity', `${weather.humidity}%`);
    setText('la-weather-wind', `${weather.wind} km/h`);

    const iconWrap = document.getElementById('la-weather-icon');
    if (iconWrap) {
      iconWrap.innerHTML = `<i data-lucide="${weather.icon}" class="h-8 w-8"></i>`;
      lucide.createIcons({ nodes: iconWrap.querySelectorAll('[data-lucide]') });
    }
  }

  function getZonePeakLoadData(intervalKey = state.zonePeakInterval) {
    const seed = hashFilterSeed() + String(intervalKey).length * 97;
    const scale = getFilterLoadScaleMw();
    const base = (state.data?.feeders?.all?.mw || 150) * scale;
    const intervalBump = intervalKey === '15m' ? 0.92 : intervalKey === '24h' ? 1.06 : 1;
    const todayActual = Math.round(base * intervalBump * (0.98 + seededUnit(seed, 21) * 0.08));
    const todayPred = Math.round(todayActual * (0.985 + seededUnit(seed, 22) * 0.025));
    const tomorrowPred = Math.round(todayActual * (1.08 + seededUnit(seed, 23) * 0.12));

    const peakHour = 9 + Math.floor(seededUnit(seed, 24) * 5);
    const peakMin = intervalKey === '15m'
      ? [0, 15, 30, 45][Math.floor(seededUnit(seed, 25) * 4)]
      : [0, 30][Math.floor(seededUnit(seed, 25) * 2)];
    const tomorrowHour = 15 + Math.floor(seededUnit(seed, 26) * 4);
    const tomorrowMin = intervalKey === '15m' ? 0 : 0;

    const fmt = (h, m) => `at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return {
      todayActual: { mw: todayActual, time: fmt(peakHour, peakMin) },
      todayPredicted: { mw: todayPred, time: fmt(peakHour, peakMin) },
      tomorrowPredicted: { mw: tomorrowPred, time: fmt(tomorrowHour, tomorrowMin) },
    };
  }

  function renderZonePeakLoad() {
    const loading = document.getElementById('la-peak-loading');
    const empty = document.getElementById('la-peak-empty');
    const grid = document.getElementById('la-peak-grid');
    if (!grid) return;

    const data = getZonePeakLoadData(state.zonePeakInterval);
    if (!data) {
      if (empty) empty.hidden = false;
      grid.hidden = true;
      return;
    }

    if (loading) loading.hidden = true;
    if (empty) empty.hidden = true;
    grid.hidden = false;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('la-peak-actual-mw', `${data.todayActual.mw.toLocaleString('en-IN')} MW`);
    setText('la-peak-actual-time', data.todayActual.time);
    setText('la-peak-pred-mw', `${data.todayPredicted.mw.toLocaleString('en-IN')} MW`);
    setText('la-peak-pred-time', data.todayPredicted.time);
    setText('la-peak-tmr-mw', `${data.tomorrowPredicted.mw.toLocaleString('en-IN')} MW`);
    setText('la-peak-tmr-time', data.tomorrowPredicted.time);
  }

  function setLoadWidgetLoading(ids, isLoading) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = !isLoading;
    });
  }

  function refreshLoadProfileWidgets({ animateForecast = false, showLoading = false } = {}) {
    const run = () => {
      renderLoadAnalytics();
      renderLoadWeatherOverview();
      renderZonePeakLoad();
      syncLoadForecastChart(animateForecast);
      setLoadWidgetLoading(['la-forecast-loading', 'la-weather-loading', 'la-peak-loading'], false);
    };

    if (!showLoading) {
      run();
      return;
    }

    setLoadWidgetLoading(['la-forecast-loading', 'la-weather-loading', 'la-peak-loading'], true);
    window.setTimeout(run, 280);
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

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('la-scheduled', `${scheduled.toFixed(0)} MW`);
    setText('la-actual', `${actual.toFixed(0)} MW`);
    setText('la-deviation', `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%`);
    setText('la-availability', `${availability.toFixed(0)} MW`);

    const technical = state.data.losses.technical;
    const nonTechnical = state.data.losses.nonTechnical;
    const totalLoss = technical + nonTechnical;
    const feederEntries = Object.entries(state.data.losses.feeders);
    const bestFeeder = feederEntries.reduce((best, curr) => (curr[1] < best[1] ? curr : best), feederEntries[0]);
    setText('la-loss-total', `${totalLoss.toFixed(1)}%`);
    setText('la-loss-technical', `${technical.toFixed(1)}%`);
    setText('la-loss-nontechnical', `${nonTechnical.toFixed(1)}%`);
    setText('la-loss-best', bestFeeder[0]);

    renderLoadWeatherOverview();
    renderZonePeakLoad();
  }

  function renderTransmissionLossAnalytics() {
    const losses = state.data.losses;
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    const total = losses.technical + losses.nonTechnical;
    setText('tl-total-loss', `${total.toFixed(2)}%`);
    setText('tl-avail-target', `${(losses.availabilityTarget ?? 99.20).toFixed(2)}%`);

    syncSoAvailabilityChart(false);
    syncLossMonthlyChart(state.charts.tlMonthlyTrend, losses.monthly);
    if (state.charts.tlMonthlyTrend) {
      requestAnimationFrame(() => {
        state.charts.tlMonthlyTrend.resize();
        state.charts.tlMonthlyTrend.update('none');
      });
    }
    renderZoneCircleLossForAvailPoint(state.soAvailSelectedIndex);

    const hotspotRows = (losses.hotspots || []).slice().sort((a, b) => b.loss - a.loss);
    const tbody = document.getElementById('tl-hotspots-body');
    if (tbody) {
      const severityClass = {
        Critical: 'badge-danger',
        High: 'badge-warning',
        Medium: 'badge-warning',
        Normal: 'badge-success',
      };
      tbody.innerHTML = hotspotRows.map((r) => `
        <tr class="so-hotspot-row so-hotspot-row--${String(r.priority || 'Normal').toLowerCase()}">
          <td>${r.zone}</td>
          <td>${r.circle}</td>
          <td class="font-mono">${r.loss.toFixed(2)}%</td>
          <td><span class="badge ${severityClass[r.priority] || 'badge-success'}">${r.priority}</span></td>
        </tr>
      `).join('');
    }
  }

  function renderPowerQualityAnalytics() {
    const pq = state.data.powerQuality;
    const soPq = getSoPowerQualitySnapshot(state.data);
    const reactive = pq.reactiveMvar ?? soPq.reactiveMvar;
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('pq-tab-reactive-value', `${Number(reactive).toFixed(1)} MVAR`);
    setText('pq-tab-voltage-value', `${pq.voltage.toFixed(1)}%`);
    setText('pq-tab-sag-value', `${pq.voltageSags ?? state.data.pqEvents.sags}`);
    setText('pq-tab-swell-value', `${pq.voltageSwells ?? state.data.pqEvents.swells}`);
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
    renderInventoryOverview();
    renderInventoryConsumptionAndAge();
    renderInventoryCategoryDistribution();

    // Availability
    document.getElementById('availability-pct').textContent = `${data.availability.toFixed(2)}%`;
    document.getElementById('planned-outage').textContent = `${data.plannedOutage.toFixed(2)}%`;
    document.getElementById('forced-outage').textContent = `${data.forcedOutage.toFixed(2)}%`;

    // Power quality (System Operation card)
    const pq = data.powerQuality;
    const soPq = getSoPowerQualitySnapshot(data);
    const activeEl = document.getElementById('pq-active-value');
    const reactiveEl = document.getElementById('pq-reactive-value');
    const vbandEl = document.getElementById('pq-vband-value');
    if (activeEl) activeEl.textContent = `${soPq.activeMw.toFixed(1)} MW`;
    if (reactiveEl) reactiveEl.textContent = `${soPq.reactiveMvar.toFixed(1)} MVAR`;
    if (vbandEl) vbandEl.textContent = `${soPq.voltageBand.toFixed(1)}%`;

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
    syncUptimeCharts({ rebuildTrend: true });
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
    if (state.charts.soAvailability || state.charts.availSpark) {
      state.data.availabilityHistory.push(buildAvailabilityHistoryPoint(data.plannedOutage, data.forcedOutage));
      if (state.data.availabilityHistory.length > 48) state.data.availabilityHistory.shift();
      syncSoAvailabilityChart(false);
    }

    // Load profile — feeder ratio handled in applyChartTimeFilter

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

    if (state.charts.tlMonthlyTrend && data.losses?.monthly) {
      const m = data.losses.monthly;
      if (m.total.length) {
        const i = m.total.length - 1;
        const last = Number(m.total[i]) || (data.losses.technical + data.losses.nonTechnical);
        m.total[i] = Number(clamp(last + rand(-0.12, 0.12), 3.5, 5.5).toFixed(1));
      }
      syncLossMonthlyChart(state.charts.tlMonthlyTrend, m);
    }

    // PQ gauges
    const pq = data.powerQuality;
    const soPq = getSoPowerQualitySnapshot(data);
    const reactiveVal = pq.reactiveMvar ?? soPq.reactiveMvar;
    const reactiveMax = Math.max(100, reactiveVal * 1.35);
    const sagVal = pq.voltageSags ?? data.pqEvents.sags;
    const swellVal = pq.voltageSwells ?? data.pqEvents.swells;
    const gauges = [
      { chart: state.charts.pqActive, val: soPq.activeMw, max: soPq.activeMax, color: CHART_PRIMARY },
      { chart: state.charts.pqReactive, val: soPq.reactiveMvar, max: soPq.reactiveMax, color: CHART_TEAL },
      {
        chart: state.charts.pqVband,
        val: soPq.voltageBand,
        max: 100,
        color: soPq.voltageBand < 96 ? CHART_DANGER : CHART_SUCCESS,
      },
      {
        chart: state.charts.pqReactiveTab,
        val: reactiveVal,
        max: reactiveMax,
        color: reactiveVal > reactiveMax * 0.85 ? CHART_DANGER : CHART_TEAL,
      },
      { chart: state.charts.pqVoltageTab, val: pq.voltage, max: 100, color: pq.voltage < 96 ? '#ef4444' : '#22c55e' },
      { chart: state.charts.pqSagTab, val: sagVal, max: 12, color: sagVal > 8 ? '#ef4444' : '#3B82F6' },
      { chart: state.charts.pqSwellTab, val: swellVal, max: 10, color: swellVal > 6 ? '#ef4444' : '#F59E0B' },
    ];
    gauges.forEach(({ chart, val, max, color }) => {
      if (!chart) return;
      const track = getChartColors().track;
      chart.data.datasets[0].data = [val, Math.max(max - val, 0)];
      chart.data.datasets[0].backgroundColor = [color, track];
      chart.update('none');
    });

    if (state.charts.pqTrend) {
      const trend = data.powerQualityTrend;
      const feeder = data.feeders?.all || { mw: 140, mva: 155 };
      const nextDeviation = clamp(Math.abs(100 - pq.voltage) + rand(-0.2, 0.2), 0.1, 5);
      const nextActive = clamp(feeder.mw + rand(-3, 3), 80, 180);
      const nextReactive = clamp(reactiveVal + rand(-2, 2), 25, 110);
      const nextFreq = clamp(data.gridFrequency + rand(-0.02, 0.02), 49.7, 50.3);
      trend.voltageDeviation.push(nextDeviation);
      trend.activePower.push(nextActive);
      trend.reactivePower.push(nextReactive);
      trend.frequency.push(nextFreq);
      const maxLen = trend.labels.length;
      ['voltageDeviation', 'activePower', 'reactivePower', 'frequency'].forEach((key) => {
        while (trend[key].length > maxLen) trend[key].shift();
      });
      state.charts.pqTrend.data.datasets[0].data = trend.voltageDeviation.slice();
      state.charts.pqTrend.data.datasets[1].data = trend.activePower.slice();
      state.charts.pqTrend.data.datasets[2].data = trend.reactivePower.slice();
      state.charts.pqTrend.data.datasets[3].data = trend.frequency.slice();
      state.charts.pqTrend.update('none');
    }

    if (state.charts.pqEvents) {
      data.pqEvents.sags = sagVal;
      data.pqEvents.swells = swellVal;
      state.charts.pqEvents.data.datasets[0].data = [
        data.pqEvents.sags,
        data.pqEvents.swells,
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
      data.uptime.dailyPct = data.uptime.dailyPct.map((v) => clamp(v + rand(-0.01, 0.01), 99.7, 100));
      syncUptimeCharts();
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
    if (!sel) return;
    const options = Object.entries(FILTER_HIERARCHY)
      .filter(([k, v]) => !isOtherHierarchyLabel(v.label) && !isOtherHierarchyLabel(k))
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([k, v]) =>
        `<option value="${k}"${k === state.filters.zone ? ' selected' : ''}>${v.label}</option>`
      )
      .join('');
    sel.innerHTML = filterAllOption(state.filters.zone) + options;
    sel.value = isFilterAll(state.filters.zone) ? FILTER_ALL : state.filters.zone;
  }

  function populateCircleFilter() {
    const sel = document.getElementById('filter-circle');
    if (!sel) return;
    resetFilterCascadeFromZone();
    const circles = getCirclesForFilter();
    const options = Object.entries(circles)
      .filter(([k, v]) => !isOtherHierarchyLabel(v.label) && !isOtherHierarchyLabel(k))
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([k, v]) =>
        `<option value="${k}"${k === state.filters.circle ? ' selected' : ''}>${v.label}</option>`
      )
      .join('');
    sel.innerHTML = filterAllOption(state.filters.circle) + options;
    sel.value = isFilterAll(state.filters.circle) ? FILTER_ALL : state.filters.circle;
  }

  function populateDivisionFilter() {
    const sel = document.getElementById('filter-division');
    if (!sel) return;
    resetFilterCascadeFromCircle();
    const divisions = getDivisionsForFilter();
    const options = Object.entries(divisions)
      .filter(([k, v]) => !isOtherHierarchyLabel(v.label) && !isOtherHierarchyLabel(k))
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([k, v]) =>
        `<option value="${k}"${k === state.filters.division ? ' selected' : ''}>${v.label}</option>`
      )
      .join('');
    sel.innerHTML = filterAllOption(state.filters.division) + options;
    sel.value = isFilterAll(state.filters.division) ? FILTER_ALL : state.filters.division;
  }

  function populateSubstationFilter() {
    const sel = document.getElementById('filter-substation');
    if (!sel) return;
    resetFilterCascadeFromDivision();
    const entries = getFilteredSubstationEntries(getSubstationsForFilter())
      .sort((a, b) => getSubstationLabel(a[1]).localeCompare(getSubstationLabel(b[1])));
    const options = entries.map(([k, v]) =>
      `<option value="${k}"${k === state.filters.substation ? ' selected' : ''}>${getSubstationLabel(v)}</option>`
    ).join('');
    sel.innerHTML = filterAllOption(state.filters.substation) + options;
    sel.value = isFilterAll(state.filters.substation) ? FILTER_ALL : state.filters.substation;
  }

  function populateVoltageFilter() {
    const sel = document.getElementById('filter-voltage');
    if (!sel) return;
    const levels = FILTER_VOLTAGE_LEVELS.some((o) => o.value === FILTER_ALL)
      ? FILTER_VOLTAGE_LEVELS
      : [{ value: FILTER_ALL, label: 'All' }, ...FILTER_VOLTAGE_LEVELS];
    sel.innerHTML = levels.map((opt) =>
      `<option value="${opt.value}"${opt.value === state.filters.voltageLevel ? ' selected' : ''}>${opt.label}</option>`
    ).join('');
    if (isFilterAll(state.filters.voltageLevel)) sel.value = FILTER_ALL;
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
    allTime: 'All',
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
    populateCircleFilter();
    populateDivisionFilter();
    populateSubstationFilter();
    populateVoltageFilter();
  }

  function applyFilters() {
    state.filters.zone = document.getElementById('filter-zone').value;
    state.filters.circle = document.getElementById('filter-circle').value;
    state.filters.division = document.getElementById('filter-division').value;
    state.filters.substation = document.getElementById('filter-substation').value;
    state.filters.voltageLevel = document.getElementById('filter-voltage')?.value || 'all';
    initMockData();
    updateDOM();
    refreshLoadProfileWidgets({ showLoading: true, animateForecast: true });
    renderUptimeAnalytics();
    scheduleChartRefresh();
  }

  function clearAllFilters() {
    state.filters.zone = FILTER_ALL;
    state.filters.circle = FILTER_ALL;
    state.filters.division = FILTER_ALL;
    state.filters.substation = FILTER_ALL;
    state.filters.voltageLevel = FILTER_ALL;
    state.filters.dateRange = (() => {
      const ranges = drpGetPresetRanges(new Date());
      return { ...ranges.allTime, preset: 'allTime' };
    })();
    populateZoneFilter();
    populateCircleFilter();
    populateDivisionFilter();
    populateSubstationFilter();
    populateVoltageFilter();
    drpUpdateTriggerLabel();
    initMockData();
    updateDOM();
    refreshLoadProfileWidgets({ showLoading: true, animateForecast: true });
    renderUptimeAnalytics();
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
    syncHashFromView(viewId);

    const filterToolbar = document.querySelector('.filter-toolbar');
    if (filterToolbar) {
      filterToolbar.hidden = viewId === 'settings' || String(viewId).startsWith('inventory-');
    }

    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.classList.toggle('main-content--inventory-fit', viewId === 'inventory-overview');
    }

    const invExportBtn = document.getElementById('inv-export-report');
    if (invExportBtn) invExportBtn.hidden = viewId !== 'inventory-overview';

    if (viewId === 'tsa-outage-analytics') {
      startTafmPulse();
      startOaCirclePulse();
    } else if (viewId === 'tsa-executive-summary') {
      stopTafmPulse();
      startOaCirclePulse();
    } else {
      stopTafmPulse();
      stopOaCirclePulse();
    }

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

    if (String(viewId).startsWith('inventory-')) {
      const invGroup = document.getElementById('nav-inventory-group');
      const invToggle = document.getElementById('nav-inventory-toggle');
      if (invGroup && invToggle) {
        invGroup.classList.add('is-open');
        invToggle.classList.add('is-open');
        invToggle.setAttribute('aria-expanded', 'true');
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

    document.getElementById('tsa-kpi-max-tripping-card')?.addEventListener('click', () => {
      openTsaTrippingModal('zone');
    });

    document.querySelectorAll('[data-tsa-deemed-filter]').forEach((btn) => {
      btn.addEventListener('click', () => setTsaDeemedFilter(btn.dataset.tsaDeemedFilter));
    });

    document.querySelectorAll('[data-tsa-modal-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeTsaTrippingModal());
    });

    document.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.tsa-edit-btn');
      if (editBtn) {
        state.tsaDeemedEditingKey = editBtn.dataset.rowKey;
        renderTsaDeemedExempt();
        renderTsaExecutiveSummary();
        return;
      }
      const cancelBtn = e.target.closest('.tsa-cancel-edit');
      if (cancelBtn) {
        state.tsaDeemedEditingKey = null;
        renderTsaDeemedExempt();
        renderTsaExecutiveSummary();
        return;
      }
      const saveBtn = e.target.closest('.tsa-save-category');
      if (saveBtn) {
        const key = saveBtn.dataset.rowKey;
        const row = findTsaDeemedRow(key);
        const select = document.querySelector(`.tsa-category-edit[data-row-key="${CSS.escape(key)}"]`);
        if (row && select) row.category = select.value;
        state.tsaDeemedEditingKey = null;
        renderTsaDeemedExempt();
        renderTsaExecutiveSummary();
      }
    });

    document.getElementById('tsa-tripping-export-csv')?.addEventListener('click', () => {
      exportTsaTrippingRegisterCsv();
    });

    document.getElementById('oa-circle-export')?.addEventListener('click', () => {
      exportOaCircleCsv();
    });
    document.getElementById('oa-circle-refresh')?.addEventListener('click', () => {
      if (state.charts.tsaOutageCircle) {
        state.charts.tsaOutageCircle.update();
      }
    });

    document.querySelectorAll('[data-oa-level]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.oaRegionalLevel = btn.dataset.oaLevel;
        renderTsaOutageAnalytics();
      });
    });

    document.querySelectorAll('[data-oa-cat]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.oaCat;
        if (!key) return;
        state.oaCategoryFilter[key] = input.checked;
        renderTsaOutageAnalytics();
      });
    });

    document.querySelectorAll('[data-exec-level]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.execTrippingLevel = btn.dataset.execLevel;
        state.execTrippingDrill = { zoneKey: null, circleKey: null, zoneLabel: null, circleLabel: null };
        renderTsaExecutiveSummary();
      });
    });

    document.querySelectorAll('[data-exec-cat]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.execCat;
        if (!key) return;
        state.execCategoryFilter[key] = input.checked;
        renderTsaExecutiveSummary();
      });
    });

    document.getElementById('exec-tripping-refresh')?.addEventListener('click', () => {
      resetExecTrippingWidget();
    });

    document.getElementById('exec-tripping-export')?.addEventListener('click', () => {
      exportExecTrippingCsv();
    });

    document.querySelectorAll('[data-so-avail-gran]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.soAvailGranularity = btn.dataset.soAvailGran;
        state.soAvailSelectedIndex = null;
        renderZoneCircleLossForAvailPoint(null);
        syncSoAvailabilityChart(true);
      });
    });

    document.querySelectorAll('[data-so-avail-metric]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.soAvailMetric = btn.dataset.soAvailMetric;
        syncSoAvailabilityChart(true);
      });
    });

    document.getElementById('so-avail-refresh')?.addEventListener('click', () => {
      resetSoAvailabilityWidget();
    });

    document.getElementById('so-avail-export')?.addEventListener('click', () => {
      exportSoAvailabilityCsv();
    });

    document.getElementById('inv-fy-apply')?.addEventListener('click', () => {
      applyInventoryFyFilter();
    });
    document.getElementById('inv-age-apply')?.addEventListener('click', () => {
      applyInventoryAgeFilters();
    });
    document.getElementById('inv-export-report')?.addEventListener('click', () => {
      exportInventoryOverviewReport();
    });

    window.addEventListener('hashchange', () => {
      const viewId = viewIdFromHash();
      if (viewId) switchView(viewId);
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

    document.getElementById('feeder-select')?.addEventListener('change', (e) => {
      state.currentFeeder = e.target.value;
      updateCharts();
      renderLoadAnalytics();
      document.getElementById('ov-load').textContent =
        `${(state.data.feeders[state.currentFeeder]?.mw || state.data.feeders.all.mw).toFixed(1)} MW`;
    });

    document.getElementById('la-forecast-interval')?.addEventListener('change', (e) => {
      state.loadForecastInterval = e.target.value;
      setLoadWidgetLoading(['la-forecast-loading'], true);
      window.setTimeout(() => {
        syncLoadForecastChart(true);
        setLoadWidgetLoading(['la-forecast-loading'], false);
      }, 220);
    });

    document.getElementById('la-peak-interval')?.addEventListener('change', (e) => {
      state.zonePeakInterval = e.target.value;
      setLoadWidgetLoading(['la-peak-loading'], true);
      window.setTimeout(() => {
        renderZonePeakLoad();
        setLoadWidgetLoading(['la-peak-loading'], false);
      }, 220);
    });

    document.getElementById('filter-zone').addEventListener('change', (e) => {
      state.filters.zone = e.target.value;
      state.filters.circle = FILTER_ALL;
      state.filters.division = FILTER_ALL;
      state.filters.substation = FILTER_ALL;
      populateCircleFilter();
      populateDivisionFilter();
      populateSubstationFilter();
    });

    document.getElementById('filter-circle')?.addEventListener('change', (e) => {
      state.filters.circle = e.target.value;
      state.filters.division = FILTER_ALL;
      state.filters.substation = FILTER_ALL;
      populateDivisionFilter();
      populateSubstationFilter();
    });

    document.getElementById('filter-division').addEventListener('change', (e) => {
      state.filters.division = e.target.value;
      state.filters.substation = FILTER_ALL;
      populateSubstationFilter();
    });

    document.getElementById('filter-substation').addEventListener('change', (e) => {
      state.filters.substation = e.target.value;
    });

    document.getElementById('filter-voltage')?.addEventListener('change', (e) => {
      state.filters.voltageLevel = e.target.value;
      state.filters.substation = FILTER_ALL;
      populateSubstationFilter();
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
    const hashView = viewIdFromHash();
    if (hashView) switchView(hashView);
    else {
      const invExportBtn = document.getElementById('inv-export-report');
      if (invExportBtn) invExportBtn.hidden = true;
    }
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
