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
let supabaseClient = null;
let realtimeChannel = null;

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
  renderWeeklyChart();
  renderHeatmap();
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
   WEEKLY BAR CHART
   =================================================== */

const TECNICO_COLORS = [
  '#6366f1', '#22d3a3', '#f59e0b', '#ec4899', '#a855f7', '#14b8a6', '#f97316'
];

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function renderWeeklyChart() {
  const canvas = document.getElementById('weeklyChart');
  if (!canvas) return;

  const wrap = canvas.parentElement;
  const W = wrap.clientWidth || 800;
  const H = 200;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Build last 7 days (including today)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  // Count jobs per technician per day
  const counts = tecnicos.map(tec => {
    return days.map(day => {
      return trabajos.filter(t => {
        const td = new Date(t.fecha_asignada);
        return t.tecnico_id === tec.id && td.toDateString() === day.toDateString();
      }).length;
    });
  });

  const maxVal = Math.max(...counts.flat(), 1);

  const PAD_LEFT = 36;
  const PAD_RIGHT = 12;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 0;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  const numDays = 7;
  const groupW = chartW / numDays;
  const barW = Math.min((groupW - 8) / Math.max(tecnicos.length, 1), 28);
  const gap = 3;

  // Gridlines
  const gridLines = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridLines; i++) {
    const y = PAD_TOP + chartH - (i / gridLines) * chartH;
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, y);
    ctx.lineTo(W - PAD_RIGHT, y);
    ctx.stroke();
    // Y labels
    const val = Math.round((i / gridLines) * maxVal);
    ctx.fillStyle = 'rgba(148,163,184,0.6)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val, PAD_LEFT - 4, y + 3);
  }

  // Bars
  days.forEach((day, di) => {
    const groupX = PAD_LEFT + di * groupW;
    const totalBars = tecnicos.length;
    const totalBarW = totalBars * barW + (totalBars - 1) * gap;
    const startX = groupX + (groupW - totalBarW) / 2;

    tecnicos.forEach((tec, ti) => {
      const count = counts[ti][di];
      const barH = count > 0 ? Math.max((count / maxVal) * chartH, 4) : 0;
      const x = startX + ti * (barW + gap);
      const y = PAD_TOP + chartH - barH;
      const color = TECNICO_COLORS[ti % TECNICO_COLORS.length];

      // Bar with rounded top
      const r = Math.min(4, barW / 2, barH / 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = count > 0 ? 0.85 : 0.15;
      if (barH > 0) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.arcTo(x + barW, y, x + barW, y + r, r);
        ctx.lineTo(x + barW, y + barH);
        ctx.lineTo(x, y + barH);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
        ctx.fill();

        // Value label on bar
        if (barH > 18 && count > 0) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'white';
          ctx.font = 'bold 10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(count, x + barW / 2, y + 11);
        }
      }
      ctx.globalAlpha = 1;
    });
  });

  // X-axis day labels
  const daysEl = document.getElementById('weeklyDays');
  daysEl.innerHTML = days.map(d => {
    const isToday = d.toDateString() === new Date().toDateString();
    return `<div class="weekly-day-label" style="${isToday ? 'color:var(--blue-light);font-weight:800' : ''}">${DIAS[d.getDay()]}<br><span style="font-size:9px;opacity:0.6">${d.getDate()}/${d.getMonth()+1}</span></div>`;
  }).join('');

  // Legend
  const legendEl = document.getElementById('weeklyLegend');
  legendEl.innerHTML = tecnicos.map((tec, i) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${TECNICO_COLORS[i % TECNICO_COLORS.length]}"></div>
      <span class="legend-label">${escHtml(tec.nombre)}</span>
    </div>
  `).join('');
}

/* ===================================================
   HEATMAP (Día de semana × Hora del día)
   =================================================== */

function renderHeatmap() {
  const grid = document.getElementById('heatmapGrid');
  const yLabels = document.getElementById('heatmapYLabels');
  const xLabels = document.getElementById('heatmapXLabels');
  if (!grid) return;

  // Hours shown: 7am to 9pm (15 cols)
  const startHour = 7;
  const endHour = 21;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  // 0=Sun,1=Mon...6=Sat — reindex to Mon=0...Sun=6
  const reindex = [6, 0, 1, 2, 3, 4, 5];

  // Build 7x(hours) matrix [dayIdx][hourIdx]
  const matrix = Array.from({ length: 7 }, () => Array(hours.length).fill(0));

  trabajos.forEach(t => {
    const d = new Date(t.fecha_asignada);
    const dow = reindex[d.getDay()]; // Mon=0
    const hour = d.getHours();
    const hi = hours.indexOf(hour);
    if (hi >= 0 && dow >= 0) matrix[dow][hi]++;
  });

  const maxVal = Math.max(...matrix.flat(), 1);

  function cellColor(val) {
    if (val === 0) return 'rgba(99,102,241,0.06)';
    const t = val / maxVal;
    // Interpolate: indigo → purple → pink
    const r = Math.round(99 + (236 - 99) * t);
    const g = Math.round(102 + (72 - 102) * t);
    const b = Math.round(241 + (153 - 241) * t);
    return `rgba(${r},${g},${b},${0.3 + t * 0.7})`;
  }

  // Set grid layout
  grid.style.gridTemplateColumns = `repeat(${hours.length}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(7, 1fr)`;

  // Fill grid (row by row = day by day)
  let cells = '';
  for (let day = 0; day < 7; day++) {
    for (let hi = 0; hi < hours.length; hi++) {
      const val = matrix[day][hi];
      const h = hours[hi];
      const ampm = h >= 12 ? (h === 12 ? '12pm' : `${h-12}pm`) : `${h}am`;
      const tooltip = `${dayNames[day]} ${ampm}: ${val} trabajo${val !== 1 ? 's' : ''}`;
      cells += `<div class="heatmap-cell" style="background:${cellColor(val)}" data-tooltip="${tooltip}"></div>`;
    }
  }
  grid.innerHTML = cells;

  // Y labels
  yLabels.innerHTML = dayNames.map(d => `<div class="heatmap-ylabel">${d}</div>`).join('');

  // X labels (show every 2 hours)
  xLabels.innerHTML = hours.map((h, i) => {
    const label = i % 2 === 0 ? (h >= 12 ? `${h===12?12:h-12}pm` : `${h}am`) : '';
    return `<div class="heatmap-xlabel">${label}</div>`;
  }).join('');
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
   SUPABASE REALTIME
   =================================================== */

function setupRealtime() {
  try {
    if (!window.supabase) return;
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    setRealtimeStatus('connecting');

    realtimeChannel = supabaseClient
      .channel('db-trabajos')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trabajos'
      }, (payload) => {
        // Update local data based on event
        if (payload.eventType === 'INSERT') {
          trabajos.unshift(payload.new);
        } else if (payload.eventType === 'UPDATE') {
          const idx = trabajos.findIndex(t => t.id === payload.new.id);
          if (idx >= 0) trabajos[idx] = payload.new;
          else trabajos.unshift(payload.new);
        } else if (payload.eventType === 'DELETE') {
          trabajos = trabajos.filter(t => t.id !== payload.old.id);
        }

        // Re-render everything
        updateQuickStats();
        renderRecentList();
        if (currentSection === 'dashboard') renderDashboard();
        if (currentSection === 'trabajos') renderTablaTrabajos();

        // Flash realtime indicator
        flashRealtimePulse();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('error');
        }
      });
  } catch (err) {
    console.warn('Realtime no disponible:', err);
    setRealtimeStatus('error');
  }
}

function setRealtimeStatus(status) {
  const dot = document.querySelector('.realtime-dot');
  const label = document.getElementById('realtimeStatus');
  if (!dot || !label) return;

  dot.className = `realtime-dot ${status}`;
  const texts = {
    connecting: 'Conectando...',
    connected: 'Tiempo real ⚡',
    error: 'Sin realtime'
  };
  label.textContent = texts[status] || status;
}

function flashRealtimePulse() {
  const el = document.getElementById('realtimePulse');
  if (!el) return;
  el.classList.remove('hidden');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.add('hidden'), 2500);
}

/* ===================================================
   AUTO REFRESH
   =================================================== */

// Refresh every 30 seconds as fallback
setInterval(() => {
  cargarTrabajos();
}, 30000);

/* ===================================================
   INIT
   =================================================== */

document.addEventListener('DOMContentLoaded', () => {
  cargarDatos();
  setupRealtime();

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

/* ===================================================
   CHAT WIDGET
   =================================================== */

const CHAT_WEBHOOK_URL = 'https://onyapitesting.app.n8n.cloud/webhook/chat-agent';

// Generate unique session ID for this browser tab
const CHAT_SESSION_ID = 'session_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now();

let chatOpen = false;
let chatIsTyping = false;

function toggleChat() {
  chatOpen = !chatOpen;
  const win = document.getElementById('chatWindow');
  const icon = document.getElementById('chatBtnIcon');

  if (chatOpen) {
    win.classList.remove('chat-window-hidden');
    icon.textContent = '✕';
    // Focus input
    setTimeout(() => document.getElementById('chatInput')?.focus(), 350);
    // Hide notification dot
    document.getElementById('chatDot').classList.add('hidden');
  } else {
    win.classList.add('chat-window-hidden');
    icon.textContent = '💬';
  }
}

function appendMessage(role, text) {
  const container = document.getElementById('chatMessages');
  const isBot = role === 'bot';

  const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  const div = document.createElement('div');
  div.className = `chat-msg ${isBot ? 'chat-msg-bot' : 'chat-msg-user'}`;

  if (isBot) {
    div.innerHTML = `
      <div class="chat-msg-avatar">⚡</div>
      <div>
        <div class="chat-msg-bubble">${formatChatText(text)}</div>
        <div class="chat-msg-time">${now}</div>
      </div>
    `;
  } else {
    div.innerHTML = `
      <div>
        <div class="chat-msg-bubble">${escHtml(text)}</div>
        <div class="chat-msg-time" style="text-align:right">${now}</div>
      </div>
    `;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function formatChatText(text) {
  // Convert markdown-like formatting to HTML
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function showTyping(show) {
  const el = document.getElementById('chatTyping');
  const container = document.getElementById('chatMessages');
  if (show) {
    el.classList.remove('hidden');
    container.scrollTop = container.scrollHeight;
  } else {
    el.classList.add('hidden');
  }
  chatIsTyping = show;
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const message = input.value.trim();

  if (!message || chatIsTyping) return;

  // Clear input
  input.value = '';
  sendBtn.disabled = true;

  // Show user message
  appendMessage('user', message);

  // Show typing indicator
  showTyping(true);

  try {
    const res = await fetch(CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        session_id: CHAT_SESSION_ID
      })
    });

    showTyping(false);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    // Try different response field names
    const reply = data.response || data.output || data.text || data.answer || data.message
      || (Array.isArray(data) && data[0]?.response)
      || 'Lo siento, no pude procesar tu mensaje en este momento.';

    appendMessage('bot', reply);

  } catch (err) {
    showTyping(false);
    console.error('Chat error:', err);
    appendMessage('bot', '⚠️ Hubo un problema al conectar con el asistente. Por favor intenta de nuevo en un momento.');
  } finally {
    sendBtn.disabled = false;
    input.focus();

    // Show notification dot if chat is closed
    if (!chatOpen) {
      document.getElementById('chatDot').classList.remove('hidden');
    }
  }
}
