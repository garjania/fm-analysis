/**
 * Scaling Trends Section
 *
 * Shows a multi-line chart for selected x→y modality pairs.
 * Users pick which tasks to display via a task chip selector.
 */

import Chart from 'chart.js/auto';
import { makeDataset, tooltipPlugin, getCSSColor } from '../utils/chartHelpers.js';
import {
  X_LABELS, Y_LABELS, SCALING_DATA, PALETTE, SCALE_AXIS_LABEL, METRIC_AXIS_LABEL,
} from '../data/scalingData.js';

// Default tasks shown on first load (x→y pairs as [xi, yi])
const DEFAULT_SELECTION = [
  [0, 0], [0, 1], [1, 0], [2, 3], [3, 2],
];

// ─────────────────────────────────────────────────────────────────────────────
export const scalingTrendsSection = {
  id: 'scaling-trends',
  title: 'Scaling Trends',
  icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 12 L5 8 L8 9 L11 5 L14 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2 14h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>
  </svg>`,
  badge: `${Object.values(SCALING_DATA).reduce((s, ys) => s + Object.keys(ys).length, 0)} tasks`,

  // ── Render ─────────────────────────────────────────────────────────────────
  render(container) {
    container.innerHTML = buildHTML();
    this._initState();
    this._bindEvents(container);
    this._rebuildChart();
  },

  // ── Internal state ─────────────────────────────────────────────────────────
  _chart: null,
  _selected: new Set(),   // "xi:yi" strings
  _yScale: 'linear',     // 'linear' | 'logarithmic'
  _activeXFilter: null,  // null = show all, or an X_LABEL string

  _initState() {
    this._selected = new Set(DEFAULT_SELECTION.map(([xi, yi]) => `${xi}:${yi}`));
    this._yScale = 'linear';
    this._activeXFilter = null;
  },

  // ── Chart (re)build ────────────────────────────────────────────────────────
  _rebuildChart() {
    const wrapper = document.getElementById('scalingCanvasWrapper');
    if (!wrapper) return;

    const datasets = this._buildDatasets();

    this._updateEmptyState(datasets.length === 0);

    if (datasets.length === 0) {
      if (this._chart) { this._chart.destroy(); this._chart = null; }
      this._renderLegend([]);
      this._updateStats([]);
      return;
    }

    // Update in place when possible — avoids canvas reuse issues and gives
    // smooth animations when toggling individual tasks.
    const scaleUnchanged = this._chart &&
      this._chart.options.scales.y.type === this._yScale;

    if (scaleUnchanged) {
      this._chart.data.datasets = datasets;
      const { min, max } = this._yBounds(datasets, this._yScale);
      this._chart.options.scales.y.min = min;
      this._chart.options.scales.y.max = max;
      this._chart.update('active');
      this._renderLegend(datasets);
      this._updateStats(datasets);
      return;
    }

    // Full recreate (first load or scale type change).
    // Replace the canvas element entirely so Chart.js always gets a
    // fresh context — reusing a destroyed chart's canvas can silently fail.
    if (this._chart) { this._chart.destroy(); this._chart = null; }
    wrapper.innerHTML = '<canvas id="scalingCanvas"></canvas>';
    const canvas = document.getElementById('scalingCanvas');

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
          tooltip: tooltipPlugin(isDark ? 'dark' : 'light'),
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: SCALE_AXIS_LABEL,
              color: textColor,
              font: { size: 11, weight: '500' },
              padding: { top: 8 },
            },
            grid: { color: gridColor },
            ticks: { color: textColor, maxTicksLimit: 8 },
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
  },

  _yBounds(datasets, yScale = 'linear') {
    const allY = datasets.flatMap(ds => ds.data.map(d => d.y));
    const lo = Math.min(...allY);
    const hi = Math.max(...allY);
    if (yScale === 'logarithmic') {
      return { min: lo * 0.9, max: hi * 1.1 };
    }
    const margin = Math.max((hi - lo) * 0.1, 0.1);
    return { min: Math.max(0, lo - margin), max: hi + margin };
  },

  _buildDatasets() {
    const datasets = [];
    this._selected.forEach(key => {
      const [xi, yi] = key.split(':').map(Number);
      const xLabel = X_LABELS[xi];
      const yLabel = Y_LABELS[yi];
      const rawData = SCALING_DATA[xLabel]?.[yLabel];
      if (!rawData) return;

      const color = PALETTE[yi % PALETTE.length];
      datasets.push(makeDataset({
        label: `${xLabel} → ${yLabel}`,
        data: rawData.map(d => ({ x: d.x, y: d.y })),
        color,
      }));
    });
    return datasets;
  },

  // ── Legend ─────────────────────────────────────────────────────────────────
  _renderLegend(datasets) {
    const el = document.getElementById('scalingLegend');
    if (!el) return;
    el.innerHTML = datasets.map((ds, i) => `
      <div class="legend-item" data-index="${i}">
        <div class="legend-swatch" style="background:${ds.borderColor}"></div>
        <span>${ds.label}</span>
      </div>
    `).join('');

    el.querySelectorAll('.legend-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index);
        const meta = this._chart?.getDatasetMeta(idx);
        if (!meta) return;
        meta.hidden = !meta.hidden;
        item.classList.toggle('hidden', meta.hidden);
        this._chart.update();
      });
    });
  },

  // ── Stats row ──────────────────────────────────────────────────────────────
  _updateStats(datasets) {
    const el = document.getElementById('scalingStats');
    if (!el) return;
    if (datasets.length === 0) { el.innerHTML = ''; return; }

    // Aggregate across all visible datasets
    const allY = datasets.flatMap(ds => ds.data.map(d => d.y));
    const avg = allY.reduce((a, b) => a + b, 0) / allY.length;
    const maxY = Math.max(...allY);
    const minY = Math.min(...allY);

    const totalTasks = Object.values(SCALING_DATA).reduce((s, ys) => s + Object.keys(ys).length, 0);

    // Best task = dataset with lowest loss at the last (largest) scale point
    const best = [...datasets].sort((a, b) => {
      const lastA = a.data.at(-1)?.y ?? Infinity;
      const lastB = b.data.at(-1)?.y ?? Infinity;
      return lastA - lastB;
    })[0];

    el.innerHTML = `
      <div class="stat-chip">
        <div class="stat-label">Tasks shown</div>
        <div class="stat-value">${datasets.length}</div>
        <div class="stat-sub">of ${totalTasks} total</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">Avg loss</div>
        <div class="stat-value">${avg.toFixed(2)}</div>
        <div class="stat-sub">across all scales</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">Max loss</div>
        <div class="stat-value" style="color:var(--color-danger)">${maxY.toFixed(2)}</div>
        <div class="stat-sub">max observed</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">Min loss</div>
        <div class="stat-value" style="color:var(--color-success)">${minY.toFixed(2)}</div>
        <div class="stat-sub">min observed</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">Best task</div>
        <div class="stat-value" style="font-size:13px;font-family:'Inter'">${best.label}</div>
        <div class="stat-sub">lowest loss at max scale</div>
      </div>
    `;
  },

  // ── Empty state ────────────────────────────────────────────────────────────
  _updateEmptyState(isEmpty) {
    const wrapper = document.getElementById('scalingCanvasWrapper');
    const empty = document.getElementById('scalingEmpty');
    if (wrapper) wrapper.style.display = isEmpty ? 'none' : 'block';
    if (empty)   empty.style.display   = isEmpty ? 'flex'  : 'none';
  },

  // ── Chip selector ──────────────────────────────────────────────────────────
  _renderChips(activeXFilter) {
    const grid = document.getElementById('taskGrid');
    if (!grid) return;

    const xLabels = activeXFilter ? [activeXFilter] : X_LABELS;
    grid.innerHTML = xLabels.map(xLabel => {
      const xi = X_LABELS.indexOf(xLabel);
      return `
        <div class="task-group-label">${xLabel} →</div>
        <div class="task-chips">
          ${Y_LABELS.map((yLabel, yi) => {
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
    document.getElementById('btnSelectAll')?.addEventListener('click', () => {
      const xLabels = this._activeXFilter ? [this._activeXFilter] : X_LABELS;
      xLabels.forEach(xLabel => {
        const xi = X_LABELS.indexOf(xLabel);
        Y_LABELS.forEach((_, yi) => this._selected.add(`${xi}:${yi}`));
      });
      this._renderChips(this._activeXFilter);
      this._rebuildChart();
    });

    document.getElementById('btnSelectNone')?.addEventListener('click', () => {
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

    // Download PNG
    document.getElementById('btnDownload')?.addEventListener('click', () => {
      if (!this._chart) return;
      const link = document.createElement('a');
      link.download = 'scaling-trends.png';
      link.href = this._chart.toBase64Image('image/png', 1.0);
      link.click();
    });

    // Initial chip render
    this._renderChips(null);
  },

  // ── Theme change hook ──────────────────────────────────────────────────────
  onThemeChange() {
    // Force a full recreate so colors update correctly.
    if (this._chart) { this._chart.destroy(); this._chart = null; }
    this._rebuildChart();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
function buildHTML() {
  const xTabsHtml = ['All', ...X_LABELS].map((label, i) => `
    <button class="axis-tab ${i === 0 ? 'active' : ''}" data-x="${i === 0 ? '' : label}">
      ${label}
    </button>
  `).join('');

  return `
    <div class="section-hero">
      <h2>Scaling Trends</h2>
      <p>
        Explore how cross-task loss scales with data size across
        <strong>${Object.values(SCALING_DATA).reduce((s, ys) => s + Object.keys(ys).length, 0)} cross-modal tasks</strong>
        (${X_LABELS.length} input × ${Y_LABELS.length} output modalities).
        Select any subset of tasks to compare their scaling curves.
      </p>
    </div>

    <div class="scaling-layout">

      <!-- ── Task selector panel ── -->
      <div class="task-selector-panel">
        <div class="panel-header">
          <span class="panel-title">Task selector</span>
          <div class="panel-actions">
            <button class="btn-xs" id="btnSelectAll">All</button>
            <button class="btn-xs" id="btnSelectNone">None</button>
          </div>
        </div>

        <!-- X-axis filter tabs -->
        <div class="axis-tabs" style="overflow-x:auto; flex-wrap:nowrap;">
          ${xTabsHtml}
        </div>

        <!-- Chip grid -->
        <div class="task-grid" id="taskGrid"></div>
      </div>

      <!-- ── Chart panel ── -->
      <div class="chart-panel">
        <div class="chart-toolbar">
          <div class="chart-toolbar-left">
            <span class="chart-title">Cross-Task Loss vs. Data Scale</span>
            <div class="btn-group">
              <button class="btn-group-item xscale-btn active" data-scale="linear">Linear</button>
              <button class="btn-group-item xscale-btn" data-scale="logarithmic">Log</button>
            </div>
          </div>
          <div>
            <button class="btn-icon" id="btnDownload">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v8M3.5 6.5l3 2.5 3-2.5M2 11h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Export PNG
            </button>
          </div>
        </div>

        <div class="chart-area">
          <div class="chart-canvas-wrapper" id="scalingCanvasWrapper">
            <canvas id="scalingCanvas"></canvas>
          </div>
          <div class="chart-empty" id="scalingEmpty" style="display:none">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M8 36 L16 26 L24 28 L32 18 L40 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 40h32" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <p>Select tasks from the panel to display their scaling curves.</p>
          </div>
        </div>

        <!-- Legend -->
        <div class="chart-legend" id="scalingLegend"></div>

        <!-- Stats -->
        <div class="stats-row" id="scalingStats" style="padding:0 20px 20px"></div>
      </div>

    </div>
  `;
}
