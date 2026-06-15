/**
 * 规则数据结构定义
 * 一条用户规则从自然语言被解析为以下结构
 *
 * @typedef {Object} RuleObject
 * @property {string}   id            - 唯一标识
 * @property {string}   raw           - 用户原始输入（保留用于后续 AI 理解）
 * @property {boolean}  enabled       - 是否启用
 * @property {string[]} keywords      - 关键词列表
 * @property {'any'|'all'|'exact'} keywordMode - 关键词匹配模式
 * @property {string|null} regex      - 可选正则表达式
 * @property {string[]} excludeKeywords - 排除词：命中这些词则不屏蔽
 * @property {string[]} platforms     - 生效平台列表，空数组=全部
 * @property {string[]} targetAreas   - 匹配范围：'content'|'title'|'author'|'tags'
 * @property {'fold'|'hide'|'dim'} action - 命中后的动作
 * @property {number}   createdAt     - 创建时间戳
 * @property {number}   hitCount      - 命中次数统计
 * @property {number}   lastHitAt     - 最近一次命中时间
 */

'use strict';

// 动作类型常量
var ACTION = {
  FOLD: 'fold',   // 折叠：显示遮罩卡片，可展开
  HIDE: 'hide',   // 完全隐藏
  DIM:  'dim',    // 淡化：降低透明度
};

// 动作优先级（多条规则命中时取最高优先级的动作）
var ACTION_PRIORITY = {
  hide: 3,
  fold: 2,
  dim:  1,
};

// 匹配模式
var KEYWORD_MODE = {
  ANY:   'any',    // 命中任一关键词即匹配
  ALL:   'all',    // 必须全部命中
  EXACT: 'exact',  // 精确匹配整个文本
};

// 匹配范围
var TARGET_AREA = {
  CONTENT: 'content',
  TITLE:   'title',
  AUTHOR:  'author',
  TAGS:    'tags',
};

// 发布者标签级别
var PUBLISHER_LEVEL = {
  LIGHT:  'light',   // 轻度：1-2次
  MEDIUM: 'medium',  // 中度：3-9次
  HEAVY:  'heavy',   // 重度：≥10次
};

// 已读判定方式
var READ_TRIGGER = {
  CLICK:    'click',     // 点击帖子
  VIEWPORT: 'viewport',  // 视口停留超时
  EXPAND:   'expand',    // 展开全文
  MANUAL:   'manual',    // 手动标记
};

// 默认设置
var DEFAULT_SETTINGS = {
  engineEnabled: true,
  defaultAction: ACTION.FOLD,
  viewportStayMs: 5000,          // 视口停留多少毫秒标记已读
  readHistoryMaxSize: 2000,       // 已读历史最大条数
  readHistoryRetentionDays: 30,   // 已读历史保留天数
  publisherRetentionDays: 90,     // 发布者档案保留天数
  scanDebounceMs: 300,            // 扫描防抖毫秒
};
