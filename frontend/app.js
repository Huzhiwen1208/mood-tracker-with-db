const moodTypes = ['😊 开心', '😌 平静', '😢 难过', '😤 烦躁', '🤔 思考', '🥳 庆祝'];

const state = {
  authMode: 'login',
  currentUser: null,
  moods: [],
  users: [],
  selectedMoodType: moodTypes[0],
  timelineFilter: 'all',
  lastSyncedAt: null,
};

const elements = {
  authModeBadge: document.getElementById('authModeBadge'),
  authGuest: document.getElementById('authGuest'),
  authAuthed: document.getElementById('authAuthed'),
  authForm: document.getElementById('authForm'),
  authAccount: document.getElementById('authAccount'),
  authNickname: document.getElementById('authNickname'),
  authPassword: document.getElementById('authPassword'),
  authSubmit: document.getElementById('authSubmit'),
  authStatus: document.getElementById('authStatus'),
  nicknameWrap: document.getElementById('nicknameWrap'),
  profileName: document.getElementById('profileName'),
  profileMeta: document.getElementById('profileMeta'),
  profileRole: document.getElementById('profileRole'),
  logoutButton: document.getElementById('logoutButton'),
  composerState: document.getElementById('composerState'),
  moodTypes: document.getElementById('moodTypes'),
  moodForm: document.getElementById('moodForm'),
  moodContent: document.getElementById('moodContent'),
  moodSubmit: document.getElementById('moodSubmit'),
  moodHint: document.getElementById('moodHint'),
  moodStatus: document.getElementById('moodStatus'),
  moodCounter: document.getElementById('moodCounter'),
  clearMoodButton: document.getElementById('clearMoodButton'),
  timeline: document.getElementById('timeline'),
  timelineStats: document.getElementById('timelineStats'),
  timelineMeta: document.getElementById('timelineMeta'),
  refreshButton: document.getElementById('refreshButton'),
  adminPanel: document.getElementById('adminPanel'),
  adminCreateForm: document.getElementById('adminCreateForm'),
  adminAccount: document.getElementById('adminAccount'),
  adminNickname: document.getElementById('adminNickname'),
  adminPassword: document.getElementById('adminPassword'),
  adminRole: document.getElementById('adminRole'),
  adminStatus: document.getElementById('adminStatus'),
  userList: document.getElementById('userList'),
  userCountBadge: document.getElementById('userCountBadge'),
  toastStack: document.getElementById('toastStack'),
  segmentButtons: Array.from(document.querySelectorAll('.segment')),
  filterButtons: Array.from(document.querySelectorAll('.filter-btn')),
};

function setStatus(element, message, type = '') {
  element.textContent = message || '';
  element.classList.remove('success', 'error');
  if (type) {
    element.classList.add(type);
  }
}

function showToast(message, type = 'info') {
  if (!message) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastStack.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 2600);
}

function setButtonBusy(button, busy, idleText, busyText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

async function request(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const fetchOptions = {
    method: options.method || 'GET',
    headers,
    credentials: 'same-origin',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.message || '请求失败，请稍后重试。');
  }

  return data;
}

function formatTime(value) {
  if (!value) {
    return '-';
  }

  const normalized = String(value).replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN');
}

function getFilteredMoods() {
  if (state.timelineFilter !== 'mine' || !state.currentUser) {
    return state.moods;
  }

  return state.moods.filter((mood) => Number(mood.author.id) === Number(state.currentUser.id));
}

function updateMoodCounter() {
  const length = elements.moodContent.value.trim().length;
  elements.moodCounter.textContent = `${length} / 300`;
}

function setAuthMode(mode) {
  state.authMode = mode;
  elements.authModeBadge.textContent = mode === 'login' ? '登录' : '注册';
  elements.authSubmit.textContent = mode === 'login' ? '登录' : '注册并登录';
  elements.nicknameWrap.classList.toggle('hidden', mode !== 'register');
  elements.segmentButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === mode);
  });
  setStatus(elements.authStatus, mode === 'login' ? '使用已有账号登录。' : '注册后会自动登录。');
}

function renderMoodTypes() {
  elements.moodTypes.innerHTML = '';
  for (const moodType of moodTypes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mood-chip';
    button.textContent = moodType;
    button.disabled = !state.currentUser;
    button.classList.toggle('is-active', state.selectedMoodType === moodType);
    button.addEventListener('click', () => {
      state.selectedMoodType = moodType;
      renderMoodTypes();
    });
    elements.moodTypes.appendChild(button);
  }
}

function renderComposer() {
  const loggedIn = Boolean(state.currentUser);
  elements.moodContent.disabled = !loggedIn;
  elements.clearMoodButton.disabled = !loggedIn;
  elements.moodSubmit.disabled = !loggedIn;

  if (!loggedIn) {
    elements.composerState.textContent = '游客模式';
    elements.moodHint.textContent = '登录后即可发布新心情，按钮和标签会自动解锁。';
  } else {
    elements.composerState.textContent =
      state.currentUser.role === 'admin' ? '管理员已登录' : '已登录';
    elements.moodHint.textContent = `当前使用 ${state.currentUser.nickname} 的身份发布，时间线支持只看我的筛选。`;
  }

  updateMoodCounter();
  renderMoodTypes();
}

function renderAuth() {
  const loggedIn = Boolean(state.currentUser);
  elements.authGuest.classList.toggle('hidden', loggedIn);
  elements.authAuthed.classList.toggle('hidden', !loggedIn);

  if (!loggedIn) {
    elements.adminPanel.classList.add('hidden');
    renderComposer();
    return;
  }

  elements.profileName.textContent = state.currentUser.nickname;
  elements.profileMeta.textContent = `${state.currentUser.account} · 创建于 ${formatTime(
    state.currentUser.createdAt,
  )}`;
  elements.profileRole.textContent = state.currentUser.role === 'admin' ? '管理员' : '普通用户';
  elements.adminPanel.classList.toggle('hidden', state.currentUser.role !== 'admin');
  renderComposer();
}

function renderTimelineStats() {
  const mineCount = state.currentUser
    ? state.moods.filter((mood) => Number(mood.author.id) === Number(state.currentUser.id)).length
    : 0;

  const stats = [
    `总记录 ${state.moods.length}`,
    state.currentUser ? `我的记录 ${mineCount}` : '登录后解锁“只看我的”',
    `当前筛选 ${state.timelineFilter === 'all' ? '全部' : '我的'}`,
  ];

  elements.timelineStats.innerHTML = stats
    .map((text) => `<span class="stat-chip">${text}</span>`)
    .join('');

  elements.filterButtons.forEach((button) => {
    const isMine = button.dataset.filter === 'mine';
    button.disabled = isMine && !state.currentUser;
    button.classList.toggle('is-active', button.dataset.filter === state.timelineFilter);
  });

  elements.timelineMeta.textContent = state.lastSyncedAt
    ? `最近同步：${formatTime(state.lastSyncedAt)}`
    : '等待同步';
}

function renderTimeline() {
  renderTimelineStats();
  const moods = getFilteredMoods();

  if (moods.length === 0) {
    const emptyText =
      state.timelineFilter === 'mine' && state.currentUser
        ? '你还没有发布过心情，切回全部记录也许能看到其他人的动态。'
        : '还没有任何心情记录，发出第一条吧。';
    elements.timeline.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }

  elements.timeline.innerHTML = '';

  for (const mood of moods) {
    const item = document.createElement('article');
    item.className = 'timeline-item';

    const head = document.createElement('div');
    head.className = 'timeline-item-head';
    head.innerHTML = `
      <div>
        <p class="timeline-author">${mood.author.nickname}</p>
        <p class="timeline-meta">${mood.author.account} · ${mood.moodType} · ${formatTime(
          mood.publishedAt,
        )}</p>
      </div>
      <span class="pill">${mood.status === 'published' ? '已发布' : mood.status}</span>
    `;

    const content = document.createElement('p');
    content.className = 'timeline-content';
    content.textContent = mood.content;

    item.appendChild(head);
    item.appendChild(content);

    const canRevoke =
      state.currentUser &&
      Number(state.currentUser.id) === Number(mood.author.id) &&
      mood.status === 'published';

    if (canRevoke) {
      const actions = document.createElement('div');
      actions.className = 'timeline-actions';
      const button = document.createElement('button');
      button.className = 'danger-btn';
      button.type = 'button';
      button.textContent = '撤销这条心情';
      button.addEventListener('click', () => handleRevokeMood(mood.id));
      actions.appendChild(button);
      item.appendChild(actions);
    }

    elements.timeline.appendChild(item);
  }
}

function renderUsers() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    elements.userCountBadge.textContent = '0 位用户';
    elements.userList.innerHTML = '';
    return;
  }

  elements.userCountBadge.textContent = `${state.users.length} 位用户`;

  if (state.users.length === 0) {
    elements.userList.innerHTML = '<div class="empty-state">当前没有可展示的系统用户。</div>';
    return;
  }

  elements.userList.innerHTML = '';
  for (const user of state.users) {
    const item = document.createElement('div');
    item.className = 'user-item';

    const meta = document.createElement('div');
    meta.innerHTML = `
      <h3>${user.nickname}</h3>
      <p>${user.account} · ${user.role === 'admin' ? '管理员' : '普通用户'} · 创建于 ${formatTime(
        user.createdAt,
      )}</p>
    `;

    item.appendChild(meta);

    if (Number(user.id) !== Number(state.currentUser.id)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'danger-btn';
      button.textContent = '删除用户';
      button.addEventListener('click', () => handleDeleteUser(user.id, user.nickname));
      item.appendChild(button);
    }

    elements.userList.appendChild(item);
  }
}

async function refreshCurrentUser() {
  try {
    const data = await request('/api/auth/me');
    state.currentUser = data.user;
  } catch (error) {
    state.currentUser = null;
  }
  renderAuth();
}

async function refreshMoods() {
  setButtonBusy(elements.refreshButton, true, '刷新', '同步中');
  try {
    const data = await request('/api/moods');
    state.moods = data.moods || [];
    state.lastSyncedAt = new Date().toISOString();
    renderTimeline();
  } finally {
    setButtonBusy(elements.refreshButton, false, '刷新', '同步中');
  }
}

async function refreshUsers() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    state.users = [];
    renderUsers();
    return;
  }

  const data = await request('/api/admin/users');
  state.users = data.users || [];
  renderUsers();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const account = elements.authAccount.value.trim();
  const password = elements.authPassword.value;
  const nickname = elements.authNickname.value.trim();

  if (state.authMode === 'register' && !nickname) {
    setStatus(elements.authStatus, '注册时请填写昵称。', 'error');
    showToast('注册时请填写昵称。', 'error');
    return;
  }

  const isLogin = state.authMode === 'login';
  setButtonBusy(elements.authSubmit, true, isLogin ? '登录' : '注册并登录', isLogin ? '登录中' : '注册中');

  try {
    const data = await request(isLogin ? '/api/auth/login' : '/api/auth/register', {
      method: 'POST',
      body: isLogin ? { account, password } : { account, password, nickname },
    });
    state.currentUser = data.user;
    elements.authForm.reset();
    setStatus(elements.authStatus, data.message, 'success');
    showToast(data.message, 'success');
    await refreshMoods();
    await refreshUsers();
    renderAuth();
  } catch (error) {
    setStatus(elements.authStatus, error.message, 'error');
    showToast(error.message, 'error');
  } finally {
    setButtonBusy(elements.authSubmit, false, isLogin ? '登录' : '注册并登录', isLogin ? '登录中' : '注册中');
  }
}

async function handleLogout() {
  setButtonBusy(elements.logoutButton, true, '退出登录', '退出中');
  try {
    const data = await request('/api/auth/logout', { method: 'POST' });
    state.currentUser = null;
    state.users = [];
    state.timelineFilter = 'all';
    renderAuth();
    renderUsers();
    renderTimeline();
    setStatus(elements.authStatus, data.message, 'success');
    showToast(data.message, 'success');
  } catch (error) {
    setStatus(elements.authStatus, error.message, 'error');
    showToast(error.message, 'error');
  } finally {
    setButtonBusy(elements.logoutButton, false, '退出登录', '退出中');
  }
}

async function handleMoodSubmit(event) {
  event.preventDefault();
  if (!state.currentUser) {
    setStatus(elements.moodStatus, '请先登录后再发布心情。', 'error');
    showToast('请先登录后再发布心情。', 'error');
    return;
  }

  const content = elements.moodContent.value.trim();
  if (!content) {
    setStatus(elements.moodStatus, '请输入心情内容。', 'error');
    showToast('请输入心情内容。', 'error');
    return;
  }

  setButtonBusy(elements.moodSubmit, true, '发布', '发布中');
  try {
    const data = await request('/api/moods', {
      method: 'POST',
      body: {
        moodType: state.selectedMoodType,
        content,
      },
    });
    elements.moodForm.reset();
    updateMoodCounter();
    setStatus(elements.moodStatus, data.message, 'success');
    showToast(data.message, 'success');
    await refreshMoods();
  } catch (error) {
    setStatus(elements.moodStatus, error.message, 'error');
    showToast(error.message, 'error');
  } finally {
    setButtonBusy(elements.moodSubmit, false, '发布', '发布中');
  }
}

async function handleRevokeMood(moodId) {
  if (!window.confirm('确认撤销这条心情记录吗？')) {
    return;
  }

  try {
    const data = await request(`/api/moods/${moodId}`, { method: 'DELETE' });
    setStatus(elements.moodStatus, data.message, 'success');
    showToast(data.message, 'success');
    await refreshMoods();
  } catch (error) {
    setStatus(elements.moodStatus, error.message, 'error');
    showToast(error.message, 'error');
  }
}

async function handleAdminCreate(event) {
  event.preventDefault();
  setButtonBusy(
    event.submitter,
    true,
    '新增用户',
    '创建中',
  );

  try {
    const data = await request('/api/admin/users', {
      method: 'POST',
      body: {
        account: elements.adminAccount.value.trim(),
        nickname: elements.adminNickname.value.trim(),
        password: elements.adminPassword.value,
        role: elements.adminRole.value,
      },
    });
    elements.adminCreateForm.reset();
    elements.adminRole.value = 'user';
    setStatus(elements.adminStatus, data.message, 'success');
    showToast(data.message, 'success');
    await refreshUsers();
  } catch (error) {
    setStatus(elements.adminStatus, error.message, 'error');
    showToast(error.message, 'error');
  } finally {
    setButtonBusy(event.submitter, false, '新增用户', '创建中');
  }
}

async function handleDeleteUser(userId, nickname) {
  if (!window.confirm(`确认删除用户“${nickname}”吗？删除后该账号将无法登录。`)) {
    return;
  }

  try {
    const data = await request(`/api/admin/users/${userId}`, { method: 'DELETE' });
    setStatus(elements.adminStatus, data.message, 'success');
    showToast(data.message, 'success');
    await refreshUsers();
  } catch (error) {
    setStatus(elements.adminStatus, error.message, 'error');
    showToast(error.message, 'error');
  }
}

function handleClearMood() {
  elements.moodContent.value = '';
  updateMoodCounter();
  setStatus(elements.moodStatus, '已清空输入框。');
}

function handleTimelineFilterClick(filter) {
  state.timelineFilter = filter;
  renderTimeline();
}

function bindEvents() {
  elements.segmentButtons.forEach((button) => {
    button.addEventListener('click', () => setAuthMode(button.dataset.mode));
  });
  elements.filterButtons.forEach((button) => {
    button.addEventListener('click', () => handleTimelineFilterClick(button.dataset.filter));
  });
  elements.authForm.addEventListener('submit', handleAuthSubmit);
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.moodForm.addEventListener('submit', handleMoodSubmit);
  elements.moodContent.addEventListener('input', updateMoodCounter);
  elements.clearMoodButton.addEventListener('click', handleClearMood);
  elements.refreshButton.addEventListener('click', async () => {
    await refreshMoods();
    showToast('心情时间线已刷新。', 'info');
  });
  elements.adminCreateForm.addEventListener('submit', handleAdminCreate);
}

async function bootstrap() {
  bindEvents();
  setAuthMode('login');
  updateMoodCounter();
  renderMoodTypes();
  await refreshCurrentUser();
  await refreshMoods();
  await refreshUsers();
}

bootstrap().catch((error) => {
  setStatus(elements.authStatus, error.message, 'error');
  showToast(error.message, 'error');
});
