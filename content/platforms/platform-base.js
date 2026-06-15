/**
 * 平台适配器基类
 * 定义统一的接口，每个平台（微博、小红书等）实现自己的适配器
 *
 * 关键抽象：
 *   - 识别 URL 是否属于该平台
 *   - 提供 DOM 选择器来定位 feed 容器和帖子元素
 *   - 从帖子 DOM 中提取结构化数据（文本、作者、ID 等）
 *   - 提供帖子和作者的唯一标识（用于已读记录和发布者追踪）
 */

'use strict';

var PlatformAdapter = {
  /** @type {string} 平台名标识 */
  name: '',

  /** @type {string[]} 匹配的 URL 模式 */
  urlPatterns: [],

  /** @type {Object} DOM 选择器配置 */
  selectors: {
    feedContainer: '',   // Feed 流最外层容器（用于 MutationObserver）
    postItem: '',        // 单个帖子元素选择器
    postContent: '',     // 帖子正文
    postTitle: '',       // 帖子标题/摘要
    postAuthor: '',      // 作者显示名
    postAuthorId: '',    // 作者唯一标识（可能通过属性或链接提取）
    postTags: '',        // 标签/话题
  },

  /**
   * 判断当前 URL 是否属于该平台
   * @param {string} url
   * @returns {boolean}
   */
  matchURL(url) {
    return this.urlPatterns.some(p => url.includes(p));
  },

  /**
   * 从帖子 DOM 节点提取结构化数据
   * @param {HTMLElement} postElement
   * @returns {PostData}
   */
  extractPostData(postElement) {
    throw new Error('必须由子类实现 extractPostData()');
  },

  /**
   * 从帖子元素提取唯一标识
   * @param {HTMLElement} postElement
   * @returns {string}
   */
  getPostId(postElement) {
    throw new Error('必须由子类实现 getPostId()');
  },

  /**
   * 从帖子元素提取作者唯一标识
   * @param {HTMLElement} postElement
   * @returns {string}
   */
  getAuthorId(postElement) {
    throw new Error('必须由子类实现 getAuthorId()');
  },

  /**
   * 提取帖子中的纯文本（合并多层选择器）
   * @param {HTMLElement} postElement
   * @param {string} selector
   * @returns {string}
   */
  _extractText(postElement, selector) {
    const el = postElement.querySelector(selector);
    return el ? el.textContent.trim() : '';
  },

  /**
   * 提取属性值
   * @param {HTMLElement} postElement
   * @param {string} selector
   * @param {string} attr
   * @returns {string}
   */
  _extractAttr(postElement, selector, attr) {
    const el = postElement.querySelector(selector);
    return el ? (el.getAttribute(attr) || '') : '';
  },
};

/**
 * @typedef {Object} PostData
 * @property {string} text      - 拼接后的全文（用于关键词匹配）
 * @property {string} content   - 正文
 * @property {string} title     - 标题
 * @property {string} author    - 作者显示名
 * @property {string} authorId  - 作者唯一 ID
 * @property {string[]} tags    - 标签列表
 * @property {HTMLElement} element - 原始 DOM 引用
 */
