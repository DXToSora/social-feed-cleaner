/**
 * 已读淡化 UI
 *
 * 对已浏览过的帖子添加半透明淡化样式。
 * - opacity: 0.45 + grayscale(20%)
 * - hover 时恢复正常
 * - 不破坏页面原有 DOM 结构，仅注入 CSS class
 */

'use strict';

var ReadDimUI = {

  /** 样式是否已注入 */
  _stylesInjected: false,

  /**
   * 对帖子应用已读淡化
   * @param {HTMLElement} postElement
   * @param {ReadRecord} [record] - 已读记录（可选，用于显示 tooltip）
   */
  apply(postElement, record) {
    // 避免重复应用
    if (postElement.classList.contains('smc-read-dimmed')) return;

    this._injectStyles();
    postElement.classList.add('smc-read-dimmed');
    postElement.setAttribute('data-smc-read', '1');

    // 添加 tooltip
    if (record) {
      const lastSeen = new Date(record.lastSeen).toLocaleString('zh-CN');
      postElement.setAttribute('data-smc-read-info',
        `已浏览 ${record.viewCount || 1} 次 · 最近: ${lastSeen}`);
    }
  },

  /**
   * 移除已读淡化
   * @param {HTMLElement} postElement
   */
  remove(postElement) {
    postElement.classList.remove('smc-read-dimmed');
    postElement.removeAttribute('data-smc-read');
    postElement.removeAttribute('data-smc-read-info');
  },

  /**
   * 批量应用——遍历 DOM 中所有帖子，给已读的加上淡化
   * @param {Object} platform - 平台适配器
   * @param {string} platformName
   */
  async applyToExisting(platform, platformName) {
    await ReadHistory.init();
    const selectors = platform.selectors.postItem;

    for (const sel of selectors) {
      const posts = document.querySelectorAll(sel);
      for (const post of posts) {
        const postId = platform.getPostId(post);
        if (ReadHistory.isRead(platformName, postId)) {
          const record = ReadHistory.getRecord(platformName, postId);
          this.apply(post, record);
        }
      }
    }
  },

  _injectStyles() {
    if (this._stylesInjected) return;
    this._stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      /* 已读淡化样式 */
      .smc-read-dimmed {
        opacity: 0.45 !important;
        filter: grayscale(20%) !important;
        transition: opacity 0.3s ease, filter 0.3s ease !important;
      }

      /* 鼠标悬停时恢复可读性 */
      .smc-read-dimmed:hover {
        opacity: 0.85 !important;
        filter: grayscale(0%) !important;
      }

      /* 已读 tooltip（通过伪元素实现） */
      [data-smc-read-info] {
        position: relative;
      }
      [data-smc-read-info]:hover::after {
        content: attr(data-smc-read-info);
        position: absolute;
        top: -28px;
        left: 0;
        padding: 2px 8px;
        background: rgba(0,0,0,0.72);
        color: #fff;
        border-radius: 3px;
        font-size: 11px;
        white-space: nowrap;
        z-index: 9999;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  },
};
