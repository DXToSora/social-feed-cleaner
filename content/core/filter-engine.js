/**
 * 过滤引擎核心
 *
 * 对每个帖子执行规则匹配并返回决策。
 * 匹配流程：
 *   1. Platform Adapter 提取 { text, content, title, author, tags }
 *   2. 遍历所有 enabled=true 的规则:
 *      ├── 检查 platforms 匹配当前平台
 *      ├── 检查 targetAreas 对应字段
 *      ├── 执行关键词匹配（根据 keywordMode）
 *      ├── 执行 excludeKeywords 排除检查
 *      ├── 执行 regex 匹配（如有）
 *      └── 命中 → 累积结果
 *   3. 多条规则命中 → 取 action 优先级最高的
 *   4. 返回匹配结果 { matched, action, matchedRules }
 */

'use strict';

var FilterEngine = {

  /** @type {RuleObject[]} 当前加载的规则列表 */
  _rules: [],

  /** @type {string[]} 发布者白名单 */
  _publisherWhitelist: [],

  /** @type {Object|null} 当前平台适配器 */
  _platform: null,

  // ==================== 规则加载 ====================

  /** 加载规则 */
  async loadRules() {
    this._rules = await Storage.getRules();
    this._publisherWhitelist = await Storage.getPublisherWhitelist();
  },

  /** 重新加载（规则变更后调用） */
  async reload() {
    await this.loadRules();
  },

  /** 获取当前规则 */
  getRules() {
    return this._rules.filter(r => r.enabled);
  },

  // ==================== 匹配逻辑 ====================

  /**
   * 对单个帖子执行所有规则的匹配
   * @param {PostData} postData - 平台适配器提取的帖子数据
   * @param {string} platformName - 当前平台名（weibo / xiaohongshu）
   * @returns {FilterResult}
   */
  evaluate(postData, platformName) {
    /** @type {MatchedRule[]} */
    const matchedRules = [];

    const enabledRules = this._rules.filter(r => r.enabled);
    if (enabledRules.length === 0) {
      return { matched: false, action: null, matchedRules: [], postData };
    }

    for (const rule of enabledRules) {
      const result = this._matchRule(rule, postData, platformName);
      if (result) {
        matchedRules.push(result);
      }
    }

    if (matchedRules.length === 0) {
      return { matched: false, action: null, matchedRules: [], postData };
    }

    // 取最高优先级的 action
    const bestAction = matchedRules.reduce((best, cur) => {
      const curPri = ACTION_PRIORITY[cur.rule.action] || 0;
      const bestPri = ACTION_PRIORITY[best.rule.action] || 0;
      return curPri > bestPri ? cur : best;
    });

    return {
      matched: true,
      action: bestAction.rule.action,
      matchedRules: matchedRules,
      postData: postData,
    };
  },

  /**
   * 单条规则匹配
   * @param {RuleObject} rule
   * @param {PostData} postData
   * @param {string} platformName
   * @returns {MatchedRule|null}
   */
  _matchRule(rule, postData, platformName) {
    // ---- 1. 检查平台 ----
    if (rule.platforms.length > 0 && !rule.platforms.includes(platformName)) {
      return null;
    }

    // ---- 2. 提取要匹配的文本 ----
    const targetText = this._getTargetText(rule, postData);
    if (!targetText || targetText.length < 2) return null;

    // ---- 3. 执行排除词检查 ----
    if (rule.excludeKeywords.length > 0) {
      const hitExclude = rule.excludeKeywords.some(kw => targetText.includes(kw));
      if (hitExclude) return null;
    }

    // ---- 4. 执行关键词匹配 ----
    let keywordMatch = false;
    if (rule.keywords.length > 0) {
      keywordMatch = this._matchKeywords(rule.keywords, rule.keywordMode, targetText);
    }

    // ---- 5. 执行正则匹配（如有） ----
    let regexMatch = false;
    if (rule.regex) {
      try {
        const re = new RegExp(rule.regex, 'iu');
        regexMatch = re.test(targetText);
      } catch (e) {
        console.warn('[过滤引擎] 正则表达式无效:', rule.regex, e.message);
      }
    }

    // ---- 6. 判定是否命中 ----
    const hit = (rule.keywords.length > 0 && keywordMatch) || (rule.regex && regexMatch);

    if (!hit) return null;

    // 命中！找出具体命中的关键词
    const hitKeywords = rule.keywords.length > 0
      ? rule.keywords.filter(kw => targetText.includes(kw))
      : [];

    return {
      rule: rule,
      hitKeywords: hitKeywords,
      hitText: targetText.slice(0, 200),  // 截取匹配的文本片段
    };
  },

  /**
   * 关键词匹配
   * @param {string[]} keywords
   * @param {string} mode
   * @param {string} text
   * @returns {boolean}
   */
  _matchKeywords(keywords, mode, text) {
    switch (mode) {
      case KEYWORD_MODE.ALL:
        return keywords.every(kw => text.includes(kw));
      case KEYWORD_MODE.EXACT:
        return keywords.some(kw => text === kw);
      case KEYWORD_MODE.ANY:
      default:
        return keywords.some(kw => text.includes(kw));
    }
  },

  /**
   * 根据规则的 targetAreas 拼接要匹配的文本
   */
  _getTargetText(rule, postData) {
    const parts = [];
    for (const area of rule.targetAreas) {
      switch (area) {
        case TARGET_AREA.CONTENT:
          parts.push(postData.content);
          break;
        case TARGET_AREA.TITLE:
          parts.push(postData.title);
          break;
        case TARGET_AREA.AUTHOR:
          parts.push(postData.author);
          break;
        case TARGET_AREA.TAGS:
          parts.push(...postData.tags);
          break;
      }
    }
    return parts.filter(Boolean).join(' ');
  },

  // ==================== 发布者白名单 ====================

  /**
   * 检查发布者是否在白名单中
   * @param {string} platform
   * @param {string} authorId
   * @returns {boolean}
   */
  isWhitelisted(platform, authorId) {
    const key = Storage.makeKey(platform, authorId);
    return this._publisherWhitelist.includes(key);
  },

  /** 刷新白名单 */
  async reloadWhitelist() {
    this._publisherWhitelist = await Storage.getPublisherWhitelist();
  },

  // ==================== Tries 优化（预留接口） ====================

  /**
   * 构建关键词 Trie 树（Phase 2 优化：大量关键词时加速匹配）
   * 当前 MVP 阶段使用 Array.includes()，后续可替换为 Trie
   */
  _buildTrie(keywords) {
    // TODO: Phase 2 实现
  },
};

/**
 * @typedef {Object} FilterResult
 * @property {boolean} matched
 * @property {string|null} action
 * @property {MatchedRule[]} matchedRules
 * @property {PostData} postData
 */

/**
 * @typedef {Object} MatchedRule
 * @property {RuleObject} rule
 * @property {string[]} hitKeywords
 * @property {string} hitText
 */
