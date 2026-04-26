/* ===================================================
   TALLERPRO — APP.JS
   Gestión de trabajos connected to Supabase + n8n
   =================================================== */

const SUPABASE_URL = 'https://mttgmodjxysgppdfxshh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10dGdtb2RqeHlzZ3BwZGZ4c2hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzE2MDk1OSwiZXhwIjoyMDkyNzM2OTU5fQ.Js_jJFjkrIlXDH2EUi8hNFmunYaCDD8W-YwmrJtfWho';
const WEBHOOK_URL = 'https://onyapitesting.app.n8n.cloud/webhook/asignar-trabajo';

// Global state
let tecnicos = [];
let trabajos = [];
let currentSection = 'asignar';

/* ===================================================
   SUPABASE FETCH HELPER
   =================================================== */

async function supabaseFetch(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const defaultHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch (err) {
    console.error('Supabase error:', err);
    throw err;
  }
}

/* ===================================================
   NAVIGATION
   =================================================== */

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const section = document.getElementById(`section-${name}`);
  const navBtn = document.getElementById(`nav-${name}`);

  if (section) section.classList.add('active');
  if (navBtn) navBtn.classList.add('active');

  currentSection = name;

  // Close mobile sidebar
  closeMobileSidebar();

  // Refresh data per section
  if (name === 'dashboard') renderDashboard();
  if (name === 'trabajos') renderTablaTrabajos();
}

function toggleMobileSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

/* ===================================================
   LOAD DATA
   =================================================== */

async function cargarTecnicos() {
  try {
    tecnicos = await supabaseFetch('tecnicos?select=*&order=nombre.asc');
    const select = document.getElementById('tecnico_id');
    const filterSelect = document.getElementById('filterTecnico');

    select.innerHTML = '<option value="">— Selecciona un técnico —</option>';
    filterSelect.innerHTML = '<option value="">Todos</option>';

    tecnicos.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.nombre}${t.telegram_id ? ' ✓ Telegram' : ' (sin Telegram)'}`;
      select.appendChild(opt);

      const fOpt = opt.cloneNode(true);
      fOpt.textContent = t.nombre;
      filterSelect.appendChild(fOpt);
    });
  } catch (err) {
    showToast('No se pudieron cargar los técnicos', 'error');
  }
}

async function cargarTrabajos() {
  try {
    trabajos = await supabaseFetch('trabajos?select=*&order=id.desc&limit=100');
    updateQuickStats();
    renderRecentList();
    if (currentSection === 'dashboard') renderDashboard();
    if (currentSection === 'trabajos') renderTablaTrabajos();
  } catch (err) {
    showToast('Error al cargar los trabajos', 'error');
  }
}

async function cargarDatos() {
  await Promise.all([cargarTecnicos(), cargarTrabajos()]);
}

/* ===================================================
   QUICK STATS
   =================================================== */

function updateQuickStats() {
  const total = trabajos.length;
  const pendiente = trabajos.filter(t => t.estado === 'pendiente').length;
  const progreso = trabajos.filter(t => t.estado === 'en_progreso').length;
  const completado = trabajos.filter(t => t.estado === 'completado').length;

  animateCounter('stat-total', total);
  animateCounter('stat-pendiente', pendiente);
  animateCounter('stat-progreso', progreso);
  animateCounter('stat-completado', completado);

  animateCounter('kpi-total', total);
  animateCounter('kpi-pendientes', pendiente);
  animateCounter('kpi-progreso', progreso);
  animateCounter('kpi-completados', completado);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duration = 600;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

/* ===================================================
   RECENT LIST
   =================================================== */

function renderRecentList() {
  const container = document.getElementById('recentList');
  const recent = trabajos.slice(0, 8);

  if (recent.length === 0) {
    container.innerHTML = '<p class="loading-pulse">Sin trabajos aún</p>';
    return;
  }

  container.innerHTML = recent.map(t => {
    const tecnico = tecnicos.find(tc => tc.id === t.tecnico_id);
    const nombre = tecnico ? tecnico.nombre : `#${t.tecnico_id}`;
    const date = new Date(t.fecha_asignada);
    const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="recent-item">
        <div class="recent-item-main">
          <div class="recent-item-cliente">${escHtml(t.cliente)}</div>
          <div class="recent-item-equipo">${escHtml(t.equipo)} · ${nombre} · ${timeStr}</div>
        </div>
        ${badgeHtml(t.estado)}
      </div>
    `;
  }).join('');
}

/* ===================================================
   DASHBOARD
   =================================================== */

function renderDashboard() {
  renderTecnicoPerformance();
  renderDonutChart();
  renderTimeAnalysis();
}

function renderTecnicoPerformance() {
  const container = document.getElementById('tecnicoPerformance');
  if (!tecnicos.length || !trabajos.length) {
    container.innerHTML = '<p class="loading-pulse">Cargando...</p>';
    return;
  }

  const maxTotal = Math.max(...tecnicos.map(t => trabajos.filter(w => w.tecnico_id === t.id).length), 1);

  container.innerHTML = tecnicos.map((tecnico, idx) => {
    const misTrabajos = trabajos.filter(w => w.tecnico_id === tecnico.id);
    const completados = misTrabajos.filter(w => w.estado === 'completado').length;
    const pendientes = misTrabajos.filter(w => w.estado === 'pendiente').length;
    const progreso = misTrabajos.filter(w => w.estado === 'en_progreso').length;
    const total = misTrabajos.length;
    const pct = total > 0 ? Math.round((completados / total) * 100) : 0;
    const barWidth = total > 0 ? Math.round((total / maxTotal) * 100) : 0;
    const initials = tecnico.nombre.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    return `
      <div class="perf-item" style="animation-delay: ${idx * 0.1}s">
        <div class="perf-item-header">
          <div class="perf-name">
            <div class="perf-avatar">${initials}</div>
            ${escHtml(tecnico.nombre)}
          </div>
          <span style="font-size:12px; color: var(--text-muted); font-weight:600">${pct}% completado</span>
        </div>
        <div class="perf-stats-row">
          <span>Total: <b style="color:var(--text-primary)">${total}</b></span>
          <span>·</span>
          <span style="color:var(--green)">✓ ${completados}</span>
          <span>·</span>
          <span style="color:var(--blue-light)">⚡ ${progreso}</span>
          <span>·</span>
          <span style="color:var(--yellow)">⏳ ${pendientes}</span>
        </div>
        <div class="perf-bar-wrap">
          <div class="perf-bar" style="width: 0%" data-target="${barWidth}"></div>
        </div>
      </div>
    `;
  }).join('');

  // Animate bars
  setTimeout(() => {
    document.querySelectorAll('.perf-bar').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  }, 100);
}

function renderDonutChart() {
  const canvas = document.getElementById('donutChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const pendiente = trabajos.filter(t => t.estado === 'pendiente').length;
  const progreso = trabajos.filter(t => t.estado === 'en_progreso').length;
  const completado = trabajos.filter(t => t.estado === 'completado').length;
  const total = pendiente + progreso + completado;

  const data = [
    { label: 'Completados', value: completado, color: '#22d3a3' },
    { label: 'En Progreso', value: progreso, color: '#818cf8' },
    { label: 'Pendientes', value: pendiente, color: '#f59e0b' }
  ];

  const W = 220;
  const H = 220;
  const cx = W / 2;
  const cy = H / 2;
  const outerR = 85;
  const innerR = 52;

  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = outerR - innerR;
    ctx.stroke();
  } else {
    let startAngle = -Math.PI / 2;
    data.forEach(seg => {
      if (seg.value === 0) return;
      const sliceAngle = (seg.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Inner hole
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = '#080c14';
    ctx.fill();

    // Center text
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy - 8);
    ctx.fillStyle = '#475569';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText('trabajos', cx, cy + 14);
  }

  // Legend
  const legend = document.getElementById('chartLegend');
  legend.innerHTML = data.map(d => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${d.color}"></div>
      <span class="legend-val">${d.value}</span>
      <span class="legend-label">${d.label}</span>
    </div>
  `).join('');
}

function renderTimeAnalysis() {
  const container = document.getElementById('timeGrid');

  const completados = trabajos.filter(t => t.estado === 'completado' && t.fecha_inicio && t.fecha_fin);

  let avgTime = '—';
  let minTime = '—';
  let maxTime = '—';
  let totalHoy = 0;

  if (completados.length > 0) {
    const times = completados.map(t => {
      const diff = new Date(t.fecha_fin) - new Date(t.fecha_inicio);
      return diff / 60000; // minutes
    });

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    avgTime = formatMinutes(avg);
    minTime = formatMinutes(min);
    maxTime = formatMinutes(max);
  }

  const today = new Date().toDateString();
  totalHoy = trabajos.filter(t => {
    const d = new Date(t.fecha_asignada);
    return d.toDateString() === today;
  }).length;

  const tasaCompletado = trabajos.length > 0
    ? Math.round((trabajos.filter(t => t.estado === 'completado').length / trabajos.length) * 100)
    : 0;

  container.innerHTML = `
    <div class="time-stat">
      <span class="time-stat-val">${avgTime}</span>
      <span class="time-stat-label">Tiempo promedio por trabajo</span>
    </div>
    <div class="time-stat">
      <span class="time-stat-val" style="color: var(--green)">${minTime}</span>
      <span class="time-stat-label">Tiempo más rápido</span>
    </div>
    <div class="time-stat">
      <span class="time-stat-val" style="color: var(--yellow)">${maxTime}</span>
      <span class="time-stat-label">Tiempo más largo</span>
    </div>
    <div class="time-stat">
      <span class="time-stat-val" style="color: var(--blue-light)">${totalHoy}</span>
      <span class="time-stat-label">Trabajos hoy</span>
    </div>
    <div class="time-stat">
      <span class="time-stat-val" style="color: var(--purple)">${completados.length}</span>
      <span class="time-stat-label">Con tiempo registrado</span>
    </div>
    <div class="time-stat">
      <span class="time-stat-val">${tasaCompletado}%</span>
      <span class="time-stat-label">Tasa de completado</span>
    </div>
  `;
}

function formatMinutes(mins) {
  if (!isFinite(mins) || isNaN(mins)) return '—';
  const m = Math.round(mins);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

/* ===================================================
   TABLE
   =================================================== */

function filtrarTrabajos() {
  const estadoFilter = document.getElementById('filterEstado').value;
  const tecnicoFilter = document.getElementById('filterTecnico').value;
  const searchFilter = document.getElementById('filterSearch').value.toLowerCase();

  const filtered = trabajos.filter(t => {
    if (estadoFilter && t.estado !== estadoFilter) return false;
    if (tecnicoFilter && String(t.tecnico_id) !== tecnicoFilter) return false;
    if (searchFilter) {
      const haystack = `${t.cliente} ${t.equipo} ${t.descripcion}`.toLowerCase();
      if (!haystack.includes(searchFilter)) return false;
    }
    return true;
  });

  renderTablaBody(filtered);
}

function renderTablaTrabajos() {
  filtrarTrabajos();
}

function renderTablaBody(items) {
  const body = document.getElementById('tablaBody');

  if (items.length === 0) {
    body.innerHTML = '<tr><td colspan="7" class="table-empty">🔍 Sin resultados</td></tr>';
    return;
  }

  body.innerHTML = items.map(t => {
    const tecnico = tecnicos.find(tc => tc.id === t.tecnico_id);
    const nombreTecnico = tecnico ? tecnico.nombre : `ID ${t.tecnico_id}`;
    const fechaAsignada = formatFecha(t.fecha_asignada);

    let tiempoStr = '—';
    if (t.fecha_inicio && t.fecha_fin) {
      const mins = (new Date(t.fecha_fin) - new Date(t.fecha_inicio)) / 60000;
      tiempoStr = formatMinutes(mins);
    } else if (t.estado === 'en_progreso' && t.fecha_inicio) {
      const mins = (Date.now() - new Date(t.fecha_inicio)) / 60000;
      tiempoStr = `⚡ ${formatMinutes(mins)}`;
    }

    return `
      <tr>
        <td class="td-id">#${t.id}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="perf-avatar" style="width:26px;height:26px;font-size:11px">${initials(nombreTecnico)}</div>
            <span class="td-name">${escHtml(nombreTecnico)}</span>
          </div>
        </td>
        <td class="td-name">${escHtml(t.cliente)}</td>
        <td>${escHtml(t.equipo)}</td>
        <td>${badgeHtml(t.estado)}</td>
        <td>${fechaAsignada}</td>
        <td class="td-time">${tiempoStr}</td>
      </tr>
    `;
  }).join('');
}

function formatFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ===================================================
   FORM — ENVIAR TRABAJO
   =================================================== */

async function enviarTrabajo(e) {
  e.preventDefault();

  const tecnico_id = parseInt(document.getElementById('tecnico_id').value);
  const cliente = document.getElementById('cliente').value.trim();
  const equipo = document.getElementById('equipo').value.trim();
  const descripcion = document.getElementById('descripcion').value.trim();

  if (!tecnico_id || !cliente || !equipo || !descripcion) {
    showToast('Por favor, completa todos los campos', 'error');
    return;
  }

  const tecnicoSeleccionado = tecnicos.find(t => t.id === tecnico_id);
  if (tecnicoSeleccionado && !tecnicoSeleccionado.telegram_id) {
    showToast(`⚠️ ${tecnicoSeleccionado.nombre} no tiene Telegram configurado`, 'info');
  }

  setLoading(true);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tecnico_id, cliente, equipo, descripcion })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    showToast(`✅ Trabajo enviado a ${tecnicoSeleccionado ? tecnicoSeleccionado.nombre : 'técnico'} por Telegram`, 'success');
    limpiarFormulario();

    // Refresh data after a brief delay
    setTimeout(() => cargarTrabajos(), 1500);

  } catch (err) {
    console.error(err);
    showToast('❌ Error al enviar. Verifica el webhook de n8n', 'error');
  } finally {
    setLoading(false);
  }
}

function limpiarFormulario() {
  document.getElementById('formAsignar').reset();
}

function setLoading(loading) {
  const btn = document.getElementById('btnEnviar');
  const text = btn.querySelector('.btn-text');
  const loader = document.getElementById('btnLoader');

  btn.disabled = loading;
  text.style.display = loading ? 'none' : 'flex';
  loader.classList.toggle('hidden', !loading);

  if (loading) {
    btn.style.opacity = '0.8';
  } else {
    btn.style.opacity = '1';
  }
}

/* ===================================================
   TOAST NOTIFICATIONS
   =================================================== */

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ===================================================
   HTML HELPERS
   =================================================== */

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgeHtml(estado) {
  const labels = {
    pendiente: '⏳ Pendiente',
    en_progreso: '⚡ En Progreso',
    completado: '✅ Completado'
  };
  return `<span class="badge badge-${estado || 'pendiente'}">${labels[estado] || estado}</span>`;
}

function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

/* ===================================================
   AUTO REFRESH
   =================================================== */

// Refresh every 30 seconds
setInterval(() => {
  cargarTrabajos();
}, 30000);

/* ===================================================
   INIT
   =================================================== */

document.addEventListener('DOMContentLoaded', () => {
  cargarDatos();

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('menuToggle');
    if (
      window.innerWidth <= 768 &&
      sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      !toggle.contains(e.target)
    ) {
      closeMobileSidebar();
    }
  });
});
