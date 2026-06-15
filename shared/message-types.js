/**
 * 扩展内部消息类型常量
 * 用于 Content Script ↔ Service Worker ↔ Popup 之间的通信
 */

'use strict';

var MSG = {
  // ========== Popup → Service Worker → Content Script ==========
  RULES_UPDATED:           'rules_updated',            // 规则变更通知
  GET_STATS:               'get_stats',                // 获取统计数据
  TOGGLE_ENGINE:           'toggle_engine',            // 全局开关
  GET_PUBLISHER_STATS:     'get_publisher_stats',      // 获取发布者档案
  CLEAR_PUBLISHER:         'clear_publisher',           // 清除某发布者记录
  GET_READ_HISTORY:        'get_read_history',          // 获取已读历史
  CLEAR_READ_HISTORY:      'clear_read_history',        // 清除已读历史
  ADD_WHITELIST_PUBLISHER: 'add_whitelist_publisher',   // 添加发布者白名单
  REMOVE_WHITELIST_PUBLISHER: 'remove_whitelist_publisher', // 移除发布者白名单

  // ========== Content Script → Service Worker → Popup ==========
  STATS_REPORT:            'stats_report',             // 统计数据上报
  PLATFORM_DETECTED:       'platform_detected',        // 当前平台检测结果
  PUBLISHER_UPDATED:       'publisher_updated',        // 发布者档案更新通知
  READ_HISTORY_UPDATED:    'read_history_updated',     // 已读历史更新通知
  RULE_HIT:                'rule_hit',                 // 规则命中通知（含发布者信息）

  // ========== Content Script 内部 ==========
  POST_SCANNED:            'post_scanned',             // 帖子扫描完成
  RULE_MATCHED:            'rule_matched',             // 规则命中
  POST_READ_TRIGGERED:     'post_read_triggered',      // 帖子被标记为已读
};
