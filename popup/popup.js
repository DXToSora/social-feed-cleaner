/**
 * Popup 弹出窗口逻辑
 *
 * 三个标签页：
 *   1. 过滤规则 — 规则的增删改查、启用/禁用、预设规则导入
 *   2. 发布者档案 — 查看发布者违规记录、信任/清除
 *   3. 已读历史 — 统计查看、清除
 */

'use strict';

// ==================== DOM 引用 ====================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
  engineToggle: $('#engineToggle'),
  platformLabel: $('#platformLabel'),
  statsSummary: $('#statsSummary'),

  // 标签页
  tabs: $$('.tab'),
  panels: $$('.panel'),

  // 规则
  ruleInput: $('#ruleInput'),
  addRuleBtn: $('#addRuleBtn'),
  ruleList: $('#ruleList'),
  ruleCount: $('#ruleCount'),
  addPresetBtn: $('#addPresetBtn'),
  presetPanel: $('#presetPanel'),
  presetList: $('#presetList'),
  closePresetBtn: $('#closePresetBtn'),

  // 发布者
  publisherList: $('#publisherList'),
  publisherCount: $('#publisherCount'),
  noPublishers: $('#noPublishers'),
  clearAllPublishersBtn: $('#clearAllPublishersBtn'),

  // 已读
  readTotal: $('#readTotal'),
  readToday: $('#readToday'),
  clearReadPlatformBtn: $('#clearReadPlatformBtn'),
  clearReadAllBtn: $('#clearReadAllBtn'),
};

// ==================== 初始化 ====================

let currentPlatform = '--';

function setStatus(msg) {
  const el = document.getElementById('initStatus');
  if (el) el.textContent = msg;
}

async function init() {
  console.log('[Popup] 初始化开始...');
  setStatus('步骤1: 获取平台...');

  // 获取当前平台
  try {
    const session = await chrome.storage.session.get('currentPlatform');
    if (session.currentPlatform) {
      currentPlatform = session.currentPlatform;
    }
    console.log('[Popup] 当前平台:', currentPlatform);
    setStatus('步骤1完成: ' + currentPlatform);
  } catch (e) {
    console.warn('[Popup] 获取平台失败，使用默认值:', e);
    setStatus('步骤1失败: ' + e.message);
  }

  DOM.platformLabel.textContent = `当前平台: ${currentPlatformName(currentPlatform)}`;

  // 获取设置
  console.log('[Popup] 加载设置...');
  setStatus('步骤2: 加载设置...');
  const settings = await Storage.getSettings();
  console.log('[Popup] 设置:', settings);
  setStatus('步骤2完成: engineEnabled=' + settings.engineEnabled);
  DOM.engineToggle.checked = settings.engineEnabled;

  // 初始化各面板
  console.log('[Popup] 刷新规则...');
  setStatus('步骤3: 刷新规则...');
  await refreshRules();
  setStatus('步骤3完成: 规则已加载');

  console.log('[Popup] 刷新发布者...');
  setStatus('步骤4: 刷新发布者...');
  await refreshPublishers();
  setStatus('步骤4完成');

  console.log('[Popup] 刷新已读统计...');
  setStatus('步骤5: 刷新已读统计...');
  await refreshReadStats();
  setStatus('步骤5完成');

  console.log('[Popup] 刷新统计摘要...');
  setStatus('步骤6: 刷新统计摘要...');
  await refreshStatsSummary();
  setStatus('步骤6完成');

  // 绑定事件
  console.log('[Popup] 绑定事件...');
  setStatus('步骤7: 绑定事件...');
  bindEvents();
  setStatus('✅ 初始化完成');
  console.log('[Popup] 初始化完成');
}

function currentPlatformName(name) {
  const map = { weibo: '微博', xiaohongshu: '小红书' };
  return map[name] || name || '--';
}

// ==================== 标签页切换 ====================

function bindEvents() {
  // 标签页切换
  DOM.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 引擎开关
  DOM.engineToggle.addEventListener('change', async () => {
    const enabled = DOM.engineToggle.checked;
    await chrome.runtime.sendMessage({ type: MSG.TOGGLE_ENGINE, enabled });
  });

  // 添加规则
  DOM.addRuleBtn.addEventListener('click', addRule);
  DOM.ruleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addRule();
  });

  // 预设规则
  DOM.addPresetBtn.addEventListener('click', togglePresetPanel);
  DOM.closePresetBtn.addEventListener('click', togglePresetPanel);

  // 发布者清除
  DOM.clearAllPublishersBtn.addEventListener('click', clearAllPublishers);

  // 已读清除
  DOM.clearReadPlatformBtn.addEventListener('click', () => clearReadHistory(currentPlatform));
  DOM.clearReadAllBtn.addEventListener('click', () => clearReadHistory(null));

  // 监听来自 Service Worker 的消息（用于实时更新）
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MSG.PUBLISHER_UPDATED || message.type === MSG.READ_HISTORY_UPDATED) {
      refreshPublishers();
      refreshReadStats();
      refreshStatsSummary();
    }
  });
}

function switchTab(tabName) {
  DOM.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  DOM.panels.forEach(p => p.classList.toggle('active', p.id === `panel-${tabName}`));
}

// ==================== 规则管理 ====================

async function addRule() {
  const input = DOM.ruleInput.value.trim();
  if (!input) return;

  const rule = RuleParser.parse(input, {
    action: ACTION.FOLD,
    platforms: [],
  });

  if (!rule || rule.keywords.length === 0) {
    alert('未能识别关键词，请尝试更具体的描述。\n例如：「屏蔽焦虑」「屏蔽广告和推广」');
    return;
  }

  const rules = await Storage.getRules();
  rules.push(rule);
  await Storage.setRules(rules);

  DOM.ruleInput.value = '';
  await refreshRules();

  // 通知 Content Script 重新加载规则
  chrome.runtime.sendMessage({ type: MSG.RULES_UPDATED }).catch(() => {});
}

async function refreshRules() {
  const rules = await Storage.getRules();
  const enabledRules = rules.filter(r => r.enabled);
  DOM.ruleCount.textContent = enabledRules.length;

  DOM.ruleList.innerHTML = '';
  if (rules.length === 0) {
    DOM.ruleList.innerHTML = '<li class="empty-state">还没有规则，在上方添加你的第一条</li>';
    return;
  }

  rules.forEach(rule => {
    const li = document.createElement('li');
    li.className = 'rule-item';
    li.innerHTML = `
      <label class="switch rule-toggle" style="width:28px;height:16px;">
        <input type="checkbox" ${rule.enabled ? 'checked' : ''} data-rule-id="${rule.id}">
        <span class="switch-slider"></span>
      </label>
      <span class="rule-text ${rule.enabled ? '' : 'rule-disabled'}">${escapeHtml(rule.raw || rule.keywords.join('、'))}</span>
      ${rule.isPreset ? '<span class="rule-preset-badge">预设</span>' : ''}
      <span class="rule-hits">${rule.hitCount || 0}次</span>
      <button class="rule-delete" data-rule-id="${rule.id}" title="删除">×</button>
    `;

    // 启用/禁用切换
    li.querySelector('.rule-toggle input').addEventListener('change', async (e) => {
      await toggleRule(rule.id, e.target.checked);
    });

    // 删除
    li.querySelector('.rule-delete').addEventListener('click', async () => {
      await deleteRule(rule.id);
    });

    DOM.ruleList.appendChild(li);
  });

  // 更新预设规则面板
  await refreshPresets(rules);
}

async function toggleRule(ruleId, enabled) {
  const rules = await Storage.getRules();
  const rule = rules.find(r => r.id === ruleId);
  if (rule) {
    rule.enabled = enabled;
    await Storage.setRules(rules);
    await refreshRules();
    chrome.runtime.sendMessage({ type: MSG.RULES_UPDATED }).catch(() => {});
  }
}

async function deleteRule(ruleId) {
  const rules = await Storage.getRules();
  const updated = rules.filter(r => r.id !== ruleId);
  await Storage.setRules(updated);
  await refreshRules();
  chrome.runtime.sendMessage({ type: MSG.RULES_UPDATED }).catch(() => {});
}

// ==================== 预设规则 ====================

function togglePresetPanel() {
  DOM.presetPanel.classList.toggle('hidden');
}

async function refreshPresets(existingRules) {
  DOM.presetList.innerHTML = '';

  PRESET_RULES.forEach(preset => {
    const alreadyAdded = existingRules.some(r => r.id === preset.id);
    const li = document.createElement('li');
    li.className = 'rule-item';
    li.innerHTML = `
      <span class="rule-text">${escapeHtml(preset.raw)}</span>
      <span class="rule-preset-badge">${preset.category || '预设'}</span>
      ${alreadyAdded
        ? '<button class="btn btn-sm" disabled>已添加</button>'
        : '<button class="btn btn-sm btn-primary" data-preset-id="${preset.id}">添加</button>'}
    `;

    if (!alreadyAdded) {
      li.querySelector('button').addEventListener('click', async () => {
        const rules = await Storage.getRules();
        preset.enabled = true;
        rules.push({ ...preset });
        await Storage.setRules(rules);
        await refreshRules();
        chrome.runtime.sendMessage({ type: MSG.RULES_UPDATED }).catch(() => {});
      });
    }

    DOM.presetList.appendChild(li);
  });
}

// ==================== 发布者档案 ====================

async function refreshPublishers() {
  await PublisherTracker.refresh();
  const profiles = PublisherTracker.getAllProfiles();

  DOM.publisherCount.textContent = profiles.length;
  DOM.publisherList.innerHTML = '';

  if (profiles.length === 0) {
    DOM.noPublishers.classList.remove('hidden');
    return;
  }

  DOM.noPublishers.classList.add('hidden');

  profiles.slice(0, 20).forEach(({ key, profile }) => {
    const level = PublisherTracker.getLevelFromCount(profile.totalInfractions);
    const levelIcon = { light: '📌', medium: '⚠', heavy: '🚫' }[level];
    const levelClass = { light: 'pub-count-light', medium: 'pub-count-medium', heavy: 'pub-count-heavy' }[level];
    const isWhitelisted = PublisherTracker.isWhitelisted(profile.platform, profile.authorId);

    const li = document.createElement('li');
    li.className = `publisher-item ${isWhitelisted ? 'whitelisted' : ''}`;
    li.innerHTML = `
      <span class="pub-level">${levelIcon}</span>
      <span class="pub-name" title="${profile.authorName}">${escapeHtml(profile.authorName)}</span>
      <span class="pub-count ${levelClass}">${profile.totalInfractions}次</span>
      <span class="pub-actions">
        ${isWhitelisted
          ? '<button class="pub-btn trust" data-action="untrust">取消信任</button>'
          : '<button class="pub-btn trust" data-action="trust">信任</button>'}
        <button class="pub-btn clear" data-action="clear">清除记录</button>
      </span>
    `;

    const platform = profile.platform;
    const authorId = profile.authorId;

    li.querySelector('[data-action="trust"]')?.addEventListener('click', async () => {
      await PublisherTracker.addToWhitelist(platform, authorId);
      await refreshPublishers();
      chrome.runtime.sendMessage({ type: MSG.ADD_WHITELIST_PUBLISHER, publisherKey: key }).catch(() => {});
    });

    li.querySelector('[data-action="untrust"]')?.addEventListener('click', async () => {
      await PublisherTracker.removeFromWhitelist(platform, authorId);
      await refreshPublishers();
      chrome.runtime.sendMessage({ type: MSG.REMOVE_WHITELIST_PUBLISHER, publisherKey: key }).catch(() => {});
    });

    li.querySelector('[data-action="clear"]')?.addEventListener('click', async () => {
      await PublisherTracker.clearPublisher(platform, authorId);
      await refreshPublishers();
      chrome.runtime.sendMessage({ type: MSG.CLEAR_PUBLISHER, publisherKey: key }).catch(() => {});
    });

    DOM.publisherList.appendChild(li);
  });
}

async function clearAllPublishers() {
  if (!confirm('确定要清除所有发布者档案记录吗？此操作不可恢复。')) return;
  await Storage.setPublisherStats({});
  PublisherTracker.refresh();
  await refreshPublishers();
}

// ==================== 已读历史 ====================

async function refreshReadStats() {
  await ReadHistory.init();
  const stats = ReadHistory.getStats();
  DOM.readTotal.textContent = stats.total;
  DOM.readToday.textContent = stats.today;
}

async function clearReadHistory(platform) {
  const msg = platform
    ? `确定要清除「${currentPlatformName(platform)}」的已读记录吗？`
    : '确定要清除所有已读记录吗？此操作不可恢复。';

  if (!confirm(msg)) return;

  await chrome.runtime.sendMessage({
    type: MSG.CLEAR_READ_HISTORY,
    platform: platform,
  });
  ReadHistory.clearAll(); // 刷新本地缓存
  await refreshReadStats();
  refreshStatsSummary();
}

// ==================== 统计数据 ====================

async function refreshStatsSummary() {
  try {
    const stats = await chrome.runtime.sendMessage({ type: MSG.GET_STATS });
    const totalFiltered = stats.totalFiltered || 0;
    const readStats = ReadHistory.getStats();
    DOM.statsSummary.textContent = `已过滤: ${totalFiltered} 条 · 已读: ${readStats.total} 条`;
  } catch (e) {
    DOM.statsSummary.textContent = '统计加载中...';
  }
}

// ==================== 辅助 ====================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== 启动 ====================

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('[Popup] 初始化失败:', err);
    // 即使初始化失败也绑定基本事件
    try { bindEvents(); } catch(e) {}
  });
});
