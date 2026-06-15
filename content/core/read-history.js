/**
 * 已读历史管理器
 *
 * 记录用户浏览过的帖子，用于淡化已读内容和避免重复点击。
 * 数据存储在 chrome.storage.local 中。
 *
 * 关键行为：
 *   - isRead(): 检查帖子是否已读
 *   - record(): 记录帖子为已读
 *   - getStats(): 获取已读统计
 *   - cleanup(): 清理过期记录
 */

'use strict';

var ReadHistory = {

  /** @type {Object} 已读历史缓存（key = "平台:postId"） */
  _cache: {},

  /** @type {boolean} 是否已初始化 */
  _initialized: false,

  /** @type {number} 今日已读数（仅内存） */
  _todayCount: 0,

  /** 今天 0 点的时间戳 */
  _todayStart: 0,

  // ==================== 初始化 ====================

  async init() {
    if (this._initialized) return;
    this._cache = await Storage.getReadHistory();
    this._todayStart = this._getTodayStart();
    this._countToday();
    this._initialized = true;
  },

  // ==================== 查询接口 ====================

  /**
   * 检查帖子是否已读
   * @param {string} platform
   * @param {string} postId
   * @returns {ReadRecord|null}
   */
  getRecord(platform, postId) {
    const key = Storage.makeKey(platform, postId);
    return this._cache[key] || null;
  },

  /**
   * 检查是否已读
   * @param {string} platform
   * @param {string} postId
   * @returns {boolean}
   */
  isRead(platform, postId) {
    return !!this.getRecord(platform, postId);
  },

  // ==================== 记录已读 ====================

  /**
   * 记录帖子为已读
   * @param {string} platform
   * @param {string} postId
   * @param {Object} [meta] - 附加信息
   * @param {string} [meta.title]
   * @param {string} [meta.url]
   * @param {string} [meta.trigger] - READ_TRIGGER 类型
   */
  async record(platform, postId, meta = {}) {
    if (!platform || !postId) return;

    if (!this._initialized) await this.init();

    const key = Storage.makeKey(platform, postId);
    const now = Date.now();
    const existing = this._cache[key];

    if (existing) {
      existing.lastSeen = now;
      existing.viewCount = (existing.viewCount || 1) + 1;
    } else {
      this._cache[key] = {
        postId: postId,
        platform: platform,
        title: (meta.title || '').slice(0, 100),
        url: meta.url || '',
        firstSeen: now,
        lastSeen: now,
        viewCount: 1,
        trigger: meta.trigger || '',
      };
    }

    // 今日计数
    if (now >= this._todayStart) {
      this._todayCount++;
    }

    // 写入存储（异步，不阻塞主流程）
    await Storage.setReadHistory(this._cache);

    // 通知 Service Worker
    chrome.runtime.sendMessage({
      type: MSG.READ_HISTORY_UPDATED,
      platform: platform,
      postId: postId,
      record: this._cache[key],
      totalCount: Object.keys(this._cache).length,
    }).catch(() => {});
  },

  // ==================== 统计 ====================

  /** 获取已读统计 */
  getStats() {
    const all = Object.values(this._cache);
    const byPlatform = {};
    for (const record of all) {
      byPlatform[record.platform] = (byPlatform[record.platform] || 0) + 1;
    }

    return {
      total: all.length,
      today: this._todayCount,
      byPlatform: byPlatform,
    };
  },

  /** 获取某平台下的已读记录 */
  getByPlatform(platform) {
    return Object.entries(this._cache)
      .filter(([key]) => key.startsWith(platform + ':'))
      .map(([key, record]) => ({ key, record }))
      .sort((a, b) => b.record.lastSeen - a.record.lastSeen);
  },

  // ==================== 数据管理 ====================

  /** 清除所有已读历史 */
  async clearAll() {
    this._cache = {};
    this._todayCount = 0;
    await Storage.setReadHistory({});
  },

  /** 按平台清除 */
  async clearByPlatform(platform) {
    for (const key of Object.keys(this._cache)) {
      if (key.startsWith(platform + ':')) {
        delete this._cache[key];
      }
    }
    await Storage.setReadHistory(this._cache);
    this._countToday();
  },

  /** 清除超过 retentionDays 天的记录 */
  async clearExpired(retentionDays) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let cleaned = false;
    for (const [key, record] of Object.entries(this._cache)) {
      if (record.lastSeen < cutoff) {
        delete this._cache[key];
        cleaned = true;
      }
    }
    if (cleaned) {
      await Storage.setReadHistory(this._cache);
      this._countToday();
    }
  },

  // ==================== 内部辅助 ====================

  _getTodayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },

  _countToday() {
    const now = Date.now();
    if (now < this._todayStart) {
      // 跨天了，重新计算
      this._todayStart = this._getTodayStart();
    }
    this._todayCount = Object.values(this._cache).filter(r => r.lastSeen >= this._todayStart).length;
  },
};

/**
 * @typedef {Object} ReadRecord
 * @property {string} postId
 * @property {string} platform
 * @property {string} title
 * @property {string} url
 * @property {number} firstSeen
 * @property {number} lastSeen
 * @property {number} viewCount
 * @property {string} trigger
 */
