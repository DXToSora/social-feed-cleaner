/**
 * 发布者标签 UI
 *
 * 在帖子作者名旁插入标签，显示该发布者的违规记录。
 * 三级展示：灰色轻度 / 橙色中度 / 红色重度
 *
 * 设计原则：
 *   - 标签位置紧贴作者名，不破坏原有布局
 *   - 样式尽量中性，不过度视觉冲击（防止被平台检测为异常元素）
 *   - 支持 hover 展开详情 tooltip
 */

'use strict';

var PublisherTagUI = {

  /** 标签样式是否已注入 */
  _stylesInjected: false,

  /**
   * 为帖子附加发布者标签
   * @param {HTMLElement} postElement - 帖子 DOM 元素
   * @param {string} platform - 平台名
   * @param {string} authorId - 作者 ID
   */
  render(postElement, platform, authorId) {
    if (!authorId) { console.log('[PubTag] 跳过: 无authorId'); return; }

    const tagInfo = PublisherTracker.getTagInfo(platform, authorId);
    if (!tagInfo) { console.log('[PubTag] 跳过: 无档案 for', platform, authorId); return; }

    // 检查是否已有标签
    if (postElement.querySelector('[data-smc-pub-tag]')) { console.log('[PubTag] 跳过: 已有标签'); return; }

    // 注入样式
    this._injectStyles();

    // 找到作者名元素
    const authorEl = this._findAuthorElement(postElement);
    if (!authorEl) { console.log('[PubTag] 跳过: 找不到作者元素 in', postElement.tagName, postElement.className); return; }

    console.log('[PubTag] 渲染标签:', tagInfo.label, '→ 作者:', authorEl.textContent.trim());

    // 创建标签
    const tag = document.createElement('span');
    tag.setAttribute('data-smc-pub-tag', '1');
    tag.className = `smc-pub-tag ${tagInfo.cssClass}`;
    tag.textContent = tagInfo.label;

    // 构建 tooltip
    const profile = tagInfo.profile;
    const infractionDetails = Object.entries(profile.infractions)
      .map(([ruleId, info]) => {
        const rules = FilterEngine.getRules();
        const rule = rules.find(r => r.id === ruleId);
        const name = rule ? (rule.raw || ruleId) : ruleId;
        return `${name}: ${info.count}次`;
      })
      .join('；');

    tag.title = `${profile.authorName}
首次记录: ${new Date(profile.firstSeen).toLocaleDateString('zh-CN')}
最近记录: ${new Date(profile.lastHitAt).toLocaleDateString('zh-CN')}
明细: ${infractionDetails}`;

    // 插入到作者名后面
    authorEl.insertAdjacentElement('afterend', tag);
  },

  /**
   * 在页面中更新某发布者的所有标签（当档案更新后刷新显示）
   * @param {string} platform
   * @param {string} authorId
   */
  refreshAll(platform, authorId) {
    const tagInfo = PublisherTracker.getTagInfo(platform, authorId);
    const tags = document.querySelectorAll('[data-smc-pub-tag]');

    // 需要一种方式将标签与发布者关联
    // 简单策略：遍历当前页面所有帖子，重新检查发布者
    // 更高效的做法是给 postElement 也标记 data-smc-pub-author
    tags.forEach(tag => {
      const postEl = tag.closest('[data-smc-pub-author]');
      if (postEl && postEl.getAttribute('data-smc-pub-author') === authorId) {
        if (tagInfo) {
          tag.className = `smc-pub-tag ${tagInfo.cssClass}`;
          tag.textContent = tagInfo.label;
        } else {
          tag.remove();
        }
      }
    });
  },

  // ==================== 内部方法 ====================

  /**
   * 在帖子元素中定位作者名 DOM 节点
   */
  _findAuthorElement(postElement) {
    const candidates = [
      '.W_fb', '.W_autocut', '.head_name_24e0G',           // 微博
      '.author .name', '.author-name', '.nickname',        // 小红书
      '[class*="author"]', '[class*="name"]', '[class*="nickname"]',
    ];
    for (const sel of candidates) {
      const el = postElement.querySelector(sel);
      if (el) return el;
    }
    return null;
  },

  _injectStyles() {
    if (this._stylesInjected) return;
    this._stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      .smc-pub-tag {
        display: inline-block;
        margin-left: 4px;
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 11px;
        line-height: 1.5;
        vertical-align: middle;
        cursor: help;
        white-space: nowrap;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* 轻度：灰色 */
      .pub-tag-light {
        color: #888;
        background: #f0f0f0;
        border: 1px solid #ddd;
      }

      /* 中度：橙色 */
      .pub-tag-medium {
        color: #e67e22;
        background: #fef5e7;
        border: 1px solid #fad7a0;
      }

      /* 重度：红色 */
      .pub-tag-heavy {
        color: #c0392b;
        background: #fdecea;
        border: 1px solid #f5b7b1;
      }
    `;
    document.head.appendChild(style);
  },
};
