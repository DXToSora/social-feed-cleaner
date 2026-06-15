/**
 * 微博平台适配器
 *
 * 微博 feed 流 DOM 结构（2024-2026）：
 *   - PC 新版使用 Vue/React 渲染，选择器以新版为主
 *   - 旧版 .WB_cardwrap 作为回退
 *   - 帖子 ID 从 action-data / mid 属性提取
 *   - 作者 ID 从作者链接 href 中提取
 */

'use strict';

var WeiboAdapter = Object.create(PlatformAdapter);

WeiboAdapter.name = 'weibo';
WeiboAdapter.urlPatterns = ['weibo.com', 'weibo.cn'];

// DOM 选择器 — 从高优先级到低优先级，按回退顺序排列
WeiboAdapter.selectors = {
  // Feed 容器（最多层级的可能容器）
  feedContainers: [
    '.vue-recycle-scroller__item-wrapper',  // 新版 Vue feed
    '[node-type="feed_list"]',              // 旧版 feed 列表
    '.WB_feed',                              // 通用 feed
    '[class*="Feed"]',                       // React 版
  ],

  // 帖子单元
  postItem: [
    '.vue-recycle-scroller__item-view .WB_cardwrap',
    '.WB_cardwrap',
    'div[action-type="feed_list_item"]',
    '[class*="card"]',
  ],

  // 帖子正文
  postContent: [
    '.WB_text',
    '.detail_wbtext_4CRf9',
    '.Feed_body_3R0rO',
    'p[node-type="feed_list_content"]',
  ],

  // 作者名
  postAuthor: [
    '.W_fb',
    '.W_autocut',
    '.head_name_24e0G',
    'a[usercard]',
    '[class*="name"]',
  ],

  // 作者链接（用于提取 UID）
  postAuthorLink: [
    'a[usercard]',
    '.W_f18 a',
    '.head_name_24e0G',
    'a[href*="/u/"]',
    'a[href*="/n/"]',
  ],

  // 标签/话题
  postTags: [
    'a[suda-uatrack*="topic"]',
    '.W_texta',
    'a[href*="/topic"]',
    '[class*="topic"]',
  ],
};

/**
 * 从帖子 DOM 提取结构化数据
 */
WeiboAdapter.extractPostData = function (postElement) {
  const content = this._extractFirst(postElement, this.selectors.postContent);
  const author = this._extractFirst(postElement, this.selectors.postAuthor);
  const tags = this._extractAll(postElement, this.selectors.postTags);
  const authorId = this.getAuthorId(postElement);

  return {
    text: [content, author, ...tags].filter(Boolean).join(' '),
    content: content,
    title: '',  // 微博一般没有标题，用正文前50字代替
    author: author,
    authorId: authorId,
    tags: tags,
    element: postElement,
  };
};

/**
 * 提取帖子唯一 ID
 * 微博帖子 ID 可能来自：
 *   - mid 属性
 *   - action-data 中的 mid=
 *   - data-mid
 *   - 帖子链接中的最后一段
 */
WeiboAdapter.getPostId = function (postElement) {
  // 尝试从 mid 属性获取
  let mid = postElement.getAttribute('mid')
    || postElement.getAttribute('data-mid')
    || postElement.getAttribute('omid');

  if (mid) return mid;

  // 尝试从 action-data 解析
  const actionData = postElement.getAttribute('action-data');
  if (actionData) {
    const match = actionData.match(/mid=(\d+)/);
    if (match) return match[1];
  }

  // 尝试从内部链接提取
  const link = postElement.querySelector('a[href*="/status/"], a[href*="/detail/"]');
  if (link) {
    const href = link.getAttribute('href');
    const m = href.match(/[\/](\d{16,})/);
    if (m) return m[1];
  }

  // 回退：用 mid 属性再次尝试任意包含 mid 的属性
  for (const attr of postElement.attributes) {
    if (attr.name.includes('mid') && /^\d{10,}$/.test(attr.value)) {
      return attr.value;
    }
  }

  // 最终回退：取该节点在 DOM 中的 hash
  return 'wb_' + hashCode(content);
  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }
  function content() {
    const body = postElement.querySelector('.WB_text');
    return body ? body.textContent.slice(0, 100) : postElement.outerHTML.slice(0, 200);
  }
};

/**
 * 提取作者唯一 ID
 * 微博作者 ID 可能来自：
 *   - usercard 属性的 id=
 *   - 作者链接中的 /u/xxxx 或 /n/xxxx
 */
WeiboAdapter.getAuthorId = function (postElement) {
  // 尝试从 usercard 属性获取
  const authorLink = postElement.querySelector('a[usercard]');
  if (authorLink) {
    const usercard = authorLink.getAttribute('usercard');
    if (usercard) {
      const m = usercard.match(/id=(\d+)/);
      if (m) return m[1];
    }
  }

  // 尝试从作者链接 href 获取
  const links = postElement.querySelectorAll('a[href]');
  for (const link of links) {
    const href = link.getAttribute('href');
    // /u/1234567890 或 /n/用户名
    const mUid = href.match(/[\/]u[\/](\d+)/);
    if (mUid) return mUid[1];
    const mDomain = href.match(/weibo\.com[\/](\d+)/);
    if (mDomain) return mDomain[1];
    const mProfile = href.match(/weibo\.com[\/]u[\/](\d+)/);
    if (mProfile) return mProfile[1];
  }

  // 回退：使用作者名做 hash
  const authorName = this._extractFirst(postElement, this.selectors.postAuthor);
  return 'wb_author_' + (authorName ? hashCode(authorName) : Math.random().toString(36).slice(2));
  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }
};

// ==================== 辅助方法 ====================

/** 从多个选择器中取第一个匹配的文本 */
WeiboAdapter._extractFirst = function (postElement, selectors) {
  for (const sel of selectors) {
    const el = postElement.querySelector(sel);
    if (el) {
      const text = el.textContent.trim();
      if (text) return text;
    }
  }
  return '';
};

/** 从多个选择器中取所有匹配的文本 */
WeiboAdapter._extractAll = function (postElement, selectors) {
  const texts = [];
  for (const sel of selectors) {
    postElement.querySelectorAll(sel).forEach(el => {
      const text = el.textContent.trim();
      if (text && !texts.includes(text)) texts.push(text);
    });
  }
  return texts;
};

/** 找到 feed 容器 */
WeiboAdapter.findFeedContainer = function () {
  for (const sel of this.selectors.feedContainers) {
    const container = document.querySelector(sel);
    if (container) return container;
  }
  return document.body;
};
