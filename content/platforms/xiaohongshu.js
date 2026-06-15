/**
 * 小红书平台适配器
 *
 * 小红书 feed 流 DOM 结构（2024-2026）：
 *   - 瀑布流布局，帖子以卡片形式呈现
 *   - 首页推荐 / 搜索结果 / 个人主页 三种布局各有差异
 *   - 图文笔记和视频笔记结构不同
 *   - 未登录状态下部分内容被遮挡
 */

'use strict';

var XiaohongshuAdapter = Object.create(PlatformAdapter);

XiaohongshuAdapter.name = 'xiaohongshu';
XiaohongshuAdapter.urlPatterns = ['xiaohongshu.com', 'xhslink.com'];

XiaohongshuAdapter.selectors = {
  // Feed 容器
  feedContainers: [
    '.feeds-container',
    '[class*="feeds"]',
    '.note-container',
    '.explore-feed',
    '.search-result-list',
  ],

  // 帖子单元
  postItem: [
    'section.note-item',
    '.note-item',
    '[class*="note-item"]',
    'a[href*="/explore/"]',
    'a[href*="/search_result/"]',
  ],

  // 帖子标题
  postTitle: [
    '.title',
    '.note-title',
    '[class*="title"]',
  ],

  // 帖子正文/描述
  postContent: [
    '.desc',
    '.note-desc',
    '.content',
    '[class*="desc"]',
  ],

  // 作者名
  postAuthor: [
    '.author .name',
    '.author-name',
    '.nickname',
    '.username',
    '[class*="author"] [class*="name"]',
    '[class*="nickname"]',
  ],

  // 作者链接（用于提取 user_id）
  postAuthorLink: [
    '.author a',
    'a[href*="/user/"]',
    'a[href*="/profile/"]',
    '[class*="author"] a',
  ],

  // 标签/话题
  postTags: [
    '.tag',
    '.hash-tag',
    '[class*="tag"]',
    'a[href*="/tag/"]',
    'a[href*="/topic/"]',
  ],

  // 笔记链接（用于提取 post ID）
  postLink: [
    'a[href*="/explore/"]',
    'a[href*="/discovery/item/"]',
    'a[href*="/search_result/"]',
  ],
};

/**
 * 从帖子 DOM 提取结构化数据
 */
XiaohongshuAdapter.extractPostData = function (postElement) {
  const title = this._extractFirst(postElement, this.selectors.postTitle);
  const content = this._extractFirst(postElement, this.selectors.postContent);
  const author = this._extractFirst(postElement, this.selectors.postAuthor);
  const tags = this._extractAll(postElement, this.selectors.postTags);
  const authorId = this.getAuthorId(postElement);

  return {
    text: [title, content, author, ...tags].filter(Boolean).join(' '),
    content: content || title,  // 小红书内容有时只用 title
    title: title,
    author: author,
    authorId: authorId,
    tags: tags,
    element: postElement,
  };
};

/**
 * 提取笔记唯一 ID
 * 小红书笔记 ID 可能来自：
 *   - data-id / data-note-id 属性
 *   - 链接 href 中的 /explore/xxxx 或 /discovery/item/xxxx
 */
XiaohongshuAdapter.getPostId = function (postElement) {
  // 尝试 data 属性
  let id = postElement.getAttribute('data-id')
    || postElement.getAttribute('data-note-id')
    || postElement.getAttribute('id');
  if (id && id.length > 4) return id;

  // 尝试从链接提取
  const link = postElement.querySelector('a[href]');
  if (link) {
    const href = link.getAttribute('href');
    // /explore/64位十六进制ID 或 /discovery/item/xxxx
    const mExplore = href.match(/[\/]explore[\/]([a-f0-9]{16,})/i);
    if (mExplore) return mExplore[1];
    const mDiscovery = href.match(/[\/]discovery[\/]item[\/]([a-f0-9]{16,})/i);
    if (mDiscovery) return mDiscovery[1];
    const mSearch = href.match(/[\/]search_result[\/].*[?&]id=([a-f0-9]+)/i);
    if (mSearch) return mSearch[1];
  }

  // 尝试从任意包含 id 的 data 属性
  for (const attr of postElement.attributes) {
    if (attr.name.includes('id') && attr.value.length > 4) {
      return attr.value;
    }
  }

  // 回退
  const text = postElement.textContent.slice(0, 100);
  return 'xhs_' + hashCode(text);
  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }
};

/**
 * 提取作者唯一 ID
 * 小红书作者 ID 可能来自：
 *   - data-user-id 属性
 *   - 作者链接中的 /user/xxxx
 */
XiaohongshuAdapter.getAuthorId = function (postElement) {
  // 尝试 data-user-id
  let userId = postElement.getAttribute('data-user-id');
  if (userId) return userId;

  // 查找作者区域
  const authorArea = postElement.querySelector('[class*="author"]');
  if (authorArea) {
    userId = authorArea.getAttribute('data-user-id');
    if (userId) return userId;
  }

  // 从作者链接提取
  const authorLink = postElement.querySelector('a[href*="/user/"], a[href*="/profile/"]');
  if (authorLink) {
    const href = authorLink.getAttribute('href');
    // /user/profile/XXXXXX 或 /user/XXXXXX
    const mUser = href.match(/[\/]user[\/](?:profile[\/])?([a-f0-9]+)/i);
    if (mUser) return mUser[1];
    const mRedId = href.match(/xiaohongshu\.com[\/]user[\/](?:profile[\/])?([a-f0-9]+)/i);
    if (mRedId) return mRedId[1];
  }

  // 回退
  const authorName = this._extractFirst(postElement, this.selectors.postAuthor);
  return 'xhs_author_' + (authorName ? hashCode(authorName) : Math.random().toString(36).slice(2));
  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }
};

// ==================== 辅助方法 ====================

XiaohongshuAdapter._extractFirst = function (postElement, selectors) {
  for (const sel of selectors) {
    const el = postElement.querySelector(sel);
    if (el) {
      const text = el.textContent.trim();
      if (text) return text;
    }
  }
  return '';
};

XiaohongshuAdapter._extractAll = function (postElement, selectors) {
  const texts = [];
  for (const sel of selectors) {
    postElement.querySelectorAll(sel).forEach(el => {
      const text = el.textContent.trim();
      if (text && !texts.includes(text)) texts.push(text);
    });
  }
  return texts;
};

XiaohongshuAdapter.findFeedContainer = function () {
  for (const sel of this.selectors.feedContainers) {
    const container = document.querySelector(sel);
    if (container) return container;
  }
  return document.body;
};
