/**
 * 屏蔽原因标签 UI
 *
 * 在帖子遮罩旁边/内部显示屏蔽原因标签。
 * 可展开查看完整匹配详情：命中了哪条规则、命中了哪些关键词。
 */

'use strict';

var ReasonTag = {

  /**
   * 在帖子旁添加原因标签（轻量模式，配合 overlay 使用）
   * @param {HTMLElement} postElement
   * @param {FilterResult} result
   */
  attach(postElement, result) {
    // 查找或创建标签容器
    let tagContainer = postElement.querySelector('[data-smc-reason]');
    if (!tagContainer) {
      tagContainer = document.createElement('span');
      tagContainer.setAttribute('data-smc-reason', '1');
      tagContainer.className = 'smc-reason-tag';

      // 插入到遮罩卡片中
      const overlay = postElement.parentNode
        ? postElement.parentNode.querySelector('[data-smc-overlay] .smc-overlay-text')
        : null;
      if (overlay) {
        overlay.appendChild(tagContainer);
      }
    }

    // 构建详情
    const rules = result.matchedRules || [];
    const details = rules.map(r => {
      const keywords = r.hitKeywords.length > 0
        ? ` (命中: ${r.hitKeywords.join(', ')})`
        : '';
      return `${r.rule.raw || r.rule.id}${keywords}`;
    }).join('; ');

    tagContainer.title = `匹配详情：${details}`;
    tagContainer.textContent = `${rules.length} 条规则命中`;
  },

  /**
   * 获取纯文本格式的原因摘要
   * @param {FilterResult} result
   * @returns {string}
   */
  summarize(result) {
    if (!result.matchedRules || result.matchedRules.length === 0) return '';
    return result.matchedRules
      .map(r => r.rule.raw || r.rule.keywords.join('、'))
      .join('；');
  },
};
