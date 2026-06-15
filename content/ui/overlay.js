/**
 * 帖子遮罩 UI 组件
 *
 * 对命中规则的帖子添加折叠遮罩——将内容替换为提示卡片。
 * 用户可点击展开查看原文，3秒后自动收回。
 *
 * 设计原则：
 *   - 不破坏平台原有 DOM 结构
 *   - 不改变帖子在页面流中的位置（保持布局稳定）
 *   - 注入的 HTML/CSS 尽量低调，与平台原生风格融合
 */

'use strict';

var OverlayUI = {

  /** 已创建的遮罩元素集合（用于清理） */
  _overlays: new WeakMap(),

  // ==================== 折叠遮罩 ====================

  /**
   * 为帖子创建折叠遮罩
   * @param {HTMLElement} postElement - 帖子 DOM 元素
   * @param {FilterResult} result - 过滤引擎匹配结果
   */
  applyFold(postElement, result) {
    // 检查是否已有遮罩
    if (this._overlays.has(postElement)) return;

    // 注入样式（只注入一次）
    this._injectStyles();

    // 保存原始子元素并全部隐藏
    const originalChildren = Array.from(postElement.children);
    const originalDisplayMap = originalChildren.map(el => el.style.display);

    // 创建遮罩卡片
    const overlay = document.createElement('div');
    overlay.className = 'smc-overlay';

    const reasonText = this._buildReasonText(result);

    overlay.innerHTML = `
      <div class="smc-overlay-card">
        <div class="smc-overlay-icon">🚫</div>
        <div class="smc-overlay-text">
          <div class="smc-overlay-title">此内容已被过滤</div>
          <div class="smc-overlay-reason">原因：${this._escapeHtml(reasonText)}</div>
        </div>
        <div class="smc-overlay-actions">
          <button class="smc-btn smc-btn-expand" data-action="expand">展开查看</button>
          <button class="smc-btn smc-btn-whitelist" data-action="whitelist">信任该发布者</button>
        </div>
      </div>
    `;

    // 隐藏所有原始子元素
    originalChildren.forEach(el => {
      el.style.display = 'none';
    });

    // 将遮罩插入为 postElement 的直接子元素
    postElement.appendChild(overlay);

    // 确保 postElement 可见且有明确的高度占位
    postElement.style.setProperty('min-height', '80px', 'important');

    // 绑定事件
    overlay.querySelector('[data-action="expand"]').addEventListener('click', () => {
      this._expandTemporary(postElement, originalChildren, overlay);
    });

    overlay.querySelector('[data-action="whitelist"]').addEventListener('click', async () => {
      const postData = result.postData;
      if (postData && postData.authorId) {
        const platform = postData.element.closest('[data-smc-platform]')
          ? postData.element.closest('[data-smc-platform]').getAttribute('data-smc-platform')
          : '';
        await PublisherTracker.addToWhitelist(platform, postData.authorId);
        this.remove(postElement);
      }
    });

    // 保存引用
    this._overlays.set(postElement, {
      overlay,
      originalChildren,
      originalDisplayMap,
    });
  },

  /**
   * 完全隐藏帖子
   */
  applyHide(postElement) {
    postElement.style.setProperty('display', 'none', 'important');
    postElement.setAttribute('data-smc-hidden', '1');
  },

  /**
   * 淡化帖子
   */
  applyDim(postElement) {
    postElement.style.setProperty('opacity', '0.3', 'important');
    postElement.style.setProperty('filter', 'grayscale(30%)', 'important');
    postElement.setAttribute('data-smc-dimmed', '1');
  },

  // ==================== 移除遮罩 ====================

  /**
   * 移除帖子的遮罩
   */
  remove(postElement) {
    const entry = this._overlays.get(postElement);
    if (entry) {
      // 恢复原始子元素
      if (entry.originalChildren) {
        entry.originalChildren.forEach((el, i) => {
          el.style.display = entry.originalDisplayMap[i] || '';
        });
      }
      // 移除遮罩
      if (entry.overlay.parentNode) {
        entry.overlay.parentNode.removeChild(entry.overlay);
      }
      postElement.style.removeProperty('min-height');
      this._overlays.delete(postElement);
    }

    // 移除隐藏
    if (postElement.hasAttribute('data-smc-hidden')) {
      postElement.style.removeProperty('display');
      postElement.removeAttribute('data-smc-hidden');
    }

    // 移除淡化
    if (postElement.hasAttribute('data-smc-dimmed')) {
      postElement.style.removeProperty('opacity');
      postElement.style.removeProperty('filter');
      postElement.removeAttribute('data-smc-dimmed');
    }
  },

  // ==================== 内部方法 ====================

  /**
   * 临时展开（3秒后自动收回）
   */
  _expandTemporary(postElement, originalChildren, overlay) {
    // 显示原始内容
    originalChildren.forEach(el => {
      el.style.display = '';
    });
    overlay.style.display = 'none';

    // 3 秒后自动收回
    setTimeout(() => {
      originalChildren.forEach(el => {
        el.style.display = 'none';
      });
      overlay.style.display = '';
    }, 3000);
  },

  /**
   * 构建屏蔽原因文本
   */
  _buildReasonText(result) {
    if (!result.matchedRules || result.matchedRules.length === 0) return '匹配规则';
    const rule = result.matchedRules[0].rule;
    return rule.raw || rule.keywords.join('、');
  },

  /** HTML 转义 */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /** 注入全局样式（幂等） */
  _stylesInjected: false,
  _injectStyles() {
    if (this._stylesInjected) return;
    this._stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      /* 遮罩卡片 */
      .smc-overlay {
        display: flex !important;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 80px;
        padding: 8px;
        z-index: 10;
        position: relative;
      }
      .smc-overlay-card {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 14px 16px;
        border-radius: 10px;
        background: #f8f8f8;
        border: 1px solid #e2e2e2;
        font-size: 13px;
        color: #666;
        width: 100%;
        max-width: 280px;
        text-align: center;
      }
      .smc-overlay-icon {
        font-size: 20px;
        line-height: 1;
      }
      .smc-overlay-text {
        flex: 1;
        min-width: 100px;
      }
      .smc-overlay-title {
        font-weight: 600;
        color: #555;
        margin-bottom: 2px;
      }
      .smc-overlay-reason {
        font-size: 12px;
        color: #aaa;
      }
      .smc-overlay-actions {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
        flex-wrap: wrap;
        justify-content: center;
      }
      .smc-btn {
        padding: 5px 12px;
        border: 1px solid #ccc;
        border-radius: 4px;
        background: #fff;
        font-size: 12px;
        cursor: pointer;
        color: #555;
        white-space: nowrap;
      }
      .smc-btn:hover {
        background: #f0f0f0;
      }
      .smc-btn-expand {
        color: #1a73e8;
        border-color: #1a73e8;
      }
      .smc-btn-expand:hover {
        background: #e8f0fe;
      }
      .smc-btn-whitelist {
        color: #34a853;
        border-color: #34a853;
      }
      .smc-btn-whitelist:hover {
        background: #e6f4ea;
      }
    `;
    document.head.appendChild(style);
  },
};
