/**
 * App entry point
 *
 * Responsibilities:
 *  - Sidebar rendering from SECTIONS registry
 *  - Section routing (single-page navigation)
 *  - Theme toggle (dark / light)
 *  - Mobile sidebar
 */

import { SECTIONS } from './registry.js';
import { applyChartDefaults } from './utils/chartHelpers.js';
import Chart from 'chart.js/auto';

// ── Theme ─────────────────────────────────────────────────────────────────────
function initTheme() {
  const stored = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', stored);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  applyChartDefaults(Chart);
  // Notify all sections
  SECTIONS.forEach(s => s.onThemeChange?.());
}

// ── Sidebar nav ───────────────────────────────────────────────────────────────
function buildSidebar(activeId) {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;

  nav.innerHTML = `
    <div class="nav-section-title">Experiments</div>
    ${SECTIONS.map(s => `
      <button
        class="nav-item ${s.id === activeId ? 'active' : ''}"
        data-section="${s.id}"
        title="${s.title}"
      >
        ${s.icon}
        <span class="nav-label">${s.title}</span>
        ${s.badge ? `<span class="nav-badge">${s.badge}</span>` : ''}
      </button>
    `).join('')}
  `;

  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.section));
  });
}

// ── Routing ───────────────────────────────────────────────────────────────────
let _currentSection = null;

function navigateTo(id) {
  const section = SECTIONS.find(s => s.id === id);
  if (!section) return;

  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === id);
  });

  // Update page title
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = section.title;

  // Render section into content
  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `<div class="section-wrapper active" id="section-${id}"></div>`;
  const container = document.getElementById(`section-${id}`);
  section.render(container);

  _currentSection = section;

  // Close mobile sidebar
  closeMobileSidebar();

  // Persist
  localStorage.setItem('activeSection', id);
}

// ── Sidebar collapse ──────────────────────────────────────────────────────────
function initSidebarCollapse() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sidebarToggle');
  if (!sidebar || !btn) return;

  const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (collapsed) sidebar.classList.add('collapsed');

  btn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
  });
}

// ── Mobile sidebar ────────────────────────────────────────────────────────────
function initMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const mobileBtn = document.getElementById('mobileMenuBtn');

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id = 'sidebarOverlay';
  document.body.appendChild(overlay);

  mobileBtn?.addEventListener('click', () => {
    sidebar?.classList.add('mobile-open');
    overlay.classList.add('visible');
  });

  overlay.addEventListener('click', closeMobileSidebar);
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebarOverlay')?.classList.remove('visible');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
function boot() {
  initTheme();
  applyChartDefaults(Chart);

  const stored = localStorage.getItem('activeSection');
  const defaultId = SECTIONS[0]?.id;
  const startId = SECTIONS.find(s => s.id === stored) ? stored : defaultId;

  buildSidebar(startId);
  initSidebarCollapse();
  initMobileSidebar();

  // Theme toggle
  document.getElementById('themeToggle')
    ?.addEventListener('click', toggleTheme);

  navigateTo(startId);
}

boot();
