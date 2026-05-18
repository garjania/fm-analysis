/**
 * Scaling Fits Section
 *
 * Renders the fitted L(D) = E + B / (D + C)^beta curves for each X→Y task.
 * Actual observed data points from the base model can be toggled as an overlay.
 */

import Chart from 'chart.js/auto';
import { makeDataset, tooltipPlugin, getCSSColor, hexToRgba } from '../utils/chartHelpers.js';
import {
  X_LABELS, Y_LABELS, FIT_PARAMS, PALETTE,
  N_TOKENS_PER_PCT, SCALE_AXIS_LABEL, METRIC_AXIS_LABEL,
} from '../data/scalingFitsData.js';
import { SCALING_DATA as ACTUAL_DATA } from '../data/scalingDataBase.js';

// Number of points sampled along the fitted curve
const CURVE_POINTS = 200;

// Default selection — same first five pairs as Scaling Trends
const DEFAULT_SELECTION = [
  [0, 0], [0, 1], [1, 0], [2, 3], [3, 2],
];

// Evaluate L(D) = E + B / (D + C)^beta
function evalFit({ E, B, beta, C }, D) {
  return E + B / Math.pow(D + C, beta);
}

// Build smooth curve points { x: pct, y: loss } from pct=0..maxPct
function fitCurvePoints(params, maxPct = 100) {
  const pts = [];
  for (let i = 0; i <= CURVE_POINTS; i++) {
    const pct = (i / CURVE_POINTS) * maxPct;
    const D = pct * N_TOKENS_PER_PCT;
    pts.push({ x: parseFloat(pct.toFixed(4)), y: evalFit(params, D) });
  }
  return pts;
}

// Compute D% of CC12M required to reach fraction p (0–1) of the convergence range.
// Derivation:
//   (B/C^β − B/(D+C)^β) / (B/C^β) = p
//   1 − (C/(D+C))^β = p
//   D = C · ((1−p)^(−1/β) − 1)
function convergenceDpct({ beta, C }, p) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  return C * (Math.pow(1 - p, -1 / beta) - 1) / N_TOKENS_PER_PCT;
}

// ─────────────────────────────────────────────────────────────────────────────
export const scalingFitsSection = {
  id: 'scaling-fits',
  title: 'Scaling Fits',
  icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 13 Q5 4 14 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <path d="M2 14h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>
    <circle cx="4" cy="10" r="1.5" fill="currentColor" opacity=".7"/>
    <circle cx="8" cy="6" r="1.5" fill="currentColor" opacity=".7"/>
    <circle cx="12" cy="3.5" r="1.5" fill="currentColor" opacity=".7"/>
  </svg>`,
  badge: `${Object.values(FIT_PARAMS).reduce((s, ys) => s + Object.keys(ys).length, 0)} fits`,

  // ── Render ─────────────────────────────────────────────────────────────────
  render(container) {
    container.innerHTML = buildHTML();
    this._initState();
    this._bindEvents(container);
    this._rebuildChart();
  },

  // ── Internal state ─────────────────────────────────────────────────────────
  _chart: null,
  _selected: new Set(),
  _yScale: 'linear',
  _activeXFilter: null,
  _xMin: null,
  _xMax: null,
  _showActual: true,
  _extrapolate: false,
  _convergencePct: 90,

  _initState() {
    this._selected = new Set(DEFAULT_SELECTION.map(([xi, yi]) => `${xi}:${yi}`));
    this._yScale = 'linear';
    this._activeXFilter = null;
    this._xMin = null;
    this._xMax = null;
    this._showActual = true;
    this._extrapolate = false;
    this._convergencePct = 90;
  },

  // ── Chart (re)build ────────────────────────────────────────────────────────
  _rebuildChart() {
    const wrapper = document.getElementById('fitsCanvasWrapper');
    if (!wrapper) return;

    const datasets = this._buildDatasets();
    this._updateEmptyState(datasets.length === 0);

    if (datasets.length === 0) {
      if (this._chart) { this._chart.destroy(); this._chart = null; }
      this._renderLegend([]);
      this._updateStats([]);
      this._updateConvergenceTable([]);
      return;
    }

    const scaleUnchanged = this._chart &&
      this._chart.options.scales.y.type === this._yScale &&
      this._chart.options.scales.x.type === this._yScale;

    if (scaleUnchanged) {
      this._chart.data.datasets = datasets;
      const { min: yMin, max: yMax } = this._yBounds(datasets, this._yScale);
      this._chart.options.scales.y.min = yMin;
      this._chart.options.scales.y.max = yMax;
      const { min: xMin, max: xMax } = this._xBounds(datasets);
      this._chart.options.scales.x.min = xMin;
      this._chart.options.scales.x.max = xMax;
      this._chart.update('active');
      this._renderLegend(datasets);
      this._updateStats(datasets);
      this._updateConvergenceTable(datasets);
      return;
    }

    if (this._chart) { this._chart.destroy(); this._chart = null; }
    wrapper.innerHTML = '<canvas id="fitsCanvas"></canvas>';
    const canvas = document.getElementById('fitsCanvas');

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = getCSSColor('--color-border');
    const textColor = getCSSColor('--color-text2');

    this._chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipPlugin(isDark ? 'dark' : 'light'),
            callbacks: {
              title(items) {
                const xVal = items[0]?.parsed.x;
                return `${parseFloat(xVal.toFixed(2))}% of CC12M`;
              },
              label(ctx) {
                const tag = ctx.dataset._isActual ? ' (actual)' : ' (fit)';
                return `  ${ctx.dataset._taskLabel}${tag}: ${ctx.parsed.y.toFixed(4)}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: this._yScale,
            title: {
              display: true,
              text: SCALE_AXIS_LABEL,
              color: textColor,
              font: { size: 11, weight: '500' },
              padding: { top: 8 },
            },
            grid: { color: gridColor },
            ticks: { color: textColor, maxTicksLimit: 8 },
            ...this._xBounds(datasets),
          },
          y: {
            type: this._yScale,
            title: {
              display: true,
              text: METRIC_AXIS_LABEL,
              color: textColor,
              font: { size: 11, weight: '500' },
              padding: { bottom: 8 },
            },
            grid: { color: gridColor },
            ticks: { color: textColor },
            ...this._yBounds(datasets, this._yScale),
          },
        },
      },
    });

    this._renderLegend(datasets);
    this._updateStats(datasets);
    this._updateConvergenceTable(datasets);
  },

  _yBounds(datasets, yScale = 'linear') {
    const allY = datasets
      .filter(ds => !ds._isELine && !ds._isConvergence)
      .flatMap(ds => ds.data.map(d => d.y));
    const eValues = datasets
      .filter(ds => ds._isELine)
      .map(ds => ds.data[0].y);
    const lo = Math.min(...allY, ...eValues);
    const hi = Math.max(...allY);
    if (yScale === 'logarithmic') {
      return { min: lo * 0.9, max: hi * 1.1 };
    }
    const margin = Math.max((hi - lo) * 0.1, 0.1);
    return { min: Math.max(0, lo - margin), max: hi + margin };
  },

  _xBounds(datasets) {
    const allX = datasets.flatMap(ds => ds.data.map(d => d.x));
    if (allX.length === 0) return {};
    const lo = this._xMin ?? Math.min(...allX);
    const hi = this._xMax ?? Math.max(...allX);
    return { min: lo, max: hi };
  },

  _buildDatasets() {
    const datasets = [];
    const maxPct = this._extrapolate ? 150 : 100;

    this._selected.forEach(selKey => {
      const [xi, yi] = selKey.split(':').map(Number);
      const xLabel = X_LABELS[xi];
      const yLabel = Y_LABELS[yi];
      const params = FIT_PARAMS[xLabel]?.[yLabel];
      if (!params) return;

      const color = PALETTE[yi % PALETTE.length];
      const taskLabel = `${xLabel} → ${yLabel}`;
      const xMin = this._xMin;
      const xMax = this._xMax;

      // ── Fitted curve ──────────────────────────────────────────────────────
      const curvePoints = fitCurvePoints(params, maxPct)
        .filter(d => (xMin === null || d.x >= xMin) && (xMax === null || d.x <= xMax));

      if (curvePoints.length > 0) {
        const ds = {
          label: taskLabel,
          _taskLabel: taskLabel,
          _isActual: false,
          _isELine: false,
          data: curvePoints,
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.06),
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 2,
          tension: 0,
          fill: false,
        };
        datasets.push(ds);

        // ── Asymptote E line (dash-dot) ──────────────────────────────────
        const xStart = xMin ?? 0;
        const xEnd = xMax ?? maxPct;
        datasets.push({
          label: `${taskLabel} (E = ${params.E.toFixed(3)})`,
          _taskLabel: taskLabel,
          _isActual: false,
          _isELine: true,
          _isConvergence: false,
          data: [{ x: xStart, y: params.E }, { x: xEnd, y: params.E }],
          borderColor: color,
          backgroundColor: 'transparent',
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 1.5,
          borderDash: [8, 4, 2, 4],
          tension: 0,
          fill: false,
        });

        // ── Convergence marker ────────────────────────────────────────────
        const p = this._convergencePct / 100;
        const dPct = convergenceDpct(params, p);
        const inRange = isFinite(dPct) && dPct <= (xMax ?? maxPct) && dPct >= (xMin ?? 0);
        if (inRange) {
          const dTokens = dPct * N_TOKENS_PER_PCT;
          const yAtD = evalFit(params, dTokens);
          // Vertical drop line from asymptote E up to the curve at D%
          datasets.push({
            label: `${taskLabel} (conv. drop)`,
            _taskLabel: taskLabel,
            _isActual: false,
            _isELine: false,
            _isConvergence: true,
            data: [{ x: dPct, y: params.E }, { x: dPct, y: yAtD }],
            borderColor: color,
            backgroundColor: 'transparent',
            pointRadius: 0,
            pointHoverRadius: 0,
            borderWidth: 1,
            borderDash: [3, 3],
            tension: 0,
            fill: false,
          });
          // Dot on the curve at the convergence point
          datasets.push({
            label: `${taskLabel} (conv. @ ${this._convergencePct}%)`,
            _taskLabel: taskLabel,
            _isActual: false,
            _isELine: false,
            _isConvergence: true,
            data: [{ x: dPct, y: yAtD }],
            borderColor: color,
            backgroundColor: color,
            pointBackgroundColor: color,
            pointBorderColor: '#fff',
            pointRadius: 6,
            pointHoverRadius: 9,
            pointBorderWidth: 2,
            showLine: false,
            fill: false,
          });
        }
      }

      // ── Actual data points overlay ────────────────────────────────────────
      if (this._showActual) {
        const rawData = ACTUAL_DATA[xLabel]?.[yLabel];
        if (rawData) {
          const actualPoints = rawData
            .filter(d => (xMin === null || d.x >= xMin) && (xMax === null || d.x <= xMax))
            .map(d => ({ x: d.x, y: d.y }));

          if (actualPoints.length > 0) {
            datasets.push({
              label: `${taskLabel} (actual)`,
              _taskLabel: taskLabel,
              _isActual: true,
              data: actualPoints,
              borderColor: color,
              backgroundColor: color,
              pointBackgroundColor: '#fff',
              pointBorderColor: color,
              pointRadius: 5,
              pointHoverRadius: 8,
              pointBorderWidth: 2,
              showLine: false,
              fill: false,
            });
          }
        }
      }
    });

    return datasets;
  },

  // ── Legend ─────────────────────────────────────────────────────────────────
  _renderLegend(datasets) {
    const el = document.getElementById('fitsLegend');
    if (!el) return;

    // Deduplicate by task; skip E-line and convergence datasets (not in legend)
    const seen = new Set();
    const entries = [];
    datasets.forEach((ds, i) => {
      if (ds._isELine || ds._isConvergence) return;
      const key = ds._taskLabel;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ ds, i });
      }
    });

    el.innerHTML = entries.map(({ ds, i }) => {
      return `
        <div class="legend-item" data-label="${ds._taskLabel}">
          <svg width="22" height="10" style="flex-shrink:0;vertical-align:middle">
            <line x1="1" y1="5" x2="21" y2="5" stroke="${ds.borderColor}" stroke-width="2.5"
              stroke-linecap="round"/>
            <circle cx="11" cy="5" r="2.5" fill="${ds.borderColor}"/>
          </svg>
          <span>${ds._taskLabel}</span>
        </div>
      `;
    }).join('');

    el.querySelectorAll('.legend-item').forEach(item => {
      item.addEventListener('click', () => {
        const label = item.dataset.label;
        const chart = this._chart;
        if (!chart) return;
        // Determine new hidden state from the primary (non-E-line) curve
        const primaryIdx = chart.data.datasets.findIndex(
          ds => ds._taskLabel === label && !ds._isELine && !ds._isActual
        );
        if (primaryIdx < 0) return;
        const newHidden = !chart.getDatasetMeta(primaryIdx).hidden;
        // Apply to all datasets for this task (curve, E-line, convergence markers)
        chart.data.datasets.forEach((ds, idx) => {
          if (ds._taskLabel === label) {
            chart.getDatasetMeta(idx).hidden = newHidden;
          }
        });
        item.classList.toggle('hidden', newHidden);
        chart.update();
      });
    });
  },

  // ── Stats row ──────────────────────────────────────────────────────────────
  _updateStats(datasets) {
    const el = document.getElementById('fitsStats');
    if (!el) return;
    if (datasets.length === 0) { el.innerHTML = ''; return; }

    const curveDsets = datasets.filter(ds => !ds._isActual && !ds._isELine && !ds._isConvergence);
    if (curveDsets.length === 0) { el.innerHTML = ''; return; }

    const totalFits = Object.values(FIT_PARAMS).reduce((s, ys) => s + Object.keys(ys).length, 0);
    const selectedTasks = new Set(curveDsets.map(ds => ds._taskLabel)).size;

    // Asymptotic loss E for each fitted task
    const taskKeys = [...new Set(curveDsets.map(ds => ds._taskLabel))];
    const asymptotics = taskKeys.map(label => {
      const [xLabel, yLabel] = label.split(' → ');
      return { label, E: FIT_PARAMS[xLabel]?.[yLabel]?.E ?? Infinity };
    });
    const bestAsymptotic = asymptotics.sort((a, b) => a.E - b.E)[0];
    const avgE = asymptotics.reduce((s, t) => s + t.E, 0) / asymptotics.length;

    // Loss at 100% scale per fit
    const lossAt100 = curveDsets.map(ds => ds.data.at(-1)?.y ?? Infinity);
    const minLoss100 = Math.min(...lossAt100);
    const maxLoss100 = Math.max(...lossAt100);

    el.innerHTML = `
      <div class="stat-chip">
        <div class="stat-label">Tasks shown</div>
        <div class="stat-value">${selectedTasks}</div>
        <div class="stat-sub">of ${totalFits} total fits</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">Avg asymptote (E)</div>
        <div class="stat-value">${avgE.toFixed(3)}</div>
        <div class="stat-sub">mean irreducible loss</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">Min loss @ 100%</div>
        <div class="stat-value" style="color:var(--color-success)">${minLoss100.toFixed(3)}</div>
        <div class="stat-sub">best predicted</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">Max loss @ 100%</div>
        <div class="stat-value" style="color:var(--color-danger)">${maxLoss100.toFixed(3)}</div>
        <div class="stat-sub">worst predicted</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">Best asymptote</div>
        <div class="stat-value" style="font-size:13px;font-family:'Inter'">${bestAsymptotic.label}</div>
        <div class="stat-sub">lowest E = ${bestAsymptotic.E.toFixed(3)}</div>
      </div>
    `;
  },

  // ── Empty state ────────────────────────────────────────────────────────────
  _updateEmptyState(isEmpty) {
    const wrapper = document.getElementById('fitsCanvasWrapper');
    const empty = document.getElementById('fitsEmpty');
    if (wrapper) wrapper.style.display = isEmpty ? 'none' : 'block';
    if (empty)   empty.style.display   = isEmpty ? 'flex'  : 'none';
  },

  // ── Convergence table ──────────────────────────────────────────────────────
  _updateConvergenceTable(datasets) {
    const el = document.getElementById('fitsConvergenceTable');
    if (!el) return;

    const p = this._convergencePct / 100;
    const curveDsets = (datasets || []).filter(ds => !ds._isActual && !ds._isELine && !ds._isConvergence);

    if (curveDsets.length === 0) {
      el.innerHTML = '';
      return;
    }

    const rows = curveDsets.map(ds => {
      const [xLabel, yLabel] = ds._taskLabel.split(' → ');
      const params = FIT_PARAMS[xLabel]?.[yLabel];
      if (!params) return null;
      const dPct = convergenceDpct(params, p);
      const dTokens = isFinite(dPct) ? dPct * N_TOKENS_PER_PCT : Infinity;
      const lossAtD = isFinite(dPct) ? evalFit(params, dTokens) : params.E;
      return { taskLabel: ds._taskLabel, color: ds.borderColor, params, dPct, lossAtD };
    }).filter(Boolean);

    rows.sort((a, b) => {
      if (!isFinite(a.dPct) && !isFinite(b.dPct)) return 0;
      if (!isFinite(a.dPct)) return 1;
      if (!isFinite(b.dPct)) return -1;
      return a.dPct - b.dPct;
    });

    const fmtD = d => isFinite(d) ? `${d.toFixed(1)}%` : '∞';
    const fmtTokens = d => {
      if (!isFinite(d)) return '∞';
      const t = d * N_TOKENS_PER_PCT;
      if (t >= 1e12) return `${(t / 1e12).toFixed(2)}T`;
      if (t >= 1e9)  return `${(t / 1e9).toFixed(1)}B`;
      return `${(t / 1e6).toFixed(0)}M`;
    };

    el.innerHTML = `
      <div style="padding:0 20px 20px">
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="color:var(--color-text2);border-bottom:1px solid var(--color-border)">
                <th style="text-align:left;padding:5px 10px 5px 0;font-weight:500">Task (X→Y)</th>
                <th style="text-align:right;padding:5px 8px;font-weight:500">β</th>
                <th style="text-align:right;padding:5px 8px;font-weight:500">E (asymptote)</th>
                <th style="text-align:right;padding:5px 8px;font-weight:500">D% of CC12M</th>
                <th style="text-align:right;padding:5px 8px;font-weight:500">Tokens</th>
                <th style="text-align:right;padding:5px 0 5px 8px;font-weight:500">Loss @ D</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r, i) => `
                <tr style="border-bottom:1px solid var(--color-border);
                           background:${i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--color-border) 30%, transparent)'}">
                  <td style="padding:6px 10px 6px 0;display:flex;align-items:center;gap:7px">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
                                 background:${r.color};flex-shrink:0"></span>
                    <span style="font-family:'JetBrains Mono',monospace;font-size:11px">${r.taskLabel}</span>
                  </td>
                  <td style="text-align:right;padding:6px 8px;font-family:'JetBrains Mono',monospace;color:var(--color-text2)">
                    ${r.params.beta.toFixed(3)}
                  </td>
                  <td style="text-align:right;padding:6px 8px;font-family:'JetBrains Mono',monospace;color:var(--color-success)">
                    ${r.params.E.toFixed(4)}
                  </td>
                  <td style="text-align:right;padding:6px 8px;font-family:'JetBrains Mono',monospace;
                             font-weight:600;color:${!isFinite(r.dPct) ? 'var(--color-danger)' : r.dPct > 100 ? 'var(--color-warning, #fbbf24)' : 'inherit'}">
                    ${fmtD(r.dPct)}
                  </td>
                  <td style="text-align:right;padding:6px 8px;font-family:'JetBrains Mono',monospace;color:var(--color-text2)">
                    ${fmtTokens(r.dPct)}
                  </td>
                  <td style="text-align:right;padding:6px 0 6px 8px;font-family:'JetBrains Mono',monospace">
                    ${r.lossAtD.toFixed(4)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ── Chip selector ──────────────────────────────────────────────────────────
  _renderChips(activeXFilter) {
    const grid = document.getElementById('fitsTaskGrid');
    if (!grid) return;

    const xLabels = activeXFilter ? [activeXFilter] : X_LABELS;
    grid.innerHTML = xLabels.map(xLabel => {
      const xi = X_LABELS.indexOf(xLabel);
      return `
        <div class="task-group-label">${xLabel} →</div>
        <div class="task-chips">
          ${Y_LABELS.map((yLabel, yi) => {
            // Only render chip if fit exists
            if (!FIT_PARAMS[xLabel]?.[yLabel]) return '';
            const key = `${xi}:${yi}`;
            const selected = this._selected.has(key);
            const color = PALETTE[yi % PALETTE.length];
            return `
              <button
                class="task-chip ${selected ? 'selected' : ''}"
                data-key="${key}"
                style="--chip-color:${color}"
                title="${xLabel} → ${yLabel}"
              >
                <span class="chip-dot"></span>
                ${yLabel}
              </button>`;
          }).join('')}
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.task-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.key;
        if (this._selected.has(key)) {
          this._selected.delete(key);
          chip.classList.remove('selected');
        } else {
          this._selected.add(key);
          chip.classList.add('selected');
        }
        this._rebuildChart();
      });
    });
  },

  // ── Event bindings ─────────────────────────────────────────────────────────
  _bindEvents(container) {
    // Axis filter tabs
    container.querySelectorAll('.axis-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.axis-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._activeXFilter = tab.dataset.x || null;
        this._renderChips(this._activeXFilter);
      });
    });

    // Select all / none
    document.getElementById('fitsBtnSelectAll')?.addEventListener('click', () => {
      const xLabels = this._activeXFilter ? [this._activeXFilter] : X_LABELS;
      xLabels.forEach(xLabel => {
        const xi = X_LABELS.indexOf(xLabel);
        Y_LABELS.forEach((yLabel, yi) => {
          if (FIT_PARAMS[xLabel]?.[yLabel]) this._selected.add(`${xi}:${yi}`);
        });
      });
      this._renderChips(this._activeXFilter);
      this._rebuildChart();
    });

    document.getElementById('fitsBtnSelectNone')?.addEventListener('click', () => {
      const xLabels = this._activeXFilter ? [this._activeXFilter] : X_LABELS;
      xLabels.forEach(xLabel => {
        const xi = X_LABELS.indexOf(xLabel);
        Y_LABELS.forEach((_, yi) => this._selected.delete(`${xi}:${yi}`));
      });
      this._renderChips(this._activeXFilter);
      this._rebuildChart();
    });

    // X-scale toggle
    container.querySelectorAll('.xscale-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.xscale-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._yScale = btn.dataset.scale;
        this._rebuildChart();
      });
    });

    // Show actual data toggle
    document.getElementById('fitsShowActual')?.addEventListener('click', e => {
      this._showActual = !this._showActual;
      e.currentTarget.classList.toggle('active', this._showActual);
      this._rebuildChart();
    });

    // Extrapolate toggle
    document.getElementById('fitsExtrapolate')?.addEventListener('click', e => {
      this._extrapolate = !this._extrapolate;
      e.currentTarget.classList.toggle('active', this._extrapolate);
      this._rebuildChart();
    });

    // X range inputs
    const parseRange = val => {
      const n = parseFloat(val);
      return (val === '' || isNaN(n)) ? null : n;
    };
    document.getElementById('fitsXRangeMin')?.addEventListener('change', e => {
      this._xMin = parseRange(e.target.value);
      this._rebuildChart();
    });
    document.getElementById('fitsXRangeMax')?.addEventListener('change', e => {
      this._xMax = parseRange(e.target.value);
      this._rebuildChart();
    });

    // Convergence slider
    const slider = document.getElementById('fitsConvergenceSlider');
    const sliderVal = document.getElementById('fitsConvergenceVal');
    slider?.addEventListener('input', () => {
      this._convergencePct = parseInt(slider.value, 10);
      if (sliderVal) sliderVal.textContent = `${this._convergencePct}%`;
      this._rebuildChart();
    });

    // Download PNG
    document.getElementById('fitsBtnDownload')?.addEventListener('click', () => {
      if (!this._chart) return;
      const link = document.createElement('a');
      link.download = 'scaling-fits.png';
      link.href = this._chart.toBase64Image('image/png', 1.0);
      link.click();
    });

    // Export convergence table as JSON
    document.getElementById('fitsExportJson')?.addEventListener('click', () => {
      const p = this._convergencePct / 100;
      const tasks = [];
      this._selected.forEach(selKey => {
        const [xi, yi] = selKey.split(':').map(Number);
        const xLabel = X_LABELS[xi];
        const yLabel = Y_LABELS[yi];
        const params = FIT_PARAMS[xLabel]?.[yLabel];
        if (!params) return;
        const dPct = convergenceDpct(params, p);
        const dTokens = isFinite(dPct) ? dPct * N_TOKENS_PER_PCT : null;
        tasks.push({
          task: `${xLabel} → ${yLabel}`,
          x: xLabel,
          y: yLabel,
          params: { E: params.E, B: params.B, beta: params.beta, C: params.C },
          convergence_d_pct: isFinite(dPct) ? dPct : null,
          convergence_d_tokens: dTokens,
          loss_at_convergence: dTokens !== null ? evalFit(params, dTokens) : params.E,
        });
      });
      tasks.sort((a, b) => {
        if (a.convergence_d_pct === null) return 1;
        if (b.convergence_d_pct === null) return -1;
        return a.convergence_d_pct - b.convergence_d_pct;
      });
      const payload = {
        convergence_target_pct: this._convergencePct,
        formula: 'L(D) = E + B / (D + C)^beta',
        n_tokens_per_pct: N_TOKENS_PER_PCT,
        tasks,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.download = `scaling-convergence-p${this._convergencePct}.json`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    });

    // Initial chip render
    this._renderChips(null);
  },

  // ── Theme change hook ──────────────────────────────────────────────────────
  onThemeChange() {
    if (this._chart) { this._chart.destroy(); this._chart = null; }
    this._rebuildChart();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
function buildHTML() {
  const totalFits = Object.values(FIT_PARAMS).reduce((s, ys) => s + Object.keys(ys).length, 0);

  const xTabsHtml = ['All', ...X_LABELS].map((label, i) => `
    <button class="axis-tab ${i === 0 ? 'active' : ''}" data-x="${i === 0 ? '' : label}">
      ${label}
    </button>
  `).join('');

  return `
    <div class="section-hero">
      <h2>Scaling Fits</h2>
      <p>
        Fitted scaling laws <strong>L(D) = E + B / (D + C)<sup>β</sup></strong> for
        <strong>${totalFits} cross-modal tasks</strong>
        (${X_LABELS.length} input × ${Y_LABELS.length} output modalities).
        Smooth curves show the fitted function; dots show actual observed losses.
      </p>
    </div>

    <div class="scaling-layout">

      <!-- ── Task selector panel ── -->
      <div class="task-selector-panel">
        <div class="panel-header">
          <span class="panel-title">Task selector</span>
          <div class="panel-actions">
            <button class="btn-xs" id="fitsBtnSelectAll">All</button>
            <button class="btn-xs" id="fitsBtnSelectNone">None</button>
          </div>
        </div>

        <div class="axis-tabs" style="overflow-x:auto; flex-wrap:nowrap;">
          ${xTabsHtml}
        </div>

        <div class="task-grid" id="fitsTaskGrid"></div>
      </div>

      <!-- ── Right column: two stacked panels ── -->
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0">

        <!-- ── Curve chart panel ── -->
        <div class="chart-panel">
          <div class="chart-toolbar">
            <div class="chart-toolbar-left">
              <span class="chart-title">Fitted L(D) = E + B / (D + C)<sup>β</sup></span>
              <div class="btn-group">
                <button class="btn-group-item xscale-btn active" data-scale="linear">Linear</button>
                <button class="btn-group-item xscale-btn" data-scale="logarithmic">Log</button>
              </div>
              <div class="x-range-group">
                <span class="x-range-label">X range</span>
                <input class="x-range-input" id="fitsXRangeMin" type="number" min="0" max="200" step="1" placeholder="min">
                <span class="x-range-sep">–</span>
                <input class="x-range-input" id="fitsXRangeMax" type="number" min="0" max="200" step="1" placeholder="max">
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button class="btn-icon active" id="fitsShowActual">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="3" cy="10" r="2" fill="currentColor"/>
                  <circle cx="7" cy="6" r="2" fill="currentColor"/>
                  <circle cx="11" cy="3" r="2" fill="currentColor"/>
                </svg>
                Actual pts
              </button>
              <button class="btn-icon" id="fitsExtrapolate">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M1 11 Q4 3 8 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>
                  <path d="M8 2 Q10 1.5 12 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="2,1.5" fill="none"/>
                </svg>
                Extrapolate
              </button>
              <button class="btn-icon" id="fitsBtnDownload">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M6.5 1v8M3.5 6.5l3 2.5 3-2.5M2 11h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Export PNG
              </button>
            </div>
          </div>

          <div class="chart-area">
            <div class="chart-canvas-wrapper" id="fitsCanvasWrapper">
              <canvas id="fitsCanvas"></canvas>
            </div>
            <div class="chart-empty" id="fitsEmpty" style="display:none">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path d="M8 38 Q18 10 40 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
                <path d="M8 42h32" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <p>Select tasks from the panel to display their fitted curves.</p>
            </div>
          </div>

          <div class="chart-legend" id="fitsLegend"></div>
          <div class="stats-row" id="fitsStats" style="padding:0 20px 20px"></div>
        </div>

        <!-- ── Data Needed panel ── -->
        <div class="chart-panel">
          <div class="chart-toolbar">
            <div class="chart-toolbar-left" style="flex-wrap:wrap;gap:10px">
              <span class="chart-title">Data Needed for Convergence</span>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:11px;font-weight:500;color:var(--color-text2);white-space:nowrap">
                  Target p
                </span>
                <input id="fitsConvergenceSlider" type="range" min="1" max="99" value="90" step="1"
                  style="width:160px;accent-color:var(--color-accent,#6c8ef5);cursor:pointer">
                <span id="fitsConvergenceVal"
                  style="font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;
                         color:var(--color-accent,#6c8ef5);min-width:32px">90%</span>
              </div>
              <span style="font-size:11px;color:var(--color-text2);opacity:.7">
                min D s.t. (B/C<sup>β</sup> − B/(D+C)<sup>β</sup>) / (B/C<sup>β</sup>) ≥ p
              </span>
            </div>
            <button class="btn-icon" id="fitsExportJson">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2 3h2.5M2 6.5h2.5M2 10h2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                <rect x="5.5" y="1.5" width="6" height="10" rx="1" stroke="currentColor" stroke-width="1.3"/>
                <path d="M7.5 5l1.5 1.5L7.5 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Export JSON
            </button>
          </div>

          <div id="fitsConvergenceTable"></div>
        </div>

      </div><!-- end right column -->

    </div>
  `;
}
