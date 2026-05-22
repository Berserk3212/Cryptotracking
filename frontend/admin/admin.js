//Панель администратора — основной скрипт



const SUPABASE_URL     = 'https://yvliktxpfglofdgvxrcl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bGlrdHhwZmdsb2ZkZ3Z4cmNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDcyOTcsImV4cCI6MjA3NjcyMzI5N30.gJWKm8rZYDu-x4vdKIA4HJ8PZo_JcqBTpttseJCpDJU';

const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


const state = {
  currentSection: 'dashboard',
  currentUser:    null,
  adminProfile:   null,

  users:   { data: [], page: 1, pageSize: 20, total: 0, filter: 'all', search: '' },
  logs:    { data: [], page: 1, pageSize: 30, total: 0, search: '', action: '', from: '', to: '' },
  events:  { data: [], filter: 'all', openOnly: true },

  selectedUsers: new Set(),
  pendingBlockUserId: null,

  settings: {},
  healthCache: {},

  charts: {},
};

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
async function init() {
  const screen = document.getElementById('adminLoadingScreen');

  // ── 1. Проверяем сессию ──
  let session;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    session = data.session;
  } catch (err) {
    showInitError('Ошибка подключения к Supabase', err.message, false);
    return;
  }

  if (!session) {
    return redirectLogin();
  }

  // ── 2. Загружаем профиль ──
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, role')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profileError) {
    // Скорее всего: не применена SQL-миграция или RLS-ошибка
    const isColumnMissing = profileError.message?.includes('column') &&
                            profileError.message?.includes('role');
    showInitError(
      isColumnMissing
        ? 'SQL-миграция не применена'
        : 'Ошибка загрузки профиля',
      profileError.message,
      true,
      session.user.email
    );
    return;
  }

  if (!profile) {
    showInitError(
      'Профиль не найден',
      `В таблице profiles нет записи для ${session.user.email}. Войдите через основное приложение.`,
      false
    );
    return;
  }

  if (profile.role !== 'admin') {
    showInitError(
      'Нет прав администратора',
      `Ваша роль: «${profile.role || 'user'}». Назначьте role = 'admin' в Supabase SQL Editor.`,
      true,
      session.user.email,
      session.user.id
    );
    return;
  }

  // ── 3. Успех ──
  state.currentUser  = session.user;
  state.adminProfile = profile;

  renderAdminUser(profile);
  setupEventListeners();
  showApp();
  loadSection('dashboard');
  startClock();
}

function redirectLogin() {
  window.location.href = '../login.html';
}

/**
 * showInitError — показывает экран с диагностикой вместо белого экрана
 */
function showInitError(title, detail, showSqlHint, email, userId) {
  const sqlBlock = showSqlHint ? `
    <div style="margin:16px 0;text-align:left;background:#0f172a;border:1px solid rgba(255,255,255,0.1);
                border-radius:10px;padding:14px;max-width:520px;">
      <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">
        SQL Editor → New Query → Run
      </div>
      <pre style="color:#e2e8f0;font-size:12px;white-space:pre-wrap;font-family:monospace;">-- Шаг 1: запустите SQL/admin_fix.sql из проекта
-- Шаг 2: назначьте роль администратора:
UPDATE public.profiles
SET role = 'admin'
WHERE email = '${email || 'ваш@email.com'}';${userId ? `\n-- или по ID:\nUPDATE public.profiles SET role = 'admin' WHERE id = '${userId}';` : ''}</pre>
    </div>` : '';

  document.getElementById('adminLoadingScreen').innerHTML = `
    <div style="text-align:center;padding:32px;max-width:600px;margin:0 auto;">
      <div style="width:60px;height:60px;border-radius:16px;background:rgba(239,68,68,0.15);
                  border:1px solid rgba(239,68,68,0.3);display:flex;align-items:center;
                  justify-content:center;font-size:28px;color:#ef4444;margin:0 auto 16px;">
        <i class="bi bi-exclamation-triangle-fill"></i>
      </div>
      <h2 style="color:#ef4444;margin-bottom:8px;font-size:18px;">${escHtml(title)}</h2>
      <p style="color:#94a3b8;margin-bottom:4px;font-size:13.5px;">${escHtml(detail)}</p>
      ${sqlBlock}
      <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap;">
        <button onclick="location.reload()"
          style="padding:8px 20px;border-radius:8px;background:#3b82f6;color:#fff;border:none;
                 cursor:pointer;font-size:13px;">
          <i class="bi bi-arrow-clockwise"></i> Повторить
        </button>
        <a href="../crypto/cryptotracking.html"
          style="padding:8px 20px;border-radius:8px;background:rgba(255,255,255,0.07);
                 color:#e2e8f0;border:1px solid rgba(255,255,255,0.1);font-size:13px;">
          ← Приложение
        </a>
        <a href="../login.html"
          style="padding:8px 20px;border-radius:8px;background:rgba(255,255,255,0.07);
                 color:#e2e8f0;border:1px solid rgba(255,255,255,0.1);font-size:13px;">
          <i class="bi bi-box-arrow-in-right"></i> Другой аккаунт
        </a>
      </div>
    </div>`;
}

function showApp() {
  document.getElementById('adminLoadingScreen').style.display = 'none';
  document.getElementById('adminApp').style.display = 'flex';
}

function renderAdminUser(profile) {
  const name = profile.full_name || profile.email || 'Администратор';
  document.getElementById('adminUserName').textContent = name;
  document.getElementById('adminAvatar').textContent   = name[0].toUpperCase();
}


// ОБРАБОТЧИКИ СОБЫТИЙ

function setupEventListeners() {
  // Навигация по боковой панели
  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => loadSection(item.dataset.section));
  });
  // Кнопки-ссылки в карточках
  document.querySelectorAll('.btn-link[data-section]').forEach(btn => {
    btn.addEventListener('click', () => loadSection(btn.dataset.section));
  });

  // Переключатель боковой панели
  document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
  document.getElementById('mobileMenuBtn').addEventListener('click', toggleMobileSidebar);

  // Верхняя панель
  document.getElementById('refreshPageBtn').addEventListener('click', () => loadSection(state.currentSection));
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
  document.getElementById('adminLogoutBtn').addEventListener('click', handleLogout);

  // Users section
  document.getElementById('usersSearch').addEventListener('input', debounce(e => {
    state.users.search = e.target.value.trim();
    state.users.page   = 1;
    loadUsersTable();
  }, 300));
  document.querySelectorAll('.filter-chips .chip[data-filter]').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.filter-chips .chip[data-filter]').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      state.users.filter = c.dataset.filter;
      state.users.page   = 1;
      loadUsersTable();
    });
  });
  document.getElementById('selectAllUsers').addEventListener('change', toggleSelectAll);
  document.getElementById('exportUsersBtn').addEventListener('click', exportUsersCSV);
  document.getElementById('bulkBlockBtn').addEventListener('click',   () => bulkAction('block'));
  document.getElementById('bulkUnblockBtn').addEventListener('click', () => bulkAction('unblock'));
  document.getElementById('bulkCancelBtn').addEventListener('click',  clearSelection);

  // Logs
  document.getElementById('logsSearch').addEventListener('input', debounce(e => {
    state.logs.search = e.target.value.trim();
    state.logs.page   = 1;
    loadLogsTable();
  }, 300));
  document.getElementById('logsActionFilter').addEventListener('change', e => {
    state.logs.action = e.target.value;
    state.logs.page   = 1;
    loadLogsTable();
  });
  document.getElementById('logsDateFrom').addEventListener('change', e => {
    state.logs.from = e.target.value;
    state.logs.page = 1;
    loadLogsTable();
  });
  document.getElementById('logsDateTo').addEventListener('change', e => {
    state.logs.to   = e.target.value;
    state.logs.page = 1;
    loadLogsTable();
  });
  document.getElementById('exportLogsBtn').addEventListener('click', exportLogsCSV);

  // Events
  document.querySelectorAll('[data-level]').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('[data-level]').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      state.events.filter = c.dataset.level;
      loadEventsTable();
    });
  });
  document.getElementById('showOpenOnly').addEventListener('change', e => {
    state.events.openOnly = e.target.checked;
    loadEventsTable();
  });
  document.getElementById('resolveAllBtn').addEventListener('click', resolveAllEvents);
  document.getElementById('addTestEventBtn').addEventListener('click', addTestEvent);

  // Monitoring
  document.getElementById('runHealthCheckBtn').addEventListener('click', runHealthCheck);

  // Settings
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('reloadSettingsBtn').addEventListener('click', loadSettings);
  document.getElementById('settingMaintenanceMode').addEventListener('change', e => {
    document.getElementById('maintenanceMsgRow').style.display = e.target.checked ? 'flex' : 'none';
  });

  // Modal
  document.getElementById('userModalClose').addEventListener('click',       closeUserModal);
  document.getElementById('userModalCloseBottom').addEventListener('click', closeUserModal);
  document.getElementById('userModalBackdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeUserModal();
  });
  document.getElementById('modalBlockBtn').addEventListener('click', () => {
    openBlockReasonModal(state.pendingBlockUserId);
  });
  document.getElementById('modalUnblockBtn').addEventListener('click', () => {
    unblockUser(state.pendingBlockUserId);
  });
  document.getElementById('modalLogsBtn').addEventListener('click', () => {
    closeUserModal();
    const u = state.pendingBlockUserId;
    const profile = state.users.data.find(x => x.id === u);
    if (profile) {
      state.logs.search = profile.email || '';
      document.getElementById('logsSearch').value = state.logs.search;
      loadSection('logs');
    }
  });
  document.getElementById('modalRoleBtn').addEventListener('click', () => {
    openRoleModal(state.pendingBlockUserId);
  });

  // Block reason
  document.getElementById('confirmBlockBtn').addEventListener('click', confirmBlock);
  document.getElementById('cancelBlockBtn').addEventListener('click',  closeBlockReasonModal);
  document.getElementById('blockReasonClose').addEventListener('click', closeBlockReasonModal);
  document.getElementById('blockReasonBackdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeBlockReasonModal();
  });
}

// ═══════════════════════════════════════
// НАВИГАЦИЯ
// ═══════════════════════════════════════
const sectionMeta = {
  dashboard:  { label: 'Дашборд',              icon: 'bi bi-speedometer2' },
  users:      { label: 'Пользователи',          icon: 'bi bi-people-fill' },
  blocked:    { label: 'Заблокированные',       icon: 'bi bi-slash-circle' },
  logs:       { label: 'Логи активности',       icon: 'bi bi-journal-text' },
  events:     { label: 'Системные события',     icon: 'bi bi-exclamation-triangle-fill' },
  monitoring: { label: 'Мониторинг системы',    icon: 'bi bi-heart-pulse-fill' },
  settings:   { label: 'Настройки системы',     icon: 'bi bi-gear-wide-connected' },
};

function loadSection(name) {
  state.currentSection = name;

  // Скрываем все секции
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

  // Показываем нужную секцию
  const section = document.getElementById('section' + capitalize(name));
  if (section) section.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (navItem) navItem.classList.add('active');

  // Хлебная крошка
  const meta = sectionMeta[name];
  if (meta) {
    document.getElementById('adminBreadcrumb').innerHTML =
      `<span><i class="${meta.icon}"></i> ${meta.label}</span>`;
  }

  // Загружаем данные
  const loaders = {
    dashboard:  loadDashboard,
    users:      loadUsersTable,
    blocked:    loadBlockedTable,
    logs:       loadLogsTable,
    events:     loadEventsTable,
    monitoring: loadMonitoring,
    settings:   loadSettings,
  };
  if (loaders[name]) loaders[name]();

  // Закрываем мобильную боковую панель
  document.getElementById('adminSidebar').classList.remove('mobile-open');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function toggleSidebar() {
  document.getElementById('adminSidebar').classList.toggle('collapsed');
  document.getElementById('adminMain').classList.toggle('expanded');
}

function toggleMobileSidebar() {
  document.getElementById('adminSidebar').classList.toggle('mobile-open');
}

// ═══════════════════════════════════════
// ДАШБОРД
// ═══════════════════════════════════════
async function loadDashboard() {
  const today     = new Date().toISOString().split('T')[0];
  const week7ago  = new Date(Date.now() - 7 * 86400000).toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Параллельные запросы
  const [
    { count: totalUsers },
    { count: blockedUsers },
    { count: activeUsers },
    { count: todayLogs },
    { count: yesterdayLogs },
    { count: todayNewUsers },
    { count: openEvents },
    { count: critEvents },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_blocked', true),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_sign_in_at', week7ago),
    supabase.from('activity_logs').select('*', { count: 'exact', head: true }).gte('created_at', today + 'T00:00:00'),
    supabase.from('activity_logs').select('*', { count: 'exact', head: true })
      .gte('created_at', yesterday + 'T00:00:00').lt('created_at', today + 'T00:00:00'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', today + 'T00:00:00'),
    supabase.from('system_events').select('*', { count: 'exact', head: true }).eq('resolved', false),
    supabase.from('system_events').select('*', { count: 'exact', head: true })
      .eq('resolved', false).eq('level', 'critical'),
  ]);

  // Обновляем KPI-показатели
  document.getElementById('kpiTotalUsers').textContent  = totalUsers ?? '—';
  document.getElementById('kpiActiveUsers').textContent = activeUsers ?? '—';
  document.getElementById('kpiBlockedUsers').textContent= blockedUsers ?? '—';
  document.getElementById('kpiLogsToday').textContent   = todayLogs ?? '—';
  document.getElementById('kpiOpenEvents').textContent  = openEvents ?? '—';
  document.getElementById('kpiNewToday').innerHTML      =
    `<i class="bi bi-arrow-up"></i> ${todayNewUsers ?? 0} сегодня`;

  const activePercent = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
  document.getElementById('kpiActivePercent').textContent  = `${activePercent}% от всех`;
  const blockedPercent = totalUsers > 0 ? Math.round((blockedUsers / totalUsers) * 100) : 0;
  document.getElementById('kpiBlockedPercent').textContent = `${blockedPercent}% от всех`;

  const logsDiff = (todayLogs ?? 0) - (yesterdayLogs ?? 0);
  const logsDiffSign = logsDiff >= 0 ? '+' : '';
  document.getElementById('kpiLogsYesterday').textContent = `${logsDiffSign}${logsDiff} vs вчера`;

  document.getElementById('kpiCriticalEvents').textContent =
    critEvents > 0 ? `${critEvents} критических!` : 'Всё в норме';
  document.getElementById('kpiCriticalEvents').className = 'kpi-delta ' + (critEvents > 0 ? 'danger' : 'success');

  // Обновляем счётчики значков
  document.getElementById('badgeUsers').textContent   = totalUsers ?? 0;
  document.getElementById('badgeBlocked').textContent = blockedUsers ?? 0;
  document.getElementById('badgeEvents').textContent  = openEvents ?? 0;

  // Замеряем задержку до БД
  const t0 = performance.now();
  await supabase.from('profiles').select('id', { head: true }).limit(1);
  const dbPing = Math.round(performance.now() - t0);
  document.getElementById('kpiDbStatus').textContent = dbPing < 1000 ? 'OK' : 'Slow';
  document.getElementById('kpiDbPing').textContent   = `${dbPing} мс`;

  // Графики
  await Promise.all([loadRegistrationsChart(), loadActivityChart()]);

  // Последние записи
  await Promise.all([loadRecentUsers(), loadRecentEvents()]);
}

async function loadRegistrationsChart() {
  const days = 30;
  const labels = [];
  const counts = [];

  const from = new Date(Date.now() - (days - 1) * 86400000);
  from.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('profiles')
    .select('created_at')
    .gte('created_at', from.toISOString())
    .order('created_at');

  // Группируем по дням
  const byDay = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86400000);
    const key = d.toISOString().split('T')[0];
    byDay[key] = 0;
    labels.push(d.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' }));
    counts.push(0);
  }
  (data || []).forEach(row => {
    const key = row.created_at.split('T')[0];
    if (byDay[key] !== undefined) byDay[key]++;
  });
  const values = Object.values(byDay);

  const ctx = document.getElementById('registrationsChart');
  if (state.charts.reg) state.charts.reg.destroy();
  state.charts.reg = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Регистрации',
        data: values,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
      }],
    },
    options: chartDefaults(),
  });
}

async function loadActivityChart() {
  const { data } = await supabase
    .from('activity_logs')
    .select('section')
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());

  const counts = {};
  (data || []).forEach(r => {
    const s = r.section || 'Unknown';
    counts[s] = (counts[s] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#14b8a6','#f97316','#06b6d4'];

  const ctx = document.getElementById('activityBySection');
  if (state.charts.activity) state.charts.activity.destroy();
  state.charts.activity = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sorted.map(x => x[0]),
      datasets: [{
        data:            sorted.map(x => x[1]),
        backgroundColor: colors.slice(0, sorted.length),
        borderWidth: 0,
      }],
    },
    options: {
      ...chartDefaults(false),
      cutout: '65%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10, padding: 12 },
        },
      },
    },
  });
}

async function loadRecentUsers() {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_blocked, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  const tbody = document.querySelector('#recentUsersTable tbody');
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="table-loading">Нет данных</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(u => `
    <tr>
      <td><div class="user-cell">
        <div class="user-mini-avatar">${(u.full_name || u.email || '?')[0].toUpperCase()}</div>
        <div><div class="user-name">${escHtml(u.full_name || '—')}</div></div>
      </div></td>
      <td style="color:var(--text-muted);font-size:12px;">${escHtml(u.email || '—')}</td>
      <td style="color:var(--text-muted);font-size:12px;">${formatDate(u.created_at)}</td>
      <td>${u.is_blocked ? '<span class="badge badge-blocked">Заблокирован</span>' : '<span class="badge badge-active">Активен</span>'}</td>
    </tr>`).join('');
}

async function loadRecentEvents() {
  const { data } = await supabase
    .from('system_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  const tbody = document.querySelector('#recentEventsTable tbody');
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="table-loading">Событий нет</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(e => `
    <tr>
      <td>${levelBadge(e.level)}</td>
      <td style="font-size:12px;color:var(--text-muted);">${escHtml(e.source || '—')}</td>
      <td style="font-size:12.5px;">${escHtml(e.message?.substring(0, 60) || '—')}</td>
      <td style="font-size:11.5px;color:var(--text-dim);white-space:nowrap;">${timeAgo(e.created_at)}</td>
    </tr>`).join('');
}

// ═══════════════════════════════════════
// ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ
// ═══════════════════════════════════════
async function loadUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '<tr><td colspan="8" class="table-loading"><div class="spinner"></div> Загрузка...</td></tr>';

  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' });

  if (state.users.filter === 'blocked') query = query.eq('is_blocked', true);
  else if (state.users.filter === 'active') query = query.eq('is_blocked', false);
  else if (state.users.filter === 'admin')  query = query.eq('role', 'admin');

  if (state.users.search) {
    query = query.or(
      `full_name.ilike.%${state.users.search}%,email.ilike.%${state.users.search}%`
    );
  }

  const from = (state.users.page - 1) * state.users.pageSize;
  const to   = from + state.users.pageSize - 1;
  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-loading">Ошибка загрузки: ${escHtml(error.message)}</td></tr>`;
    return;
  }

  state.users.data  = data || [];
  state.users.total = count || 0;

  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-loading">Нет данных</td></tr>';
    renderUsersPagination();
    return;
  }

  tbody.innerHTML = data.map(u => {
    const name  = escHtml(u.full_name || '—');
    const email = escHtml(u.email    || '—');
    const ini   = (u.full_name || u.email || '?')[0].toUpperCase();
    const avatarContent = u.avatar_url
      ? `<img src="${escHtml(u.avatar_url)}" alt="">`
      : ini;
    return `
    <tr data-uid="${u.id}">
      <td><input type="checkbox" class="row-select" data-uid="${u.id}"></td>
      <td><div class="user-cell">
        <div class="user-mini-avatar">${avatarContent}</div>
        <div>
          <div class="user-name">${name}</div>
          <div class="user-email" style="font-size:11px;color:var(--text-dim);">${escHtml(u.id.substring(0,8))}...</div>
        </div>
      </div></td>
      <td style="color:var(--text-muted);font-size:13px;">${email}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${u.is_blocked ? '<span class="badge badge-blocked"><i class="bi bi-slash-circle-fill"></i> Заблокирован</span>' : '<span class="badge badge-active"><i class="bi bi-check-circle-fill"></i> Активен</span>'}</td>
      <td style="font-size:12.5px;color:var(--text-muted);">${u.last_sign_in_at ? formatDate(u.last_sign_in_at) : '—'}</td>
      <td style="font-size:12.5px;color:var(--text-muted);">${formatDate(u.created_at)}</td>
      <td>
        <div class="row-actions">
          <button class="action-btn" title="Подробнее" onclick="openUserModal('${u.id}')">
            <i class="bi bi-eye-fill"></i>
          </button>
          ${u.is_blocked
    ? `<button class="action-btn success" title="Разблокировать" onclick="unblockUser('${u.id}')"><i class="bi bi-check-circle-fill"></i></button>`
    : `<button class="action-btn danger"  title="Заблокировать"  onclick="openBlockReasonModal('${u.id}')"><i class="bi bi-slash-circle-fill"></i></button>`}
        </div>
      </td>
    </tr>`;
  }).join('');

  // Row checkboxes
  tbody.querySelectorAll('.row-select').forEach(cb => {
    cb.addEventListener('change', () => {
      const uid = cb.dataset.uid;
      if (cb.checked) state.selectedUsers.add(uid);
      else state.selectedUsers.delete(uid);
      updateBulkBar();
    });
    if (state.selectedUsers.has(cb.dataset.uid)) cb.checked = true;
  });

  renderUsersPagination();
  document.getElementById('usersTableInfo').textContent = `${count} пользователей`;
}

function renderUsersPagination() {
  const total = state.users.total;
  const size  = state.users.pageSize;
  const pages = Math.ceil(total / size);
  const cur   = state.users.page;

  const el = document.getElementById('usersPagination');
  if (pages <= 1) { el.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${cur === 1 ? 'disabled' : ''} onclick="setUsersPage(${cur - 1})"><i class="bi bi-chevron-left"></i></button>`;
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - cur) <= 2) {
      html += `<button class="page-btn ${i === cur ? 'active' : ''}" onclick="setUsersPage(${i})">${i}</button>`;
    } else if (Math.abs(i - cur) === 3) {
      html += `<span style="color:var(--text-dim);padding:0 4px;">…</span>`;
    }
  }
  html += `<button class="page-btn" ${cur === pages ? 'disabled' : ''} onclick="setUsersPage(${cur + 1})"><i class="bi bi-chevron-right"></i></button>`;
  el.innerHTML = html;
}

window.setUsersPage = function(p) {
  state.users.page = p;
  loadUsersTable();
};

function toggleSelectAll(e) {
  document.querySelectorAll('#usersTableBody .row-select').forEach(cb => {
    cb.checked = e.target.checked;
    const uid = cb.dataset.uid;
    if (e.target.checked) state.selectedUsers.add(uid);
    else state.selectedUsers.delete(uid);
  });
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('usersBulkBar');
  const n   = state.selectedUsers.size;
  if (n === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  document.getElementById('bulkCount').textContent = `${n} выбрано`;
}

function clearSelection() {
  state.selectedUsers.clear();
  document.querySelectorAll('#usersTableBody .row-select').forEach(cb => cb.checked = false);
  document.getElementById('selectAllUsers').checked = false;
  updateBulkBar();
}

async function bulkAction(type) {
  const ids = Array.from(state.selectedUsers);
  if (!ids.length) return;
  const upd = type === 'block'
    ? { is_blocked: true,  blocked_at: new Date().toISOString() }
    : { is_blocked: false, blocked_at: null, blocked_reason: null };
  const { error } = await supabase.from('profiles').update(upd).in('id', ids);
  if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
  toast(`${type === 'block' ? 'Заблокировано' : 'Разблокировано'}: ${ids.length}`, 'success');
  clearSelection();
  loadUsersTable();
  loadDashboardBadges();
}

// ═══════════════════════════════════════
// ЗАБЛОКИРОВАННЫЕ ПОЛЬЗОВАТЕЛИ
// ═══════════════════════════════════════
async function loadBlockedTable() {
  const tbody = document.getElementById('blockedTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><div class="spinner"></div></td></tr>';

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('is_blocked', true)
    .order('blocked_at', { ascending: false });

  if (error || !data?.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Заблокированных нет</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(u => `
    <tr>
      <td><div class="user-cell">
        <div class="user-mini-avatar">${(u.full_name || u.email || '?')[0].toUpperCase()}</div>
        <div class="user-name">${escHtml(u.full_name || '—')}</div>
      </div></td>
      <td style="color:var(--text-muted);font-size:12.5px;">${escHtml(u.email || '—')}</td>
      <td style="font-size:12.5px;">${escHtml(u.blocked_reason || '—')}</td>
      <td style="font-size:12px;color:var(--text-muted);white-space:nowrap;">${u.blocked_at ? formatDate(u.blocked_at) : '—'}</td>
      <td style="font-size:12px;color:var(--text-dim);">—</td>
      <td>
        <button class="btn-admin btn-sm btn-success" onclick="unblockUser('${u.id}')">
          <i class="bi bi-check-circle"></i> Разблокировать
        </button>
      </td>
    </tr>`).join('');
}

// ═══════════════════════════════════════
// МОДАЛЬНОЕ ОКНО ПОЛЬЗОВАТЕЛЯ
// ═══════════════════════════════════════
window.openUserModal = async function(userId) {
  state.pendingBlockUserId = userId;
  document.getElementById('userModalBackdrop').style.display = 'flex';

  const profile = state.users.data.find(x => x.id === userId)
    || (await supabase.from('profiles').select('*').eq('id', userId).single()).data;

  if (!profile) { toast('Пользователь не найден', 'error'); return; }

  document.getElementById('userModalTitle').textContent =
    profile.full_name || profile.email || 'Пользователь';

  // Видимость кнопок
  document.getElementById('modalBlockBtn').style.display    = profile.is_blocked ? 'none' : '';
  document.getElementById('modalUnblockBtn').style.display  = profile.is_blocked ? ''     : 'none';

  // Последние действия
  const { data: logs } = await supabase
    .from('activity_logs')
    .select('action, section, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  document.getElementById('userModalBody').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border);">
      <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--purple));
                  display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;flex-shrink:0;">
        ${(profile.full_name || profile.email || '?')[0].toUpperCase()}
      </div>
      <div>
        <div style="font-weight:700;font-size:16px;">${escHtml(profile.full_name || 'Без имени')}</div>
        <div style="color:var(--text-muted);font-size:13px;">${escHtml(profile.email || '—')}</div>
        <div style="margin-top:6px;display:flex;gap:6px;">
          ${roleBadge(profile.role)}
          ${profile.is_blocked
    ? '<span class="badge badge-blocked"><i class="bi bi-slash-circle-fill"></i> Заблокирован</span>'
    : '<span class="badge badge-active"><i class="bi bi-check-circle-fill"></i> Активен</span>'}
        </div>
      </div>
    </div>

    <div class="user-detail-grid">
      <div class="detail-item">
        <div class="detail-label">ID</div>
        <div class="detail-value" style="font-size:12px;word-break:break-all;">${profile.id}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Регистрация</div>
        <div class="detail-value">${formatDate(profile.created_at)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Последний вход</div>
        <div class="detail-value">${profile.last_sign_in_at ? formatDate(profile.last_sign_in_at) : '—'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Кол-во входов</div>
        <div class="detail-value">${profile.sign_in_count ?? '—'}</div>
      </div>
      ${profile.is_blocked && profile.blocked_reason ? `
      <div class="detail-item" style="grid-column:1/-1;">
        <div class="detail-label">Причина блокировки</div>
        <div class="detail-value" style="color:var(--danger);">${escHtml(profile.blocked_reason)}</div>
      </div>` : ''}
    </div>

    <div class="user-log-mini">
      <h4><i class="bi bi-clock-history"></i> Последние действия</h4>
      ${logs?.length
    ? `<table class="admin-table compact">
           <thead><tr><th>Действие</th><th>Раздел</th><th>Время</th></tr></thead>
           <tbody>${logs.map(l => `
             <tr>
               <td>${escHtml(l.action || '—')}</td>
               <td style="color:var(--text-muted)">${escHtml(l.section || '—')}</td>
               <td style="color:var(--text-dim);font-size:11.5px;">${timeAgo(l.created_at)}</td>
             </tr>`).join('')}
           </tbody>
         </table>`
    : '<p style="color:var(--text-dim);font-size:13px;">Действий нет</p>'}
    </div>`;
};

function closeUserModal() {
  document.getElementById('userModalBackdrop').style.display = 'none';
}

// ═══════════════════════════════════════
// БЛОКИРОВКА / РАЗБЛОКИРОВКА
// ═══════════════════════════════════════
window.openBlockReasonModal = function(userId) {
  state.pendingBlockUserId = userId;
  document.getElementById('blockReasonText').value = '';
  document.getElementById('blockReasonBackdrop').style.display = 'flex';
  document.getElementById('userModalBackdrop').style.display   = 'none';
};

function closeBlockReasonModal() {
  document.getElementById('blockReasonBackdrop').style.display = 'none';
}

async function confirmBlock() {
  const reason = document.getElementById('blockReasonText').value.trim() || 'Не указана';
  const { error } = await supabase
    .from('profiles')
    .update({ is_blocked: true, blocked_at: new Date().toISOString(), blocked_reason: reason })
    .eq('id', state.pendingBlockUserId);

  if (error) { toast('Ошибка блокировки: ' + error.message, 'error'); return; }

  // Записываем событие в журнал
  await logSystemEvent('warning', 'admin', `Пользователь заблокирован: ${state.pendingBlockUserId}. Причина: ${reason}`);

  toast('Пользователь заблокирован', 'success');
  closeBlockReasonModal();
  loadUsersTable();
  loadDashboardBadges();
}

window.unblockUser = async function(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_blocked: false, blocked_at: null, blocked_reason: null })
    .eq('id', userId);

  if (error) { toast('Ошибка разблокировки: ' + error.message, 'error'); return; }
  toast('Пользователь разблокирован', 'success');
  closeUserModal();
  loadUsersTable();
  loadBlockedTable();
  loadDashboardBadges();
};

// Role change
window.openRoleModal = function(userId) {
  const current = state.users.data.find(x => x.id === userId)?.role || 'user';
  const next    = current === 'admin' ? 'user' : 'admin';
  if (!confirm(`Изменить роль на "${next}"?`)) return;
  supabase.from('profiles').update({ role: next }).eq('id', userId).then(({ error }) => {
    if (error) toast('Ошибка: ' + error.message, 'error');
    else {
      toast(`Роль изменена на "${next}"`, 'success');
      closeUserModal();
      loadUsersTable();
    }
  });
};

async function loadDashboardBadges() {
  const [{ count: t }, { count: b }, { count: e }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_blocked', true),
    supabase.from('system_events').select('*', { count: 'exact', head: true }).eq('resolved', false),
  ]);
  document.getElementById('badgeUsers').textContent   = t ?? 0;
  document.getElementById('badgeBlocked').textContent = b ?? 0;
  document.getElementById('badgeEvents').textContent  = e ?? 0;
}

// ═══════════════════════════════════════
// ТАБЛИЦА ЛОГОВ
// ═══════════════════════════════════════
async function loadLogsTable() {
  const tbody = document.getElementById('logsTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><div class="spinner"></div></td></tr>';

  let query = supabase
    .from('activity_logs')
    .select('*', { count: 'exact' });

  if (state.logs.search) {
    query = query.or(
      `user_email.ilike.%${state.logs.search}%,action.ilike.%${state.logs.search}%`
    );
  }
  if (state.logs.action) query = query.eq('action', state.logs.action);
  if (state.logs.from)   query = query.gte('created_at', state.logs.from + 'T00:00:00');
  if (state.logs.to)     query = query.lte('created_at', state.logs.to   + 'T23:59:59');

  const from = (state.logs.page - 1) * state.logs.pageSize;
  query = query.order('created_at', { ascending: false }).range(from, from + state.logs.pageSize - 1);

  const { data, count, error } = await query;
  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading">Ошибка: ${escHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Логов нет</td></tr>';
    renderLogsPagination(0);
    return;
  }

  state.logs.total = count || 0;
  tbody.innerHTML = data.map(l => {
    const details = l.details ? JSON.stringify(l.details).substring(0, 60) : '—';
    return `
    <tr>
      <td style="font-size:12px;color:var(--text-muted);white-space:nowrap;">${formatDateTime(l.created_at)}</td>
      <td style="font-size:12.5px;">${escHtml(l.user_email || '—')}</td>
      <td><code style="font-size:12px;background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">${escHtml(l.action || '—')}</code></td>
      <td style="font-size:12.5px;color:var(--text-muted);">${escHtml(l.section || '—')}</td>
      <td style="font-size:11.5px;color:var(--text-dim);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
          title="${escHtml(JSON.stringify(l.details) || '')}">${escHtml(details)}</td>
      <td style="font-size:12px;color:var(--text-dim);font-family:monospace;">${escHtml(l.ip_address || '—')}</td>
    </tr>`;
  }).join('');

  renderLogsPagination(count);
}

function renderLogsPagination(total) {
  const pages = Math.ceil(total / state.logs.pageSize);
  const cur   = state.logs.page;
  const el    = document.getElementById('logsPagination');
  if (pages <= 1) { el.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${cur === 1 ? 'disabled' : ''} onclick="setLogsPage(${cur - 1})"><i class="bi bi-chevron-left"></i></button>`;
  for (let i = 1; i <= Math.min(pages, 10); i++) {
    html += `<button class="page-btn ${i === cur ? 'active' : ''}" onclick="setLogsPage(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" ${cur === pages ? 'disabled' : ''} onclick="setLogsPage(${cur + 1})"><i class="bi bi-chevron-right"></i></button>`;
  el.innerHTML = html;
}

window.setLogsPage = function(p) { state.logs.page = p; loadLogsTable(); };

// ═══════════════════════════════════════
// ТАБЛИЦА СОБЫТИЙ
// ═══════════════════════════════════════
async function loadEventsTable() {
  const tbody = document.getElementById('eventsTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><div class="spinner"></div></td></tr>';

  let query = supabase.from('system_events').select('*');

  if (state.events.openOnly) query = query.eq('resolved', false);
  if (state.events.filter !== 'all') query = query.eq('level', state.events.filter);
  query = query.order('created_at', { ascending: false }).limit(100);

  const { data, error } = await query;
  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading">Ошибка: ${escHtml(error.message)}</td></tr>`;
    return;
  }
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Событий нет</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(e => `
    <tr>
      <td>${levelBadge(e.level)}</td>
      <td style="font-size:12.5px;color:var(--text-muted);">${escHtml(e.source || '—')}</td>
      <td style="font-size:13px;max-width:320px;">${escHtml(e.message || '—')}</td>
      <td style="font-size:12px;color:var(--text-dim);white-space:nowrap;">${timeAgo(e.created_at)}</td>
      <td>${e.resolved ? '<span class="badge badge-resolved">Закрыто</span>' : '<span class="badge badge-warning">Открыто</span>'}</td>
      <td>
        ${!e.resolved
    ? `<button class="btn-admin btn-sm btn-outline" onclick="resolveEvent('${e.id}')">
               <i class="bi bi-check"></i> Закрыть
             </button>`
    : '—'}
      </td>
    </tr>`).join('');
}

window.resolveEvent = async function(id) {
  const { error } = await supabase
    .from('system_events')
    .update({ resolved: true, resolved_by: state.currentUser.id, resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) toast('Ошибка: ' + error.message, 'error');
  else { toast('Событие закрыто', 'success'); loadEventsTable(); loadDashboardBadges(); }
};

async function resolveAllEvents() {
  const { error } = await supabase
    .from('system_events')
    .update({ resolved: true, resolved_by: state.currentUser.id, resolved_at: new Date().toISOString() })
    .eq('resolved', false);
  if (error) toast('Ошибка: ' + error.message, 'error');
  else { toast('Все события закрыты', 'success'); loadEventsTable(); loadDashboardBadges(); }
}

async function addTestEvent() {
  const levels   = ['info', 'warning', 'error', 'critical'];
  const sources  = ['API', 'Auth', 'Database', 'Scheduler', 'Admin'];
  const messages = [
    'Высокая задержка ответа API',
    'Ошибка синхронизации кэша',
    'Пользователь заблокирован системой',
    'Требуется обновление индексов',
    'Тестовое сообщение',
  ];
  await logSystemEvent(
    levels[Math.floor(Math.random() * levels.length)],
    sources[Math.floor(Math.random() * sources.length)],
    messages[Math.floor(Math.random() * messages.length)]
  );
  toast('Тестовое событие добавлено', 'info');
  loadEventsTable();
  loadDashboardBadges();
}

// ═══════════════════════════════════════
// МОНИТОРИНГ
// ═══════════════════════════════════════
async function loadMonitoring() {
  // Reset all to checking
  ['Supabase', 'Binance', 'Finnhub', 'NewsApi', 'Auth'].forEach(id => {
    const card = document.getElementById('status' + id);
    card.className = 'status-card checking';
    card.querySelector('.status-value').className = 'status-value checking';
    card.querySelector('.status-value').textContent = 'Проверка...';
    document.getElementById('ping' + id).textContent = '— мс';
  });

  await runHealthCheck();
  loadSectionUsageChart();
}

async function runHealthCheck() {
  const history = [];

  // Supabase DB
  {
    const t0 = performance.now();
    const { error } = await supabase.from('profiles').select('id', { head: true }).limit(1);
    const ping = Math.round(performance.now() - t0);
    const ok   = !error;
    setStatusCard('Supabase', ok ? 'ok' : 'error', ok ? 'Работает' : 'Ошибка', ping);
    history.push({ name: 'Supabase DB', ok, ping });
  }

  // Auth service
  {
    const t0 = performance.now();
    const { error } = await supabase.auth.getSession();
    const ping = Math.round(performance.now() - t0);
    const ok   = !error;
    setStatusCard('Auth', ok ? 'ok' : 'error', ok ? 'Работает' : 'Ошибка', ping);
    history.push({ name: 'Auth Service', ok, ping });
  }

  // Binance API (simple ping)
  await checkExternalApi(
    'Binance',
    'https://api.binance.com/api/v3/ping',
    history
  );

  // Finnhub — ping root page (200 without auth, no service-worker 401 noise)
  await checkExternalApi(
    'Finnhub',
    'https://finnhub.io/',
    history,
    [200, 301, 302]
  );

  // News API — не проверяем напрямую (CORS заблокирован браузером)
  setStatusCard('NewsApi', 'info', 'N/A (CORS)', null);
  history.push({ name: 'News API', ok: null, ping: null });

  // Update history table
  const tbody = document.getElementById('healthHistoryBody');
  const now   = new Date().toLocaleTimeString('ru-RU');
  const rows  = history.map(h => `
    <tr>
      <td>${escHtml(h.name)}</td>
      <td>${h.ok !== null
    ? (h.ok ? '<span class="badge badge-ok">OK</span>' : '<span class="badge badge-error">Ошибка</span>')
    : '<span class="badge badge-warning">?</span>'}</td>
      <td style="font-variant-numeric:tabular-nums;">${h.ping != null ? h.ping + ' мс' : '—'}</td>
      <td style="color:var(--text-dim);font-size:12px;">${now}</td>
    </tr>`).join('');
  tbody.innerHTML = rows;
}

async function checkExternalApi(id, url, history, okStatuses = [200]) {
  const t0 = performance.now();
  let ok = false, ping = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    ping = Math.round(performance.now() - t0);
    ok   = okStatuses.includes(res.status);
  } catch {
    ping = null;
  }
  setStatusCard(id, ok ? 'ok' : (ping === null ? 'error' : 'warning'),
    ok ? 'Работает' : (ping === null ? 'Недоступен' : 'Ответ получен'), ping);
  history.push({ name: id + ' API', ok, ping });
}

function setStatusCard(id, status, label, ping) {
  const card = document.getElementById('status' + id);
  if (!card) return;
  card.className = 'status-card ' + status;
  const val = card.querySelector('.status-value');
  val.className = 'status-value ' + status;
  val.textContent = label;
  const pingEl = document.getElementById('ping' + id);
  if (pingEl) pingEl.textContent = ping != null ? ping + ' мс' : '—';
}

async function loadSectionUsageChart() {
  const { data } = await supabase
    .from('activity_logs')
    .select('section')
    .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString());

  const counts = {};
  (data || []).forEach(r => {
    const s = r.section || 'Другое';
    counts[s] = (counts[s] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const ctx = document.getElementById('sectionUsageChart');
  if (state.charts.sectionUsage) state.charts.sectionUsage.destroy();
  state.charts.sectionUsage = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(x => x[0]),
      datasets: [{
        label: 'Посещений',
        data: sorted.map(x => x[1]),
        backgroundColor: ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#14b8a6'],
        borderRadius: 6,
      }],
    },
    options: chartDefaults(),
  });
}

// ═══════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════
async function loadSettings() {
  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value, value_type');

  if (error) {
    // Table doesn't exist yet — show migration hint instead of just a toast
    if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
      const body = document.getElementById('sectionSettings')?.querySelector('.card-body') ||
                   document.getElementById('sectionSettings');
      if (body) {
        const existing = document.getElementById('settingsMigrationBanner');
        if (!existing) {
          const banner = document.createElement('div');
          banner.id = 'settingsMigrationBanner';
          banner.className = 'alert-banner alert-warning';
          banner.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i>
            Таблица <code>system_settings</code> не найдена.
            Выполните <strong>SQL/admin_fix.sql</strong> в Supabase SQL Editor, затем обновите страницу.`;
          body.prepend(banner);
        }
      }
      return;
    }
    toast('Ошибка загрузки настроек: ' + error.message, 'error');
    return;
  }

  const map = {};
  (data || []).forEach(r => {
    let raw = r.value;
    // value — jsonb-колонка: PostgREST может вернуть уже распарсенный тип
    // Если value_type === 'json' и raw уже объект — используем как есть
    if (r.value_type === 'json') {
      if (typeof raw === 'object' && raw !== null) { map[r.key] = raw; return; }
      try { map[r.key] = JSON.parse(String(raw ?? '{}')); } catch { map[r.key] = {}; }
      return;
    }
    // Нормализуем до строки (jsonb-число/булев → строка)
    const str = raw === null || raw === undefined ? '' : String(raw);
    let v = str;
    if (r.value_type === 'number')  v = parseFloat(str);
    if (r.value_type === 'boolean') v = str === 'true' || raw === true;
    map[r.key] = v;
  });
  state.settings = map;

  // Fill inputs
  safeSetNum('settingDataRefresh',          map.data_refresh_interval,                 60);
  safeSetNum('settingNewsRefresh',           map.news_refresh_interval,                 15);
  safeSetNum('settingApiRateLimit',          map.api_rate_limit,                        30);
  safeSetNum('settingMaxPortfolios',         map.max_portfolios_per_user,               10);
  safeSetNum('settingPriceChangeThreshold',  map.notification_thresholds?.price_change,  5);
  safeSetNum('settingVolumeSpikeThreshold',  map.notification_thresholds?.volume_spike, 200);
  safeSetBool('settingRegistrationEnabled',  map.registration_enabled ?? true);
  safeSetBool('settingGuestMode',            map.guest_mode_enabled   ?? true);
  safeSetBool('settingMaintenanceMode',      map.maintenance_mode     ?? false);

  const mMode = map.maintenance_mode ?? false;
  document.getElementById('maintenanceMsgRow').style.display = mMode ? 'flex' : 'none';
  if (map.maintenance_message) {
    const el = document.getElementById('settingMaintenanceMsg');
    if (el) el.value = map.maintenance_message;
  }
}

async function saveSettings() {
  const btn = document.getElementById('saveSettingsBtn');
  const statusEl = document.getElementById('saveStatus');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Сохранение...';
  statusEl.textContent = '';

  const now = new Date().toISOString();
  const maintenanceMsg = (document.getElementById('settingMaintenanceMsg')?.value || '').trim();

  // вспомогательная функция: читает числовое поле с запасным значением
  const getNum = (id, def) => {
    const v = parseFloat(document.getElementById(id)?.value);
    return isNaN(v) ? def : v;
  };

  const updates = [
    { key: 'data_refresh_interval',    value: String(getNum('settingDataRefresh',          60)),  value_type: 'number',  updated_at: now },
    { key: 'news_refresh_interval',    value: String(getNum('settingNewsRefresh',           15)),  value_type: 'number',  updated_at: now },
    { key: 'api_rate_limit',           value: String(getNum('settingApiRateLimit',          30)),  value_type: 'number',  updated_at: now },
    { key: 'max_portfolios_per_user',  value: String(getNum('settingMaxPortfolios',         10)),  value_type: 'number',  updated_at: now },
    { key: 'registration_enabled',     value: String(document.getElementById('settingRegistrationEnabled').checked), value_type: 'boolean', updated_at: now },
    { key: 'guest_mode_enabled',       value: String(document.getElementById('settingGuestMode').checked),           value_type: 'boolean', updated_at: now },
    { key: 'maintenance_mode',         value: String(document.getElementById('settingMaintenanceMode').checked),     value_type: 'boolean', updated_at: now },
    { key: 'maintenance_message',      value: maintenanceMsg,                                                        value_type: 'string',  updated_at: now },
    { key: 'notification_thresholds',  value: JSON.stringify({
      price_change: getNum('settingPriceChangeThreshold', 5),
      volume_spike: getNum('settingVolumeSpikeThreshold', 200),
    }), value_type: 'json', updated_at: now },
  ];

  let hasError = false;
  let lastErrorMsg = '';
  for (const upd of updates) {
    const { error } = await supabase
      .from('system_settings')
      .upsert(upd, { onConflict: 'key' });
    if (error) { hasError = true; lastErrorMsg = error.message; break; }
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="bi bi-floppy-fill"></i> Сохранить все настройки';

  if (hasError) {
    statusEl.className = 'save-status error';
    statusEl.innerHTML = '<i class="bi bi-x-circle"></i> Ошибка сохранения';
    toast('Ошибка: ' + lastErrorMsg, 'error');
  } else {
    statusEl.className = 'save-status success';
    statusEl.innerHTML = '<i class="bi bi-check-circle-fill"></i> Сохранено';
    toast('Настройки сохранены', 'success');
    await logSystemEvent('info', 'admin', 'Системные настройки обновлены администратором');
    setTimeout(() => statusEl.textContent = '', 4000);
  }
}

// ═══════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════
async function exportUsersCSV() {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, email, role, is_blocked, created_at, last_sign_in_at')
    .order('created_at', { ascending: false });
  if (!data?.length) { toast('Нет данных для экспорта', 'warning'); return; }

  const headers = ['Имя', 'Email', 'Роль', 'Заблокирован', 'Регистрация', 'Последний вход'];
  const rows = data.map(u => [
    u.full_name || '',
    u.email || '',
    u.role || 'user',
    u.is_blocked ? 'Да' : 'Нет',
    formatDate(u.created_at),
    u.last_sign_in_at ? formatDate(u.last_sign_in_at) : '',
  ]);
  downloadCSV([headers, ...rows], 'users_export.csv');
  toast(`Экспортировано ${data.length} пользователей`, 'success');
}

async function exportLogsCSV() {
  const { data } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (!data?.length) { toast('Нет данных для экспорта', 'warning'); return; }

  const headers = ['Время', 'Email', 'Действие', 'Раздел', 'IP'];
  const rows = data.map(l => [
    formatDateTime(l.created_at), l.user_email || '', l.action || '', l.section || '', l.ip_address || '',
  ]);
  downloadCSV([headers, ...rows], 'logs_export.csv');
  toast(`Экспортировано ${data.length} строк`, 'success');
}

function downloadCSV(rows, filename) {
  const csv = rows.map(r =>
    r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════
async function logSystemEvent(level, source, message, details = null) {
  await supabase.from('system_events').insert({
    level, source, message,
    details: details ? JSON.stringify(details) : null,
    resolved: false,
  });
}

function chartDefaults(showLegend = true) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: showLegend
        ? { labels: { color: '#94a3b8', font: { size: 11 } } }
        : { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
      },
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 } } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 } }, beginAtZero: true },
    },
  };
}

function roleBadge(role) {
  if (role === 'admin') return '<span class="badge badge-admin"><i class="bi bi-shield-fill-check"></i> Админ</span>';
  if (role === 'moderator') return '<span class="badge badge-mod"><i class="bi bi-shield-half"></i> Модератор</span>';
  return '<span class="badge badge-user"><i class="bi bi-person-fill"></i> Пользователь</span>';
}

function levelBadge(level) {
  const map = {
    critical: '<span class="badge badge-critical"><i class="bi bi-radioactive"></i> Критическое</span>',
    error:    '<span class="badge badge-error"><i class="bi bi-x-circle-fill"></i> Ошибка</span>',
    warning:  '<span class="badge badge-warning"><i class="bi bi-exclamation-triangle-fill"></i> Предупреждение</span>',
    info:     '<span class="badge badge-info"><i class="bi bi-info-circle-fill"></i> Инфо</span>',
  };
  return map[level] || `<span class="badge">${level}</span>`;
}

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function formatDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('ru-RU', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit',
  });
}

function timeAgo(dt) {
  if (!dt) return '—';
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m <   1) return 'только что';
  if (m <  60) return `${m} мин. назад`;
  const h = Math.floor(m / 60);
  if (h <  24) return `${h} ч. назад`;
  const d = Math.floor(h / 24);
  if (d <  30) return `${d} д. назад`;
  return formatDate(dt);
}

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

function safeSetNum(id, val, def = '') {
  const el = document.getElementById(id);
  if (!el) return;
  const n = Number(val);
  el.value = isNaN(n) ? def : n;
}
function safeSetBool(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(val);
}

// Часы
function startClock() {
  const el = document.getElementById('topbarTime');
  function upd() {
    el.textContent = new Date().toLocaleTimeString('ru-RU',
      { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }
  upd();
  setInterval(upd, 1000);
}

// Тема оформления
function toggleTheme() {
  const root = document.documentElement;
  const isLight = root.dataset.theme === 'light';
  root.dataset.theme = isLight ? 'dark' : 'light';
  document.getElementById('themeToggleBtn').innerHTML =
    isLight ? '<i class="bi bi-moon-stars-fill"></i>' : '<i class="bi bi-sun-fill"></i>';
  localStorage.setItem('adminTheme', root.dataset.theme);
}

// Выход из системы
async function handleLogout() {
  await supabase.auth.signOut();
  window.location.href = '../login.html';
}

// Уведомление
window.toast = function(message, type = 'info', duration = 3500) {
  const icons = {
    success: 'bi bi-check-circle-fill',
    error:   'bi bi-x-circle-fill',
    warning: 'bi bi-exclamation-triangle-fill',
    info:    'bi bi-info-circle-fill',
  };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${escHtml(message)}</span>`;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), duration);
};

// Восстанавливаем сохранённую тему
(function() {
  const saved = localStorage.getItem('adminTheme');
  if (saved) document.documentElement.dataset.theme = saved;
})();

// ═══════════════════════════════════════
// ЗАПУСК
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', init);
