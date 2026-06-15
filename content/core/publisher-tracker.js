/**
 * 发布者追踪器
 *
 * 每次规则命中时记录发布者的违规信息，建立"行为档案"。
 * 追踪数据存储在 chrome.storage.local 中。
 *
 * 关键行为：
 *   - record(): 记录一次规则命中
 *   - getProfile(): 查询某发布者档案
 *   - getLevel(): 根据违规次数返回标签级别
 *   - 白名单检查：白名单中的发布者不屏蔽但仍有标签
 */

'use strict';

var PublisherTracker = {

  /** @type {Object} 内存缓存的发布者档案 */
  _cache: {},

  /** @type {string[]} 白名单 */
  _whitelist: [],

  /** @type {boolean} 是否已初始化 */
  _initialized: false,

  // ==================== 初始化 ====================

  async init() {
    if (this._initialized) return;
    this._cache = await Storage.getPublisherStats();
    this._whitelist = await Storage.getPublisherWhitelist();
    this._initialized = true;
  },

  // ==================== 记录违规 ====================

  /**
   * 记录一次规则命中
   * @param {string} platform - 平台名
   * @param {string} authorId - 作者唯一 ID
   * @param {string} authorName - 作者显示名
   * @param {string} ruleId - 命中的规则 ID
   * @param {string} [profileUrl] - 作者主页链接（可选）
   */
  async record(platform, authorId, authorName, ruleId, profileUrl = '') {
    if (!platform || !authorId || !ruleId) return;

    const key = Storage.makeKey(platform, authorId);
    const now = Date.now();

    // 确保缓存是最新的
    if (!this._initialized) await this.init();

    let profile = this._cache[key];

    if (!profile) {
      profile = {
        authorName: authorName,
        platform: platform,
        authorId: authorId,
        profileUrl: profileUrl,
        infractions: {},
        totalInfractions: 0,
        firstSeen: now,
        lastHitAt: now,
      };
    }

    // 更新作者名（可能改名）
    profile.authorName = authorName;
    if (profileUrl) profile.profileUrl = profileUrl;

    // 累加对应规则的计数
    if (!profile.infractions[ruleId]) {
      profile.infractions[ruleId] = { count: 0, lastHit: 0 };
    }
    profile.infractions[ruleId].count++;
    profile.infractions[ruleId].lastHit = now;
    profile.totalInfractions++;
    profile.lastHitAt = now;

    // 写回缓存和存储
    this._cache[key] = profile;
    await Storage.setPublisherStats(this._cache);

    // 通知 Popup
    chrome.runtime.sendMessage({
      type: MSG.PUBLISHER_UPDATED,
      publisherKey: key,
      profile: profile,
      level: this.getLevelFromCount(profile.totalInfractions),
    }).catch(() => {});

    console.log(`[发布者追踪] ${platform}:${authorName} 命中规则 ${ruleId}，累计 ${profile.totalInfractions} 次`);
  },

  // ==================== 查询接口 ====================

  /**
   * 获取发布者档案
   * @param {string} platform
   * @param {string} authorId
   * @returns {PublisherProfile|null}
   */
  getProfile(platform, authorId) {
    const key = Storage.makeKey(platform, authorId);
    return this._cache[key] || null;
  },

  /**
   * 获取所有发布者档案列表（按违规次数降序排列）
   * @returns {Array<{key: string, profile: PublisherProfile}>}
   */
  getAllProfiles() {
    return Object.entries(this._cache)
      .map(([key, profile]) => ({ key, profile }))
      .sort((a, b) => b.profile.totalInfractions - a.profile.totalInfractions);
  },

  /**
   * 获取某平台下的发布者档案
   * @param {string} platform
   */
  getProfilesByPlatform(platform) {
    return Object.entries(this._cache)
      .filter(([key]) => key.startsWith(platform + ':'))
      .map(([key, profile]) => ({ key, profile }))
      .sort((a, b) => b.profile.totalInfractions - a.profile.totalInfractions);
  },

  // ==================== 标签级别 ====================

  /**
   * 根据违规总数返回标签级别
   */
  getLevelFromCount(totalInfractions) {
    if (totalInfractions >= 10) return PUBLISHER_LEVEL.HEAVY;
    if (totalInfractions >= 3)  return PUBLISHER_LEVEL.MEDIUM;
    return PUBLISHER_LEVEL.LIGHT;
  },

  /**
   * 获取发布者的标签级别
   * @param {string} platform
   * @param {string} authorId
   * @returns {string}
   */
  getLevel(platform, authorId) {
    const profile = this.getProfile(platform, authorId);
    if (!profile) return PUBLISHER_LEVEL.LIGHT;
    return this.getLevelFromCount(profile.totalInfractions);
  },

  /**
   * 获取标签的 CSS class 和文案
   * @param {string} platform
   * @param {string} authorId
   * @returns {{level: string, label: string, cssClass: string}}
   */
  getTagInfo(platform, authorId) {
    const profile = this.getProfile(platform, authorId);
    if (!profile) return null;

    const level = this.getLevelFromCount(profile.totalInfractions);
    const infractions = profile.infractions;
    const categories = Object.keys(infractions);

    // 找到主要的违规类别（次数最多的）
    let topCategory = categories[0] || '';
    for (const cat of categories) {
      if (infractions[cat].count > infractions[topCategory].count) {
        topCategory = cat;
      }
    }

    // 尝试从规则中获取可读名称
    const rules = FilterEngine.getRules();
    const topRule = rules.find(r => r.id === topCategory);
    const categoryLabel = topRule ? topRule.raw.replace(/^屏蔽/, '') : topCategory;

    let label, cssClass;
    switch (level) {
      case PUBLISHER_LEVEL.HEAVY:
        label = `🚫 频繁${categoryLabel}（${profile.totalInfractions}次）`;
        cssClass = 'pub-tag-heavy';
        break;
      case PUBLISHER_LEVEL.MEDIUM:
        label = `⚠ 曾${categoryLabel} ${profile.totalInfractions} 次`;
        cssClass = 'pub-tag-medium';
        break;
      case PUBLISHER_LEVEL.LIGHT:
      default:
        label = `📌 曾${categoryLabel}`;
        cssClass = 'pub-tag-light';
        break;
    }

    return { level, label, cssClass, profile };
  },

  // ==================== 白名单管理 ====================

  async addToWhitelist(platform, authorId) {
    const key = Storage.makeKey(platform, authorId);
    if (!this._whitelist.includes(key)) {
      this._whitelist.push(key);
      await Storage.setPublisherWhitelist(this._whitelist);
      await FilterEngine.reloadWhitelist();
    }
  },

  async removeFromWhitelist(platform, authorId) {
    const key = Storage.makeKey(platform, authorId);
    const idx = this._whitelist.indexOf(key);
    if (idx >= 0) {
      this._whitelist.splice(idx, 1);
      await Storage.setPublisherWhitelist(this._whitelist);
      await FilterEngine.reloadWhitelist();
    }
  },

  isWhitelisted(platform, authorId) {
    const key = Storage.makeKey(platform, authorId);
    return this._whitelist.includes(key);
  },

  // ==================== 数据管理 ====================

  /** 清除特定发布者记录 */
  async clearPublisher(platform, authorId) {
    const key = Storage.makeKey(platform, authorId);
    delete this._cache[key];
    await Storage.setPublisherStats(this._cache);
  },

  /** 刷新缓存（从 storage 重新加载） */
  async refresh() {
    this._cache = await Storage.getPublisherStats();
    this._whitelist = await Storage.getPublisherWhitelist();
  },
};

/**
 * @typedef {Object} PublisherProfile
 * @property {string} authorName
 * @property {string} platform
 * @property {string} authorId
 * @property {string} profileUrl
 * @property {Object<string, {count: number, lastHit: number}>} infractions
 * @property {number} totalInfractions
 * @property {number} firstSeen
 * @property {number} lastHitAt
 */
