const CLIENT_MARKER = 'MTC1';

const categoryOrder = ['positive', 'neutral', 'negative'];
const categories = {
  positive: {
    label: '正向',
    score: 1,
    tags: ['开心', '放松', '感激', '期待', '满足', '自信'],
  },
  neutral: {
    label: '中性',
    score: 0,
    tags: ['平静', '思考', '专注', '普通', '观望', '疲惫'],
  },
  negative: {
    label: '负向',
    score: -1,
    tags: ['焦虑', '难过', '烦躁', '压力', '低落', '委屈'],
  },
};

const state = {
  authMode: 'login',
  currentUser: null,
  records: [],
  selectedCategory: 'positive',
  selectedTag: '开心',
  editingRecordId: null,
  period: 'week',
  anchorDate: '',
  lastSyncedAt: null,
};

const elements = {
  serviceDot: document.getElementById('serviceDot'),
  serviceStatus: document.getElementById('serviceStatus'),
  syncMeta: document.getElementById('syncMeta'),
  authBadge: document.getElementById('authBadge'),
  guestAuth: document.getElementById('guestAuth'),
  profilePanel: document.getElementById('profilePanel'),
  profileAvatar: document.getElementById('profileAvatar'),
  profileName: document.getElementById('profileName'),
  profileMeta: document.getElementById('profileMeta'),
  authForm: document.getElementById('authForm'),
  authAccount: document.getElementById('authAccount'),
  authNickname: document.getElementById('authNickname'),
  authPassword: document.getElementById('authPassword'),
  nicknameField: document.getElementById('nicknameField'),
  authSubmit: document.getElementById('authSubmit'),
  authStatus: document.getElementById('authStatus'),
  logoutButton: document.getElementById('logoutButton'),
  categorySegments: document.getElementById('categorySegments'),
  tagGrid: document.getElementById('tagGrid'),
  customTag: document.getElementById('customTag'),
  occurredAt: document.getElementById('occurredAt'),
  description: document.getElementById('description'),
  descriptionCounter: document.getElementById('descriptionCounter'),
  moodForm: document.getElementById('moodForm'),
  moodSubmit: document.getElementById('moodSubmit'),
  moodStatus: document.getElementById('moodStatus'),
  composerTitle: document.getElementById('composerTitle'),
  recordModeChip: document.getElementById('recordModeChip'),
  cancelEditButton: document.getElementById('cancelEditButton'),
  refreshButton: document.getElementById('refreshButton'),
  periodSegments: document.getElementById('periodSegments'),
  anchorDate: document.getElementById('anchorDate'),
  metricGrid: document.getElementById('metricGrid'),
  distributionChart: document.getElementById('distributionChart'),
  trendChart: document.getElementById('trendChart'),
  reportBody: document.getElementById('reportBody'),
  reportPeriod: document.getElementById('reportPeriod'),
  recordList: document.getElementById('recordList'),
  recordCount: document.getElementById('recordCount'),
  toastStack: document.getElementById('toastStack'),
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
  }, 2800);
}

function setBusy(button, busy, idleText, busyText) {
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
    const error = new Error(data.message || '请求失败，请稍后重试。');
    error.status = response.status;
    throw error;
  }

  return data;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDatetimeLocalValue(date) {
  return `${toDateInputValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) {
    return '-';
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) {
    return '-';
  }

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function normalizeTag(tag) {
  return String(tag || '')
    .trim()
    .replace(/[|[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 16);
}

function categoryLabel(category) {
  return categories[category] ? categories[category].label : '中性';
}

function inferCategory(moodType) {
  const text = String(moodType || '');
  if (text.includes('正向') || text.includes('开心') || text.includes('庆祝')) {
    return 'positive';
  }
  if (text.includes('负向') || text.includes('难过') || text.includes('烦躁') || text.includes('焦虑')) {
    return 'negative';
  }
  return 'neutral';
}

function inferTag(moodType, category) {
  const text = String(moodType || '').replace(/[😊😌😢😤🤔🥳]/g, '').trim();
  const knownTag = categories[category].tags.find((tag) => text.includes(tag));
  if (knownTag) {
    return knownTag;
  }

  return categories[category].tags[0];
}

function buildClientContent(input) {
  const tag = normalizeTag(input.tag);
  const marker = `[${CLIENT_MARKER}|${input.category}|${tag}|${input.occurredAt}]`;
  const description = String(input.description || '').trim();
  const content = `${description}\n\n${marker}`.trim();

  if (content.length > 300) {
    throw new Error('描述过长，和结构化同步信息合计不能超过 300 个字符。');
  }

  return content;
}

function buildMoodPayload(input) {
  const tag = normalizeTag(input.tag);
  const moodType = `${categoryLabel(input.category)} · ${tag}`.slice(0, 32);

  return {
    moodType,
    content: buildClientContent({
      category: input.category,
      tag,
      occurredAt: input.occurredAt,
      description: input.description,
    }),
  };
}

function parseClientRecord(mood) {
  const content = String(mood.content || '');
  const match = content.match(/\n{0,2}\[MTC1\|([^|]+)\|([^|]*)\|([^\]]+)\]\s*$/);
  const fallbackCategory = inferCategory(mood.moodType);

  if (!match) {
    return {
      id: Number(mood.id),
      original: mood,
      author: mood.author,
      category: fallbackCategory,
      tag: inferTag(mood.moodType, fallbackCategory),
      description: content,
      occurredAt: mood.publishedAt,
      publishedAt: mood.publishedAt,
      status: mood.status,
      isClientRecord: false,
    };
  }

  const category = categories[match[1]] ? match[1] : fallbackCategory;
  const tag = normalizeTag(match[2]) || inferTag(mood.moodType, category);
  const description = content.slice(0, match.index).trim();

  return {
    id: Number(mood.id),
    original: mood,
    author: mood.author,
    category,
    tag,
    description,
    occurredAt: match[3] || mood.publishedAt,
    publishedAt: mood.publishedAt,
    status: mood.status,
    isClientRecord: true,
  };
}

function getSelectedTag() {
  const customTag = normalizeTag(elements.customTag.value);
  return customTag || state.selectedTag;
}

function getSortedRecords() {
  return [...state.records].sort((a, b) => {
    const left = parseDate(a.occurredAt) || parseDate(a.publishedAt) || new Date(0);
    const right = parseDate(b.occurredAt) || parseDate(b.publishedAt) || new Date(0);
    return right.getTime() - left.getTime();
  });
}

function savePreferences() {
  const payload = {
    period: state.period,
    anchorDate: state.anchorDate,
  };
  localStorage.setItem('mood-client-preferences', JSON.stringify(payload));
}

function loadPreferences() {
  try {
    const payload = JSON.parse(localStorage.getItem('mood-client-preferences') || '{}');
    state.period = payload.period || 'week';
    state.anchorDate = payload.anchorDate || toDateInputValue(new Date());
  } catch (error) {
    state.period = 'week';
    state.anchorDate = toDateInputValue(new Date());
  }
}

function setAuthMode(mode) {
  state.authMode = mode;
  elements.nicknameField.classList.toggle('hidden', mode !== 'register');
  elements.authSubmit.textContent = mode === 'login' ? '登录' : '注册并登录';
  document.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.authMode === mode);
  });
  setStatus(elements.authStatus, mode === 'login' ? '使用原应用账号登录。' : '注册后会写入原应用用户表并自动登录。');
}

function renderAuth() {
  const loggedIn = Boolean(state.currentUser);
  elements.authBadge.textContent = loggedIn ? '已登录' : '未登录';
  elements.guestAuth.classList.toggle('hidden', loggedIn);
  elements.profilePanel.classList.toggle('hidden', !loggedIn);

  if (loggedIn) {
    elements.profileAvatar.textContent = state.currentUser.nickname.slice(0, 1);
    elements.profileName.textContent = state.currentUser.nickname;
    elements.profileMeta.textContent = `${state.currentUser.account} · ${state.currentUser.role === 'admin' ? '管理员' : '普通用户'}`;
  }

  renderFormLockState();
}

function renderFormLockState() {
  const disabled = !state.currentUser;
  [
    elements.occurredAt,
    elements.customTag,
    elements.description,
    elements.moodSubmit,
    elements.cancelEditButton,
  ].forEach((element) => {
    element.disabled = disabled;
  });

  elements.categorySegments.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled;
  });
  elements.tagGrid.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled;
  });
}

function renderCategories() {
  elements.categorySegments.innerHTML = '';
  for (const category of categoryOrder) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'segment';
    button.dataset.category = category;
    button.textContent = categories[category].label;
    button.classList.toggle('is-active', state.selectedCategory === category);
    button.addEventListener('click', () => {
      state.selectedCategory = category;
      state.selectedTag = categories[category].tags[0];
      elements.customTag.value = '';
      renderCategories();
      renderTags();
    });
    elements.categorySegments.appendChild(button);
  }
  renderFormLockState();
}

function renderTags() {
  elements.tagGrid.innerHTML = '';
  for (const tag of categories[state.selectedCategory].tags) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-button';
    button.textContent = tag;
    button.classList.toggle('is-active', state.selectedTag === tag && !elements.customTag.value.trim());
    button.addEventListener('click', () => {
      state.selectedTag = tag;
      elements.customTag.value = '';
      renderTags();
    });
    elements.tagGrid.appendChild(button);
  }
  renderFormLockState();
}

function updateDescriptionCounter() {
  const length = elements.description.value.trim().length;
  elements.descriptionCounter.textContent = `${length} / 180`;
}

function resetMoodForm() {
  state.editingRecordId = null;
  state.selectedCategory = 'positive';
  state.selectedTag = categories.positive.tags[0];
  elements.occurredAt.value = toDatetimeLocalValue(new Date());
  elements.customTag.value = '';
  elements.description.value = '';
  elements.composerTitle.textContent = '新增心情记录';
  elements.recordModeChip.textContent = '实时同步';
  elements.cancelEditButton.classList.add('hidden');
  elements.moodSubmit.textContent = '保存记录';
  updateDescriptionCounter();
  renderCategories();
  renderTags();
}

function startEdit(recordId) {
  const record = state.records.find((item) => Number(item.id) === Number(recordId));
  if (!record) {
    showToast('未找到要编辑的记录，请刷新后重试。', 'error');
    return;
  }

  state.editingRecordId = record.id;
  state.selectedCategory = record.category;
  state.selectedTag = categories[record.category].tags.includes(record.tag)
    ? record.tag
    : categories[record.category].tags[0];
  elements.customTag.value = categories[record.category].tags.includes(record.tag) ? '' : record.tag;
  elements.occurredAt.value = record.occurredAt.includes('T')
    ? record.occurredAt.slice(0, 16)
    : toDatetimeLocalValue(parseDate(record.occurredAt) || new Date());
  elements.description.value = record.description;
  elements.composerTitle.textContent = '编辑心情记录';
  elements.recordModeChip.textContent = `编辑 ID ${record.id}`;
  elements.cancelEditButton.classList.remove('hidden');
  elements.moodSubmit.textContent = '保存编辑';
  updateDescriptionCounter();
  renderCategories();
  renderTags();
  elements.description.focus();
}

function getPeriodRange() {
  const anchor = parseDate(state.anchorDate) || new Date();
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  let end;
  let label;

  if (state.period === 'day') {
    end = new Date(start);
    end.setDate(start.getDate() + 1);
    label = formatDate(start);
  } else if (state.period === 'month') {
    start.setDate(1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    label = `${start.getFullYear()} 年 ${start.getMonth() + 1} 月`;
  } else {
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    end = new Date(start);
    end.setDate(start.getDate() + 7);
    label = `${formatDate(start)} 至 ${formatDate(new Date(end.getTime() - 1))}`;
  }

  return { start, end, label };
}

function getRecordsInPeriod() {
  const { start, end } = getPeriodRange();
  return state.records.filter((record) => {
    const occurred = parseDate(record.occurredAt);
    return occurred && occurred >= start && occurred < end;
  });
}

function summarizeRecords(records) {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  const tagCounts = new Map();
  let scoreSum = 0;

  for (const record of records) {
    counts[record.category] += 1;
    scoreSum += categories[record.category].score;
    tagCounts.set(record.tag, (tagCounts.get(record.tag) || 0) + 1);
  }

  const leadingCategory = categoryOrder.reduce((best, category) => {
    if (counts[category] > counts[best]) {
      return category;
    }
    return best;
  }, 'positive');

  const leadingTag = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const averageScore = records.length ? scoreSum / records.length : 0;

  return {
    counts,
    total: records.length,
    leadingCategory,
    leadingTag: leadingTag ? leadingTag[0] : '-',
    leadingTagCount: leadingTag ? leadingTag[1] : 0,
    averageScore,
  };
}

function renderMetrics(summary) {
  const negativePercent = summary.total
    ? Math.round((summary.counts.negative / summary.total) * 100)
    : 0;
  const positivePercent = summary.total
    ? Math.round((summary.counts.positive / summary.total) * 100)
    : 0;

  const metrics = [
    {
      label: '周期记录',
      value: `${summary.total}`,
      note: '当前筛选范围内',
    },
    {
      label: '主导情绪',
      value: categoryLabel(summary.leadingCategory),
      note: summary.total ? `${summary.counts[summary.leadingCategory]} 次出现` : '暂无样本',
    },
    {
      label: '正向占比',
      value: `${positivePercent}%`,
      note: `${summary.counts.positive} 条正向记录`,
    },
    {
      label: '负向占比',
      value: `${negativePercent}%`,
      note: `${summary.counts.negative} 条负向记录`,
    },
  ];

  elements.metricGrid.innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric-card">
          <p class="metric-label">${escapeHtml(metric.label)}</p>
          <p class="metric-value">${escapeHtml(metric.value)}</p>
          <p class="metric-note">${escapeHtml(metric.note)}</p>
        </article>
      `,
    )
    .join('');
}

function renderDistribution(summary) {
  if (!summary.total) {
    elements.distributionChart.innerHTML = '<div class="empty-state">暂无可统计记录。</div>';
    return;
  }

  elements.distributionChart.innerHTML = categoryOrder
    .map((category) => {
      const count = summary.counts[category];
      const percent = Math.round((count / summary.total) * 100);
      return `
        <div class="bar-row">
          <span class="bar-label">${categoryLabel(category)}</span>
          <span class="bar-track"><span class="bar-fill ${category}" style="width: ${percent}%"></span></span>
          <span class="bar-value">${percent}%</span>
        </div>
      `;
    })
    .join('');
}

function buildBuckets() {
  const { start, end } = getPeriodRange();
  const buckets = [];

  if (state.period === 'day') {
    for (let hour = 0; hour < 24; hour += 4) {
      const bucketStart = new Date(start);
      bucketStart.setHours(hour, 0, 0, 0);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setHours(hour + 4, 0, 0, 0);
      buckets.push({
        start: bucketStart,
        end: bucketEnd,
        label: `${pad(hour)}:00`,
      });
    }
    return buckets;
  }

  const cursor = new Date(start);
  while (cursor < end) {
    const bucketStart = new Date(cursor);
    const bucketEnd = new Date(cursor);
    bucketEnd.setDate(bucketEnd.getDate() + 1);
    buckets.push({
      start: bucketStart,
      end: bucketEnd,
      label: `${bucketStart.getMonth() + 1}/${bucketStart.getDate()}`,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
}

function renderTrend(records) {
  const buckets = buildBuckets();
  const width = 520;
  const height = 188;
  const paddingX = 24;
  const paddingY = 22;

  if (!records.length) {
    elements.trendChart.innerHTML = '<div class="empty-state">记录后会生成周期波动曲线。</div>';
    return;
  }

  const points = buckets.map((bucket, index) => {
    const items = records.filter((record) => {
      const occurred = parseDate(record.occurredAt);
      return occurred && occurred >= bucket.start && occurred < bucket.end;
    });
    const average = items.length
      ? items.reduce((sum, record) => sum + categories[record.category].score, 0) / items.length
      : 0;
    const x = paddingX + (index / Math.max(buckets.length - 1, 1)) * (width - paddingX * 2);
    const y = paddingY + ((1 - average) / 2) * (height - paddingY * 2);

    return {
      x,
      y,
      count: items.length,
      label: bucket.label,
    };
  });

  const path = points.map((point) => `${point.x},${point.y}`).join(' ');
  const circles = points
    .map(
      (point) =>
        `<circle cx="${point.x}" cy="${point.y}" r="${point.count ? 4 : 2.5}" fill="${point.count ? '#237f7a' : '#b9aaa0'}"></circle>`,
    )
    .join('');
  const labels = points.filter((_, index) => {
    if (points.length <= 8) {
      return true;
    }
    return index === 0 || index === Math.floor(points.length / 2) || index === points.length - 1;
  });

  elements.trendChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="情绪周期波动">
      <line x1="${paddingX}" y1="${paddingY}" x2="${paddingX}" y2="${height - paddingY}" stroke="rgba(69,54,44,.16)" />
      <line x1="${paddingX}" y1="${height / 2}" x2="${width - paddingX}" y2="${height / 2}" stroke="rgba(68,105,168,.18)" stroke-dasharray="5 5" />
      <polyline points="${path}" fill="none" stroke="#237f7a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      ${circles}
    </svg>
    <div class="trend-labels">
      ${labels.map((point) => `<span>${escapeHtml(point.label)}</span>`).join('')}
    </div>
  `;
}

function renderReport(records, summary) {
  const range = getPeriodRange();
  elements.reportPeriod.textContent =
    state.period === 'day' ? '按日' : state.period === 'month' ? '按月' : '按周';

  if (!summary.total) {
    elements.reportBody.innerHTML = `
      <div class="report-callout">当前周期还没有心情记录。先记录几条真实场景，报告会自动呈现频次、占比和波动趋势。</div>
      <p>范围：${escapeHtml(range.label)}</p>
    `;
    return;
  }

  const negativePercent = Math.round((summary.counts.negative / summary.total) * 100);
  const positivePercent = Math.round((summary.counts.positive / summary.total) * 100);
  const scores = records.map((record) => categories[record.category].score);
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / scores.length;
  const volatility = Math.sqrt(variance);

  const insights = [];
  if (negativePercent >= 50) {
    insights.push('负向记录占比较高，可能提示近期压力源、睡眠恢复或关系事件需要被更认真地看见。');
  } else if (positivePercent >= 50) {
    insights.push('正向记录占比较高，当前周期的恢复性体验较多，可以留意哪些场景在持续提供能量。');
  } else {
    insights.push('情绪分布较均衡，适合继续观察触发因素和一天内的节奏变化。');
  }

  if (volatility >= 0.75) {
    insights.push('周期内波动幅度偏大，建议关注高低起伏对应的时间段和具体事件。');
  } else {
    insights.push('周期内波动相对平缓，情绪状态的连续性较好。');
  }

  if (summary.leadingTag !== '-') {
    insights.push(`高频标签是“${summary.leadingTag}”，共出现 ${summary.leadingTagCount} 次。`);
  }

  elements.reportBody.innerHTML = `
    <div class="report-callout">
      ${escapeHtml(range.label)} 共记录 ${summary.total} 条，主导情绪为${escapeHtml(categoryLabel(summary.leadingCategory))}。
    </div>
    <p>正向占比 ${positivePercent}%，中性占比 ${Math.round((summary.counts.neutral / summary.total) * 100)}%，负向占比 ${negativePercent}%。</p>
    ${insights.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}
    <p>以上是基于记录数据的初步总结，不等同于心理诊断；如果负向体验持续影响睡眠、工作或关系，建议寻求可信赖的人或专业支持。</p>
  `;
}

function renderStats() {
  document.querySelectorAll('[data-period]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.period === state.period);
  });
  elements.anchorDate.value = state.anchorDate;

  const records = getRecordsInPeriod();
  const summary = summarizeRecords(records);
  renderMetrics(summary);
  renderDistribution(summary);
  renderTrend(records);
  renderReport(records, summary);
}

function renderRecords() {
  const records = getSortedRecords();
  elements.recordCount.textContent = `${records.length} 条记录`;

  if (!state.currentUser) {
    elements.recordList.innerHTML = '<div class="empty-state">登录后会加载你的个人心情记录。</div>';
    return;
  }

  if (!records.length) {
    elements.recordList.innerHTML = '<div class="empty-state">还没有心情记录。新增一条后，统计和报告会同步更新。</div>';
    return;
  }

  elements.recordList.innerHTML = records
    .map(
      (record) => `
        <article class="record-item">
          <div>
            <div class="record-head">
              <span class="record-type">${escapeHtml(categoryLabel(record.category))} · ${escapeHtml(record.tag)}</span>
              <span class="record-time">发生于 ${escapeHtml(formatDateTime(record.occurredAt))}</span>
              <span class="chip">ID ${record.id}</span>
            </div>
            <p class="record-description">${escapeHtml(record.description || '未填写描述')}</p>
          </div>
          <div class="record-actions">
            <button class="secondary-btn compact" type="button" data-action="edit" data-id="${record.id}">编辑</button>
            <button class="danger-btn compact" type="button" data-action="revoke" data-id="${record.id}">撤销</button>
          </div>
        </article>
      `,
    )
    .join('');
}

function renderAll() {
  renderAuth();
  renderRecords();
  renderStats();
  elements.syncMeta.textContent = state.lastSyncedAt
    ? `最近同步 ${formatDateTime(state.lastSyncedAt)}`
    : '尚未同步';
}

async function checkHealth() {
  try {
    const data = await request('/api/health');
    elements.serviceDot.classList.remove('offline');
    elements.serviceDot.classList.add('online');
    elements.serviceStatus.textContent = data.ok ? '原应用服务在线' : '服务状态未知';
  } catch (error) {
    elements.serviceDot.classList.remove('online');
    elements.serviceDot.classList.add('offline');
    elements.serviceStatus.textContent = '原应用服务不可用';
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

async function refreshRecords() {
  if (!state.currentUser) {
    state.records = [];
    state.lastSyncedAt = null;
    renderAll();
    return;
  }

  setBusy(elements.refreshButton, true, '刷新', '同步中');
  try {
    let data;
    try {
      data = await request('/api/client/moods');
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
      data = await request('/api/moods');
    }

    const currentUserId = Number(state.currentUser.id);
    state.records = (data.moods || [])
      .filter((mood) => mood.author && Number(mood.author.id) === currentUserId)
      .map(parseClientRecord);
    state.lastSyncedAt = new Date().toISOString();
    renderAll();
  } catch (error) {
    setStatus(elements.moodStatus, error.message, 'error');
    showToast(error.message, 'error');
  } finally {
    setBusy(elements.refreshButton, false, '刷新', '同步中');
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const account = elements.authAccount.value.trim();
  const password = elements.authPassword.value;
  const nickname = elements.authNickname.value.trim();
  const isLogin = state.authMode === 'login';

  setBusy(elements.authSubmit, true, isLogin ? '登录' : '注册并登录', isLogin ? '登录中' : '注册中');
  try {
    const data = await request(isLogin ? '/api/auth/login' : '/api/auth/register', {
      method: 'POST',
      body: isLogin ? { account, password } : { account, password, nickname },
    });
    state.currentUser = data.user;
    elements.authForm.reset();
    setStatus(elements.authStatus, data.message, 'success');
    showToast(data.message, 'success');
    await refreshRecords();
  } catch (error) {
    setStatus(elements.authStatus, error.message, 'error');
    showToast(error.message, 'error');
  } finally {
    setBusy(elements.authSubmit, false, isLogin ? '登录' : '注册并登录', isLogin ? '登录中' : '注册中');
  }
}

async function handleLogout() {
  setBusy(elements.logoutButton, true, '退出登录', '退出中');
  try {
    const data = await request('/api/auth/logout', { method: 'POST' });
    state.currentUser = null;
    state.records = [];
    resetMoodForm();
    setStatus(elements.authStatus, data.message, 'success');
    showToast(data.message, 'success');
    renderAll();
  } catch (error) {
    setStatus(elements.authStatus, error.message, 'error');
    showToast(error.message, 'error');
  } finally {
    setBusy(elements.logoutButton, false, '退出登录', '退出中');
  }
}

function readFormRecord() {
  const occurredAt = elements.occurredAt.value;
  const description = elements.description.value.trim();
  const tag = getSelectedTag();

  if (!state.currentUser) {
    throw new Error('请先登录后再记录心情。');
  }
  if (!occurredAt) {
    throw new Error('请选择心情发生时间。');
  }
  if (!tag) {
    throw new Error('请选择或输入一个情绪标签。');
  }
  if (!description) {
    throw new Error('请输入情绪描述。');
  }

  return {
    category: state.selectedCategory,
    tag,
    occurredAt,
    description,
  };
}

async function handleMoodSubmit(event) {
  event.preventDefault();

  let formRecord;
  try {
    formRecord = readFormRecord();
  } catch (error) {
    setStatus(elements.moodStatus, error.message, 'error');
    showToast(error.message, 'error');
    return;
  }

  const isEditing = Boolean(state.editingRecordId);
  setBusy(elements.moodSubmit, true, isEditing ? '保存编辑' : '保存记录', isEditing ? '保存中' : '提交中');
  try {
    const payload = buildMoodPayload(formRecord);
    if (!isEditing) {
      const data = await request('/api/moods', { method: 'POST', body: payload });
      setStatus(elements.moodStatus, data.message, 'success');
      showToast('心情记录已提交并同步。', 'success');
    } else {
      const oldRecordId = state.editingRecordId;
      const created = await request('/api/moods', { method: 'POST', body: payload });
      try {
        await request(`/api/moods/${oldRecordId}`, { method: 'DELETE' });
      } catch (error) {
        await request(`/api/moods/${created.mood.id}`, { method: 'DELETE' }).catch(() => {});
        throw new Error(`编辑失败：${error.message}`);
      }
      setStatus(elements.moodStatus, '编辑已保存，旧记录已撤销。', 'success');
      showToast('编辑已同步到原应用数据库。', 'success');
    }

    resetMoodForm();
    await refreshRecords();
  } catch (error) {
    setStatus(elements.moodStatus, error.message, 'error');
    showToast(error.message, 'error');
  } finally {
    setBusy(elements.moodSubmit, false, isEditing ? '保存编辑' : '保存记录', isEditing ? '保存中' : '提交中');
  }
}

async function revokeRecord(recordId) {
  if (!window.confirm(`确认撤销 ID ${recordId} 的心情记录吗？`)) {
    return;
  }

  try {
    const data = await request(`/api/moods/${recordId}`, { method: 'DELETE' });
    if (Number(state.editingRecordId) === Number(recordId)) {
      resetMoodForm();
    }
    setStatus(elements.moodStatus, data.message, 'success');
    showToast(data.message, 'success');
    await refreshRecords();
  } catch (error) {
    setStatus(elements.moodStatus, error.message, 'error');
    showToast(error.message, 'error');
  }
}

function handleRecordAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const recordId = Number(button.dataset.id);
  if (button.dataset.action === 'edit') {
    startEdit(recordId);
  } else if (button.dataset.action === 'revoke') {
    revokeRecord(recordId);
  }
}

function bindEvents() {
  document.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
  });
  document.querySelectorAll('[data-period]').forEach((button) => {
    button.addEventListener('click', () => {
      state.period = button.dataset.period;
      savePreferences();
      renderStats();
    });
  });
  elements.anchorDate.addEventListener('change', () => {
    state.anchorDate = elements.anchorDate.value || toDateInputValue(new Date());
    savePreferences();
    renderStats();
  });
  elements.authForm.addEventListener('submit', handleAuthSubmit);
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.moodForm.addEventListener('submit', handleMoodSubmit);
  elements.cancelEditButton.addEventListener('click', resetMoodForm);
  elements.description.addEventListener('input', updateDescriptionCounter);
  elements.customTag.addEventListener('input', renderTags);
  elements.refreshButton.addEventListener('click', async () => {
    await checkHealth();
    await refreshRecords();
    showToast('客户端数据已刷新。', 'info');
  });
  elements.recordList.addEventListener('click', handleRecordAction);
}

async function bootstrap() {
  loadPreferences();
  bindEvents();
  elements.anchorDate.value = state.anchorDate;
  resetMoodForm();
  setAuthMode('login');
  await checkHealth();
  await refreshCurrentUser();
  await refreshRecords();
}

bootstrap().catch((error) => {
  setStatus(elements.authStatus, error.message, 'error');
  showToast(error.message, 'error');
});
