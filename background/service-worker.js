/**
 * Service Worker
 * 职责：
 *   1. 扩展安装/更新时初始化存储
 *   2. 接收 Content Script 统计上报并存入 storage
 *   3. 转发 Popup ↔ Content Script 消息
 *   4. 平台判断辅助
 */

'use strict';

// 加载共享模块（Service Worker 是经典脚本，用 importScripts）
importScripts(
  '/shared/storage.js',
  '/shared/rule-types.js',
  '/shared/message-types.js',
  '/rules/presets.js'
);

// ==================== 生命周期 ====================

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[净化器] 扩展已安装/更新:', details.reason);

  // 首次安装时写入默认设置
  if (details.reason === 'install') {
    await Storage.setSettings(DEFAULT_SETTINGS);
    // 将预设规则写入（但默认禁用）
    const existingRules = await Storage.getRules();
    const presetIds = existingRules.filter(r => r.isPreset).map(r => r.id);
    const newPresets = PRESET_RULES.filter(p => !presetIds.includes(p.id));
    if (newPresets.length > 0) {
      await Storage.setRules([...existingRules, ...newPresets]);
    }
    console.log('[净化器] 首次安装，已写入默认设置和预设规则');
  }
});

// Service Worker 启动时清理过期数据
Storage.cleanupExpired().catch(e => console.error('[净化器] 清理过期数据失败:', e));

// ==================== 消息路由 ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 处理需要异步响应的消息
  handleMessage(message, sender)
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ error: error.message }));

  // 返回 true 表示会异步调用 sendResponse
  return true;
});

async function handleMessage(message, sender) {
  const { type } = message;

  switch (type) {

    // --- 统计数据 ---
    case MSG.GET_STATS: {
      return await Storage.getStats();
    }

    case MSG.STATS_REPORT: {
      const stats = await Storage.getStats();
      if (message.hitRuleId) {
        stats.ruleHits[message.hitRuleId] = (stats.ruleHits[message.hitRuleId] || 0) + 1;
        stats.totalFiltered = (stats.totalFiltered || 0) + 1;
        await Storage.setStats(stats);
      }
      return { success: true, stats };
    }

    // --- 规则管理 ---
    case MSG.RULES_UPDATED: {
      // 规则已由 Popup 通过 storage 更新，转发通知到 Content Script
      const tab = await getActiveTab();
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: MSG.RULES_UPDATED }).catch(() => {});
      }
      return { success: true };
    }

    // --- 引擎开关 ---
    case MSG.TOGGLE_ENGINE: {
      const settings = await Storage.getSettings();
      settings.engineEnabled = message.enabled;
      await Storage.setSettings(settings);
      const tab = await getActiveTab();
      if (tab) {
        chrome.tabs.sendMessage(tab.id, {
          type: MSG.TOGGLE_ENGINE,
          enabled: settings.engineEnabled,
        }).catch(() => {});
      }
      return { success: true, enabled: settings.engineEnabled };
    }

    // --- 发布者档案 ---
    case MSG.GET_PUBLISHER_STATS: {
      return await Storage.getPublisherStats();
    }

    case MSG.CLEAR_PUBLISHER: {
      const stats = await Storage.getPublisherStats();
      if (message.publisherKey) {
        delete stats[message.publisherKey];
      }
      await Storage.setPublisherStats(stats);
      return { success: true };
    }

    case MSG.ADD_WHITELIST_PUBLISHER: {
      const whitelist = await Storage.getPublisherWhitelist();
      if (!whitelist.includes(message.publisherKey)) {
        whitelist.push(message.publisherKey);
        await Storage.setPublisherWhitelist(whitelist);
      }
      return { success: true };
    }

    case MSG.REMOVE_WHITELIST_PUBLISHER: {
      const whitelist = await Storage.getPublisherWhitelist();
      const idx = whitelist.indexOf(message.publisherKey);
      if (idx >= 0) {
        whitelist.splice(idx, 1);
        await Storage.setPublisherWhitelist(whitelist);
      }
      return { success: true };
    }

    // --- 已读历史 ---
    case MSG.GET_READ_HISTORY: {
      return await Storage.getReadHistory();
    }

    case MSG.CLEAR_READ_HISTORY: {
      if (message.platform) {
        // 按平台清除
        const history = await Storage.getReadHistory();
        for (const key of Object.keys(history)) {
          if (key.startsWith(message.platform + ':')) {
            delete history[key];
          }
        }
        await Storage.setReadHistory(history);
      } else {
        // 全部清除
        await Storage.setReadHistory({});
      }
      return { success: true };
    }

    // --- 平台检测 ---
    case MSG.PLATFORM_DETECTED: {
      // Content Script 上报检测到的平台，Service Worker 缓存用于 Popup 显示
      await chrome.storage.session.set({ currentPlatform: message.platform });
      return { success: true };
    }

    default:
      return { error: `未知消息类型: ${type}` };
  }
}

// ==================== 辅助函数 ====================

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}
