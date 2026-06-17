/**
 * 抖音平台适配器
 *
 * 抖音 PC 网页版 DOM 结构（2024-2026）：
 *   - React 渲染，大量 CSS Modules 哈希类名
 *   - 首页推荐 / 搜索 / 用户主页三种布局
 *   - 视频卡片为主，也有图文卡片
 *   - 选择器以 [class*="xxx"] 模糊匹配为主
 */

'use strict';

var DouyinAdapter = Object.create(PlatformAdapter);

DouyinAdapter.name = 'douyin';
DouyinAdapter.urlPatterns = ['douyin.com'];

// DOM 选择器 — 大量使用 [class*="xxx"] 匹配哈希类名
DouyinAdapter.selectors = {
  // Feed 容器
  feedContainers: [
    '[class*="feed"]',
    '[class*="video-list"]',
    '[class*="content-list"]',
    '[class*="main"] [class*="list"]',
    '[class*="tabContent"]',
  ],

  // 帖子单元（视频/图文卡片）
  postItem: [
    '[class*="video-card"]',
    '[class*="waterfall"] > *',
    'a[href*="/video/"]',
    'a[href*="/note/"]',
    'li[class*="search"]',
  ],

  // 帖子标题/描述
  postTitle: [
    '[class*="title"]',
    '[class*="desc"]',
    '[class*="card-title"]',
  ],

  // 帖子正文
  postContent: [
    '[class*="desc"]',
    '[class*="title"]',
    '[class*="card-desc"]',
    '[class*="content"]',
  ],

  // 作者名
  postAuthor: [
    '[class*="author"] [class*="name"]',
    '[class*="nickname"]',
    '[class*="author-name"]',
    '[class*="account"]',
    'span[class*="name"]',
  ],

  // 作者链接（用于提取用户 ID）
  postAuthorLink: [
    'a[href*="/user/"]',
    '[class*="author"] a',
    'a[class*="account"]',
  ],

  // 标签/话题
  postTags: [
    'a[href*="/hashtag/"]',
    'a[href*="/topic/"]',
    '[class*="tag"]',
    'a[href*="/search/"]:not([href*="video"])',
  ],

  // 视频通用属性
  postVideo: [
    '[class*="video"]',
    'video',
    '[class*="player"]',
  ],
};

/**
 * 从帖子 DOM 提取结构化数据
 */
DouyinAdapter.extractPostData = function (postElement) {
  const title = this._extractFirst(postElement, this.selectors.postTitle);
  const content = this._extractFirst(postElement, this.selectors.postContent);
  const author = this._extractFirst(postElement, this.selectors.postAuthor);
  const tags = this._extractAll(postElement, this.selectors.postTags);
  const authorId = this.getAuthorId(postElement);

  return {
    text: [title, content, author, ...tags].filter(Boolean).join(' '),
    content: content || title,     // 抖音通常标题即内容
    title: title,
    author: author,
    authorId: authorId,
    tags: tags,
    element: postElement,
  };
};

/**
 * 提取视频唯一 ID
 * 抖音视频 ID 可能来自：
 *   - data-id / data-video-id 属性
 *   - 链接 href 中的 /video/xxxx
 *   - /note/xxxx（图文）
 */
DouyinAdapter.getPostId = function (postElement) {
  // 尝试 data 属性
  let id = postElement.getAttribute('data-id')
    || postElement.getAttribute('data-video-id')
    || postElement.getAttribute('data-aweme-id');
  if (id && id.length > 4) return id;

  // 尝试从视频链接提取
  const videoLink = postElement.querySelector('a[href*="/video/"], a[href*="/note/"]');
  if (videoLink) {
    const href = videoLink.getAttribute('href');
    // /video/数字ID 或 /note/数字ID
    const mVideo = href.match(/[\/](?:video|note)[\/](\d+)/);
    if (mVideo) return mVideo[1];
  }

  // 尝试任意 data-*id 属性
  for (const attr of postElement.attributes) {
    if (/data.*id/i.test(attr.name) && attr.value.length > 4) {
      return attr.value;
    }
  }

  // 回退
  const text = (postElement.textContent || '').slice(0, 100);
  return 'dy_' + hashCode(text);
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
 * 抖音作者 ID 可能来自：
 *   - data-user-id / data-author-id 属性
 *   - 作者链接中的 /user/xxxx
 */
DouyinAdapter.getAuthorId = function (postElement) {
  // 尝试 data-user-id
  let userId = postElement.getAttribute('data-user-id')
    || postElement.getAttribute('data-author-id');
  if (userId) return userId;

  // 从作者链接提取
  const authorLink = postElement.querySelector('a[href*="/user/"]');
  if (authorLink) {
    const href = authorLink.getAttribute('href');
    // /user/数字ID
    const mUser = href.match(/[\/]user[\/](\d+)/);
    if (mUser) return mUser[1];
    // /user/字符串ID
    const mUserStr = href.match(/[\/]user[\/]([a-zA-Z0-9_-]+)/);
    if (mUserStr) return mUserStr[1];
  }

  // 回退：使用作者名 hash
  const authorName = this._extractFirst(postElement, this.selectors.postAuthor);
  return 'dy_author_' + (authorName ? hashCode(authorName) : Math.random().toString(36).slice(2));
  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }
};

// ==================== 辅助方法 ====================

DouyinAdapter._extractFirst = function (postElement, selectors) {
  for (const sel of selectors) {
    const el = postElement.querySelector(sel);
    if (el) {
      const text = el.textContent.trim();
      if (text) return text;
    }
  }
  return '';
};

DouyinAdapter._extractAll = function (postElement, selectors) {
  const texts = [];
  for (const sel of selectors) {
    postElement.querySelectorAll(sel).forEach(el => {
      const text = el.textContent.trim();
      if (text && !texts.includes(text)) texts.push(text);
    });
  }
  return texts;
};

DouyinAdapter.findFeedContainer = function () {
  for (const sel of this.selectors.feedContainers) {
    const container = document.querySelector(sel);
    if (container) return container;
  }
  return document.body;
};
