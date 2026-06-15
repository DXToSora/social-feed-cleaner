/**
 * 内置预设规则库
 * 降低新用户使用门槛，提供开箱即用的过滤模板
 */

'use strict';

var PRESET_RULES = [
  {
    id: 'preset_anxiety',
    raw: '屏蔽制造焦虑的内容',
    keywords: ['焦虑', '35岁', '被裁', '失业', '危机', '活不下去', '怎么办', '完了'],
    keywordMode: 'any',
    excludeKeywords: [],
    regex: null,
    platforms: [],
    targetAreas: ['content', 'title'],
    action: 'fold',
    enabled: false,
    isPreset: true,
    category: '情绪管理',
  },
  {
    id: 'preset_advertising',
    raw: '屏蔽广告推广内容',
    keywords: ['限时优惠', '点击购买', '跳转链接', '下单立减', '618', '双11', '双十二', '年中大促', '直播间', '秒杀', '拼团'],
    keywordMode: 'any',
    excludeKeywords: [],
    regex: null,
    platforms: [],
    targetAreas: ['content', 'title'],
    action: 'fold',
    enabled: false,
    isPreset: true,
    category: '商业推广',
  },
  {
    id: 'preset_clickbait',
    raw: '屏蔽标题党内容',
    keywords: ['震惊', '万万没想到', '惊呆了', '竟然', '太可怕了', '不可思议', '看哭了', '刷屏了', '劲爆', '独家'],
    keywordMode: 'any',
    excludeKeywords: [],
    regex: null,
    platforms: [],
    targetAreas: ['title'],
    action: 'dim',
    enabled: false,
    isPreset: true,
    category: '内容质量',
  },
  {
    id: 'preset_conflict',
    raw: '屏蔽刻意制造对立的内容',
    keywords: ['凭什么', '活该', '活不起', '不配', '认命', '底层', '阶层', '寒门', '凭什么他'],
    keywordMode: 'any',
    excludeKeywords: [],
    regex: null,
    platforms: [],
    targetAreas: ['content', 'title'],
    action: 'fold',
    enabled: false,
    isPreset: true,
    category: '情绪管理',
  },
  {
    id: 'preset_hype_traffic',
    raw: '屏蔽蹭热点引流内容',
    keywords: ['转发这条', '看到一定要转', '赶紧收藏', '不看后悔', '一分钟教会你', '教你一招'],
    keywordMode: 'any',
    excludeKeywords: [],
    regex: null,
    platforms: [],
    targetAreas: ['content', 'title'],
    action: 'dim',
    enabled: false,
    isPreset: true,
    category: '内容质量',
  },
];

/**
 * 根据分类获取预设规则
 */
function getPresetsByCategory(category) {
  if (!category) return PRESET_RULES;
  return PRESET_RULES.filter(r => r.category === category);
}

/**
 * 获取所有预设分类
 */
function getPresetCategories() {
  return [...new Set(PRESET_RULES.map(r => r.category))];
}
