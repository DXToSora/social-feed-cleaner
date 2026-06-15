/**
 * 帖子 DOM 扫描器
 *
 * 使用 MutationObserver 监听 feed 容器中的新帖子插入，
 * 将每个新帖子送入 Filter Engine 进行匹配。
 *
 * 关键设计：
 *   - debounce：300ms 内合并多次 DOM 变更，批量处理
 *   - 已处理标记：data-filter-checked 属性避免重复扫描
 *   - 视口检测：用于已读判定（IntersectionObserver）
 *   - 忽略 editor/input 等用户交互区域的 DOM 变化
 */

'use strict';

var PostScanner = {

  /** @type {MutationObserver|null} */
  _observer: null,

  /** @type {IntersectionObserver|null} */
  _viewportObserver: null,

  /** @type {number} 防抖定时器 ID */
  _debounceTimer: null,

  /** @type {number} 防抖毫秒 */
  _debounceMs: 300,

  /** @type {boolean} 是否正在运行 */
  _running: false,

  /** @type {Object} 当前平台适配器 */
  _platform: null,

  /** @type {string} 平台名 */
  _platformName: '',

  /** 已处理帖子的 postId 集合（内存缓存，防止同一次页面会话重复处理） */
  _processedCache: new Set(),

  /** 视口内元素的停留计时器 */
  _viewportTimers: new Map(),

  /** 点击监听器是否已注册 */
  _clickListenerRegistered: false,

  // ==================== 初始化 ====================

  /**
   * 启动扫描器
   * @param {Object} platform - 平台适配器实例
   * @param {string} platformName - 平台名
   * @param {Object} [callbacks] - 回调集合
   */
  start(platform, platformName, callbacks = {}) {
    if (this._running) this.stop();

    this._platform = platform;
    this._platformName = platformName;
    this._debounceMs = DEFAULT_SETTINGS.scanDebounceMs;
    this._callbacks = callbacks;  // { onNewPost, onMarkRead }

    // 先创建 Observer 实例（后续方法依赖它们）
    this._viewportObserver = new IntersectionObserver(
      this._onViewportChange.bind(this),
      { threshold: 0.6 }  // 帖子 60% 进入视口才认为"在看"
    );

    const feedContainer = platform.findFeedContainer();
    this._observer = new MutationObserver(this._onMutation.bind(this));
    this._observer.observe(feedContainer, {
      childList: true,
      subtree: true,
    });

    // 最后扫描已存在的帖子（此时 observer 都已就绪）
    this._scanExisting();

    // 注册点击监听（用于已读判定）
    this._registerClickListeners();

    this._running = true;
    console.log('[帖子扫描器] 已启动，平台:', platformName);
  },

  /** 停止扫描器 */
  stop() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._viewportObserver) {
      this._viewportObserver.disconnect();
      this._viewportObserver = null;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._viewportTimers.clear();
    this._running = false;
  },

  // ==================== MutationObserver 回调 ====================

  _onMutation(mutations) {
    // 忽略纯文本/input/editor 区域的变更
    const relevant = mutations.some(m => {
      return !this._isIgnoredNode(m.target);
    });
    if (!relevant) return;

    // Debounce
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._scanNew();
    }, this._debounceMs);
  },

  // ==================== 扫描逻辑 ====================

  /** 扫描页面上已存在的帖子 */
  _scanExisting() {
    const selectors = this._platform.selectors.postItem;
    for (const sel of selectors) {
      const posts = document.querySelectorAll(sel);
      posts.forEach(post => this._processPost(post));
    }
  },

  /** 扫描新增的帖子 */
  _scanNew() {
    const selectors = this._platform.selectors.postItem;
    for (const sel of selectors) {
      const posts = document.querySelectorAll(sel);
      posts.forEach(post => this._processPost(post));
    }
  },

  /**
   * 处理单个帖子
   * @param {HTMLElement} postElement
   */
  _processPost(postElement) {
    // 跳过已处理的
    if (postElement.hasAttribute('data-filter-checked')) return;
    postElement.setAttribute('data-filter-checked', '1');

    try {
      // 提取帖子数据
      const postData = this._platform.extractPostData(postElement);

      // 跳过没有有效文本的帖子
      if (!postData.text || postData.text.length < 2) return;

      // 获取 postId 去重
      const postId = this._platform.getPostId(postElement);
      const cacheKey = Storage.makeKey(this._platformName, postId);
      if (this._processedCache.has(cacheKey)) return;
      this._processedCache.add(cacheKey);

      postData._postId = postId;
      postData._cacheKey = cacheKey;

      // 送入过滤引擎
      const result = FilterEngine.evaluate(postData, this._platformName);

      // 检查发布者白名单
      let whitelisted = false;
      if (postData.authorId) {
        whitelisted = FilterEngine.isWhitelisted(this._platformName, postData.authorId);
      }

      // 触发回调
      if (this._callbacks.onNewPost) {
        this._callbacks.onNewPost(postData, result, whitelisted);
      }

      // 建立视口观察（用于已读判定）
      this._viewportObserver.observe(postElement);

      // 检查是否已读过
      this._checkReadStatus(postData, postElement);
    } catch (e) {
      console.error('[帖子扫描器] 处理帖子出错:', e);
    }
  },

  // ==================== 已读检测 ====================

  /**
   * 检查帖子是否已读并应用淡化
   */
  async _checkReadStatus(postData, postElement) {
    const cacheKey = postData._cacheKey;
    if (!cacheKey) return;

    const readHistory = await Storage.getReadHistory();
    if (readHistory[cacheKey]) {
      // 已读过，应用淡化
      if (this._callbacks.onMarkRead) {
        this._callbacks.onMarkRead(postElement, readHistory[cacheKey]);
      }
    }
  },

  /**
   * 标记帖子为已读
   * @param {string} trigger - READ_TRIGGER 类型
   */
  async markAsRead(postData, postElement, trigger) {
    const cacheKey = postData._cacheKey;
    if (!cacheKey) return;

    const readHistory = await Storage.getReadHistory();
    const existing = readHistory[cacheKey];

    if (existing) {
      existing.lastSeen = Date.now();
      existing.viewCount = (existing.viewCount || 1) + 1;
    } else {
      readHistory[cacheKey] = {
        postId: postData._postId || cacheKey,
        platform: this._platformName,
        title: (postData.title || postData.content || '').slice(0, 100),
        url: window.location.href,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        viewCount: 1,
        trigger: trigger,
      };
    }

    await Storage.setReadHistory(readHistory);

    // 应用淡化样式
    if (this._callbacks.onMarkRead) {
      this._callbacks.onMarkRead(postElement, readHistory[cacheKey]);
    }

    // 通知 Service Worker
    chrome.runtime.sendMessage({
      type: MSG.POST_READ_TRIGGERED,
      platform: this._platformName,
      postId: postData._postId,
      trigger: trigger,
    }).catch(() => {});
  },

  // ==================== IntersectionObserver 回调 ====================

  _onViewportChange(entries) {
    for (const entry of entries) {
      const element = entry.target;
      const postId = element.getAttribute('data-filter-checked') ? '' : '';

      if (entry.isIntersecting) {
        // 进入视口，启动停留计时器
        if (!this._viewportTimers.has(element)) {
          const timer = setTimeout(() => {
            // 停留超时，标记已读
            const postData = this._platform.extractPostData(element);
            postData._postId = this._platform.getPostId(element);
            postData._cacheKey = Storage.makeKey(this._platformName, postData._postId);
            this.markAsRead(postData, element, READ_TRIGGER.VIEWPORT);
            this._viewportTimers.delete(element);
          }, DEFAULT_SETTINGS.viewportStayMs);

          this._viewportTimers.set(element, timer);
        }
      } else {
        // 离开视口，取消计时器
        const timer = this._viewportTimers.get(element);
        if (timer) {
          clearTimeout(timer);
          this._viewportTimers.delete(element);
        }
      }
    }
  },

  // ==================== 点击监听 ====================

  _registerClickListeners() {
    if (this._clickListenerRegistered) return;
    this._clickListenerRegistered = true;

    document.addEventListener('click', (event) => {
      // 检查点击是否在某个帖子内
      const selectors = this._platform.selectors.postItem;
      let postElement = null;
      for (const sel of selectors) {
        postElement = event.target.closest(sel);
        if (postElement) break;
      }
      if (!postElement) return;

      // 检查是否点击了"展开全文"类按钮
      const isExpand = event.target.matches('[class*="expand"], [class*="more"], [action-type="fl_unfold"]');

      // 标记已读
      const postData = this._platform.extractPostData(postElement);
      postData._postId = this._platform.getPostId(postElement);
      postData._cacheKey = Storage.makeKey(this._platformName, postData._postId);
      this.markAsRead(postData, postElement, isExpand ? READ_TRIGGER.EXPAND : READ_TRIGGER.CLICK);
    }, true);
  },

  // ==================== 辅助 ====================

  /** 判断是否为应忽略的节点（编辑器、输入框等） */
  _isIgnoredNode(node) {
    if (!node || !node.nodeType) return false;
    if (node.nodeType === Node.TEXT_NODE) return false;  // 文本节点不忽略

    const tag = node.tagName;
    if (!tag) return false;

    const ignoredTags = ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SCRIPT', 'STYLE', 'LINK', 'META'];
    if (ignoredTags.includes(tag)) return true;

    if (node.isContentEditable) return true;

    // 检查 role 属性
    const role = node.getAttribute('role');
    if (role === 'textbox' || role === 'combobox' || role === 'searchbox') return true;

    // 检查 class 是否包含常见的编辑器标记
    const cls = node.className || '';
    if (typeof cls === 'string' && /(editor|input|textarea|write|comment-box)/i.test(cls)) return true;

    return false;
  },
};
