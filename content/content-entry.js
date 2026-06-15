/**
 * Content Script 入口
 *
 * 注入到微博/小红书页面，负责：
 *   1. 检测当前平台
 *   2. 初始化各模块（规则引擎、发布者追踪、已读历史）
 *   3. 启动帖子扫描器
 *   4. 处理扫描结果：应用遮罩/淡化/标签
 *   5. 监听来自 Popup/Service Worker 的消息
 *   6. 不修改页面全局作用域（避免与平台 JS 冲突）
 */

'use strict';

(async function () {
  'use strict';

  // ==================== 平台检测 ====================

  const url = window.location.href;
  let platform = null;
  let platformName = '';

  if (WeiboAdapter.matchURL(url)) {
    platform = WeiboAdapter;
    platformName = 'weibo';
  } else if (XiaohongshuAdapter.matchURL(url)) {
    platform = XiaohongshuAdapter;
    platformName = 'xiaohongshu';
  }

  if (!platform) {
    // 不在支持的平台上，不初始化
    console.log('[净化器] 当前页面不是支持的平台，已跳过');
    return;
  }

  // 标记 body，方便其他模块识别
  document.body.setAttribute('data-smc-platform', platformName);

  console.log(`[净化器] 检测到平台: ${platformName}`);

  // ==================== 初始化模块 ====================

  // 1. 加载设置
  const settings = await Storage.getSettings();
  if (!settings.engineEnabled) {
    console.log('[净化器] 引擎已全局关闭');
    // 仍然注册消息监听，以便用户重新开启
    setupMessageListener();
    return;
  }

  // 2. 加载规则
  await FilterEngine.loadRules();
  console.log(`[净化器] 已加载 ${FilterEngine.getRules().length} 条启用的规则`);

  // 3. 初始化发布者追踪
  await PublisherTracker.init();

  // 4. 初始化已读历史
  await ReadHistory.init();

  // 5. 应用已读淡化到现有帖子
  await ReadDimUI.applyToExisting(platform, platformName);

  // ==================== 启动扫描器 ====================

  PostScanner.start(platform, platformName, {

    /**
     * 新帖子回调
     */
    onNewPost: async (postData, result, whitelisted) => {
      // ---- 发布者标签 ----
      if (postData.authorId) {
        // 关联发布者信息到元素上（供 publisher-tag 定位）
        postData.element.setAttribute('data-smc-pub-author', postData.authorId);
        PublisherTagUI.render(postData.element, platformName, postData.authorId);
      }

      // ---- 过滤处理 ----
      if (result.matched && !whitelisted) {
        switch (result.action) {
          case ACTION.FOLD:
            OverlayUI.applyFold(postData.element, result);
            ReasonTag.attach(postData.element, result);
            break;
          case ACTION.HIDE:
            OverlayUI.applyHide(postData.element);
            break;
          case ACTION.DIM:
            OverlayUI.applyDim(postData.element);
            break;
        }

        // ---- 记录发布者违规 ----
        if (postData.authorId) {
          const ruleIds = result.matchedRules.map(r => r.rule.id);
          for (const ruleId of ruleIds) {
            await PublisherTracker.record(
              platformName,
              postData.authorId,
              postData.author,
              ruleId
            );
          }
          // 更新标签（规则命中后等级可能变化）
          PublisherTagUI.render(postData.element, platformName, postData.authorId);
        }

        // ---- 上报统计 ----
        chrome.runtime.sendMessage({
          type: MSG.STATS_REPORT,
          hitRuleId: result.matchedRules[0]?.rule.id,
        }).catch(() => {});
      }

      // 白名单检查：即使白名单不屏蔽，也更新标签
      if (result.matched && whitelisted) {
        PublisherTagUI.render(postData.element, platformName, postData.authorId);
      }
    },

    /**
     * 标记已读回调
     */
    onMarkRead: (postElement, record) => {
      ReadDimUI.apply(postElement, record);
    },
  });

  // ==================== 消息监听 ====================

  setupMessageListener();

  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      handleMessage(message).then(sendResponse);
      return true;  // 异步响应
    });
  }

  async function handleMessage(message) {
    switch (message.type) {

      case MSG.RULES_UPDATED:
        await FilterEngine.reload();
        console.log('[净化器] 规则已重新加载');
        return { success: true };

      case MSG.TOGGLE_ENGINE:
        if (message.enabled) {
          // 重新启动扫描器
          if (!PostScanner._running) {
            PostScanner.start(platform, platformName, PostScanner._callbacks || {});
          }
        } else {
          // 停止扫描器并移除所有遮罩
          PostScanner.stop();
          removeAllOverlays();
        }
        return { success: true };

      default:
        return { error: '未知消息' };
    }
  }

  // ==================== 清理 ====================

  function removeAllOverlays() {
    // 移除所有遮罩
    document.querySelectorAll('[data-smc-overlay]').forEach(el => el.remove());
    // 恢复所有隐藏的帖子
    document.querySelectorAll('[data-smc-hidden]').forEach(el => {
      el.style.removeProperty('display');
      el.removeAttribute('data-smc-hidden');
    });
    // 恢复所有淡化的帖子
    document.querySelectorAll('[data-smc-dimmed]').forEach(el => {
      el.style.removeProperty('opacity');
      el.style.removeProperty('filter');
      el.removeAttribute('data-smc-dimmed');
    });
  }

  // ==================== 上报平台检测 ====================

  chrome.runtime.sendMessage({
    type: MSG.PLATFORM_DETECTED,
    platform: platformName,
  }).catch(() => {});

  console.log('[净化器] 初始化完成 ✅');
})();
