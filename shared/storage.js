/**
 * chrome.storage 读写封装
 * - sync: 跨设备同步（规则、设置）
 * - local: 本地大数据（统计、发布者档案、已读历史）
 */

'use strict';

var Storage = {
  // ==================== 同步存储（sync） ====================

  /** 获取所有规则 */
  async getRules() {
    const result = await chrome.storage.sync.get('rules');
    return result.rules || [];
  },

  /** 保存规则列表 */
  async setRules(rules) {
    await chrome.storage.sync.set({ rules });
  },

  /** 获取设置 */
  async getSettings() {
    const result = await chrome.storage.sync.get('settings');
    return Object.assign({}, DEFAULT_SETTINGS, result.settings || {});
  },

  /** 保存设置 */
  async setSettings(settings) {
    await chrome.storage.sync.set({ settings });
  },

  // ==================== 本地存储（local） ====================

  /** 获取统计数据 */
  async getStats() {
    const result = await chrome.storage.local.get('stats');
    return result.stats || { totalFiltered: 0, ruleHits: {} };
  },

  /** 保存统计数据 */
  async setStats(stats) {
    await chrome.storage.local.set({ stats });
  },

  /** 获取发布者档案 */
  async getPublisherStats() {
    const result = await chrome.storage.local.get('publisherStats');
    return result.publisherStats || {};
  },

  /** 保存发布者档案 */
  async setPublisherStats(publisherStats) {
    await chrome.storage.local.set({ publisherStats });
  },

  /** 获取发布者白名单 */
  async getPublisherWhitelist() {
    const result = await chrome.storage.local.get('publisherWhitelist');
    return result.publisherWhitelist || [];
  },

  /** 保存发布者白名单 */
  async setPublisherWhitelist(whitelist) {
    await chrome.storage.local.set({ publisherWhitelist: whitelist });
  },

  /** 获取已读历史 */
  async getReadHistory() {
    const result = await chrome.storage.local.get('readHistory');
    return result.readHistory || {};
  },

  /** 保存已读历史 */
  async setReadHistory(readHistory) {
    await chrome.storage.local.set({ readHistory });
  },

  // ==================== 工具方法 ====================

  /** 生成唯一 ID */
  generateId() {
    return 'rule_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  },

  /** 生成复合键（平台+ID） */
  makeKey(platform, id) {
    return `${platform}:${id}`;
  },

  /** 清理过期数据 */
  async cleanupExpired() {
    const now = Date.now();
    const settings = await this.getSettings();

    // 清理已读历史
    const readHistory = await this.getReadHistory();
    const retentionMs = settings.readHistoryRetentionDays * 24 * 60 * 60 * 1000;
    let cleaned = false;
    const entries = Object.entries(readHistory);
    // 超量淘汰（最旧的先删）
    if (entries.length > settings.readHistoryMaxSize) {
      const sorted = entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      const toDelete = sorted.slice(0, entries.length - settings.readHistoryMaxSize);
      toDelete.forEach(([k]) => { delete readHistory[k]; });
      cleaned = true;
    }
    // 超时淘汰
    for (const [key, entry] of Object.entries(readHistory)) {
      if (now - entry.lastSeen > retentionMs) {
        delete readHistory[key];
        cleaned = true;
      }
    }
    if (cleaned) await this.setReadHistory(readHistory);

    // 清理发布者档案
    const publisherStats = await this.getPublisherStats();
    const pubRetentionMs = settings.publisherRetentionDays * 24 * 60 * 60 * 1000;
    let pubCleaned = false;
    for (const [key, stat] of Object.entries(publisherStats)) {
      if (stat.lastHitAt && now - stat.lastHitAt > pubRetentionMs) {
        delete publisherStats[key];
        pubCleaned = true;
      }
    }
    if (pubCleaned) await this.setPublisherStats(publisherStats);
  },
};
