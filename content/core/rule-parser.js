/**
 * 规则解析器
 *
 * 将用户自然语言描述解析为内部规则对象。
 * MVP 阶段：基于模式匹配提取关键词，不做复杂语义理解。
 * 预留 raw 字段保存用户原文，后续 AI 阶段可无缝升级。
 *
 * 支持的模式：
 *   "屏蔽 [关键词]"             → keywords: [关键词]
 *   "屏蔽 [A] 和 [B]"           → keywords: [A, B], mode: "all"
 *   "屏蔽 [A] 或 [B]"           → keywords: [A, B], mode: "any"
 *   "不要 [描述]"               → 提取实词做关键词
 *   "关键词: xxx, yyy"          → 直接提取关键词列表
 */

'use strict';

var RuleParser = {

  /** 常见停用词（在关键词提取时过滤） */
  STOP_WORDS: new Set([
    '屏蔽', '不要', '不想看', '不想', '的', '了', '是', '在', '和', '或',
    '与', '及', '以及', '还有', '那种', '那种的', '之类', '什么的',
    '的内容', '内容', '帖子', '信息', '推荐', '给我', '我', '看到',
    '这些', '这个', '那些', '那个', '这种', '那种',
  ]),

  /**
   * 解析用户输入，返回规则对象
   * @param {string} rawInput - 用户自然语言输入
   * @param {Object} [defaults] - 可选默认值
   * @returns {RuleObject}
   */
  parse(rawInput, defaults = {}) {
    const raw = rawInput.trim();
    if (!raw) return null;

    let keywords = [];
    let keywordMode = KEYWORD_MODE.ANY;

    // ---- 模式 1: "关键词: xxx, yyy" ----
    const colonMatch = raw.match(/^(?:关键词|keyword)[:：]\s*(.+)$/i);
    if (colonMatch) {
      keywords = this._splitKeywords(colonMatch[1]);
      return this._build(raw, keywords, keywordMode, defaults);
    }

    // ---- 模式 2: "屏蔽 A 和 B" (AND) ----
    const andMatch = raw.match(/^屏蔽\s*(.+?)\s*[和与及、+]\s*(.+)$/);
    if (andMatch) {
      const part1 = this._extractKeywords(andMatch[1]);
      const part2 = this._extractKeywords(andMatch[2]);
      keywords = [...part1, ...part2];
      keywordMode = KEYWORD_MODE.ALL;
      return this._build(raw, keywords, keywordMode, defaults);
    }

    // ---- 模式 3: "屏蔽 A 或 B" (OR) ----
    const orMatch = raw.match(/^屏蔽\s*(.+?)\s*或(?:者)?\s*(.+)$/);
    if (orMatch) {
      const part1 = this._extractKeywords(orMatch[1]);
      const part2 = this._extractKeywords(orMatch[2]);
      keywords = [...part1, ...part2];
      keywordMode = KEYWORD_MODE.ANY;
      return this._build(raw, keywords, keywordMode, defaults);
    }

    // ---- 模式 4: "屏蔽 [关键词]" / "不要 [描述]" / "不想看 [描述]" ----
    const simpleMatch = raw.match(/^(?:屏蔽|不要|不想看?|过滤)\s*(.+)$/);
    if (simpleMatch) {
      keywords = this._extractKeywords(simpleMatch[1]);
      return this._build(raw, keywords, keywordMode, defaults);
    }

    // ---- 模式 5: 直接输入，全部作为关键词提取 ----
    keywords = this._extractKeywords(raw);
    return this._build(raw, keywords, keywordMode, defaults);
  },

  /**
   * 从文本中提取关键词
   * 策略：按常见分隔符切分，过滤停用词
   */
  _extractKeywords(text) {
    // 按常见分隔符切分
    const rawTokens = text.split(/[,，、\s]+/).filter(Boolean);
    const keywords = [];

    for (const token of rawTokens) {
      const cleaned = token.trim();
      // 过滤太短的词和停用词
      if (cleaned.length >= 2 && !this.STOP_WORDS.has(cleaned)) {
        keywords.push(cleaned);
      }
    }

    // 如果切分后为空，把整段作为关键词
    if (keywords.length === 0 && text.trim().length >= 2) {
      keywords.push(text.trim());
    }

    return keywords;
  },

  /**
   * 按逗号切分关键词
   */
  _splitKeywords(text) {
    return text.split(/[,，、\s]+/).map(s => s.trim()).filter(s => s.length >= 2);
  },

  /**
   * 构建规则对象
   */
  _build(raw, keywords, keywordMode, defaults) {
    return {
      id: Storage.generateId(),
      raw: raw,
      enabled: true,
      keywords: keywords,
      keywordMode: keywordMode,
      regex: defaults.regex || null,
      excludeKeywords: defaults.excludeKeywords || [],
      platforms: defaults.platforms || [],
      targetAreas: defaults.targetAreas || [TARGET_AREA.CONTENT, TARGET_AREA.TITLE],
      action: defaults.action || ACTION.FOLD,
      createdAt: Date.now(),
      hitCount: 0,
      lastHitAt: 0,
      isPreset: false,
    };
  },
};
