# 社交媒体净化器 — 浏览器扩展

一个中文社交媒体信息流净化浏览器扩展（Chrome / Edge），让用户用自然语言描述"不想看什么"，扩展自动识别并折叠/隐藏匹配的帖子。

**先支持平台**：微博、小红书  
**三个核心能力**：内容过滤 + 发布者打标签 + 已读淡化  
**MVP 策略**：纯规则引擎 → 后续接入 AI  
**技术约束**：纯前端，无构建工具，Manifest V3

---

## 1. 项目目录结构

```
social-media-cleaner/
├── manifest.json                  # Chrome Extension Manifest V3
├── assets/
│   └── icons/                     # 扩展图标 16/48/128
├── background/
│   └── service-worker.js          # Service Worker（事件分发、存储初始化）
├── content/
│   ├── core/
│   │   ├── filter-engine.js       # 规则引擎核心：解析规则 → 匹配 → 决策
│   │   ├── rule-parser.js         # 将用户自然语言描述解析为内部规则对象
│   │   ├── post-scanner.js        # 帖子 DOM 扫描器：遍历 feed、提取文本
│   │   ├── publisher-tracker.js   # 发布者追踪器：记录命中规则的发布者及其违规次数
│   │   └── read-history.js        # 已读历史：记录浏览过的帖子，标记已读
│   ├── platforms/
│   │   ├── platform-base.js       # 平台抽象基类：定义统一接口
│   │   ├── weibo.js               # 微博适配器：DOM 选择器、feed 容器、帖子结构
│   │   └── xiaohongshu.js         # 小红书适配器：DOM 选择器、feed 容器、帖子结构
│   ├── ui/
│   │   ├── overlay.js             # 被屏蔽帖子的遮罩/折叠 UI 组件
│   │   ├── reason-tag.js          # 屏蔽原因标签（可展开查看为什么被屏蔽）
│   │   ├── publisher-tag.js       # 发布者标签 UI：在帖子作者旁显示"曾发布广告n次"等
│   │   └── read-dim.js            # 已读淡化：对浏览过的帖子添加半透明样式
│   └── content-entry.js           # Content Script 入口：注册 MutationObserver、初始化
├── popup/
│   ├── popup.html                 # 弹出窗口 UI
│   ├── popup.js                   # 弹出窗口逻辑：规则增删改查、统计、开关
│   └── popup.css                  # 弹出窗口样式
├── shared/
│   ├── storage.js                 # chrome.storage 读写封装
│   ├── rule-types.js              # 规则数据结构定义（Schema-like 注释文档）
│   └── message-types.js           # 扩展内部消息类型常量
└── rules/
    └── presets.js                 # 内置预设规则库（焦虑营销、标题党、广告等）
```

---

## 2. 扩展架构概览

```
┌─────────────────────────────────────────────────────────┐
│                      Popup UI                           │
│  规则管理 / 统计面板 / 开关 / 快速添加当前平台屏蔽词      │
└──────────────┬─────────────────────┬────────────────────┘
               │   chrome.runtime    │
               │   .sendMessage()    │
               ▼                     ▼
┌──────────────────┐    ┌────────────────────────────────┐
│  Service Worker  │    │       Content Script            │
│  (background)    │◄──►│   (注入到微博/小红书页面)         │
│                  │    │                                │
│  · 存储初始化    │    │  ┌──────────────────────────┐  │
│  · 消息路由      │    │  │     Post Scanner          │  │
│  · 平台判断      │    │  │  MutationObserver 监听     │  │
│                  │    │  │  新帖子插入 → 送入引擎      │  │
│                  │    │  └──────────┬───────────────┘  │
│                  │    │             ▼                   │
│                  │    │  ┌──────────────────────────┐  │
│                  │    │  │     Filter Engine         │  │
│                  │    │  │  规则匹配 → 命中/未命中    │  │
│                  │    │  └──┬────────┬─────────┬────┘  │
│                  │    │     │        │         │       │
│                  │    │     ▼        ▼         ▼       │
│                  │    │  ┌───────┐┌───────┐┌───────┐   │
│                  │    │  │规则动作││发布者  ││已读    │   │
│                  │    │  │折叠/隐藏││追踪器  ││历史    │   │
│                  │    │  └───┬───┘└───┬───┘└───┬───┘   │
│                  │    │      │        │        │       │
│                  │    │      └────────┼────────┘       │
│                  │    │               ▼                │
│                  │    │  ┌──────────────────────────┐  │
│                  │    │  │     UI Layer              │  │
│                  │    │  │  Overlay / PublisherTag   │  │
│                  │    │  │  ReasonTag / ReadDim      │  │
│                  │    │  └──────────────────────────┘  │
│                  │    │                                │
│                  │    │  Platform Adapters             │
│                  │    │  微博.js  小红书.js              │
│                  │    └────────────────────────────────┘
└──────────────────┘
```

---

## 3. 数据流

### 3.1 内容过滤主流程

```
用户输入规则（自然语言）
        │
        ▼
  Rule Parser（解析）
        │
        ▼
  chrome.storage.sync（持久化）
        │
        ▼
  Content Script 加载规则
        │
        ▼
  MutationObserver 检测新帖子
        │
        ▼
  Platform Adapter 提取帖子 {text, author, authorId, postId, ...}
        │
        ▼
  Filter Engine 逐条匹配
        │
        ├── 命中 ──► 执行过滤动作（fold/hide/dim）
        │            ├──► Publisher Tracker 记录发布者违规 +1
        │            └──► Read History 记录已读
        │
        └── 未命中 ──► Read History 标记已读
                       └──► UI 应用已读淡化样式
```

### 3.2 发布者标签流程

```
Filter Engine 规则命中
        │
        ▼
  Publisher Tracker 收到通知
        │
        ├── 提取 authorId（平台适配器提供）
        ├── 查找 publisherStats[authorId]
        ├── 累加对应规则类别的违规计数
        ├── 写入 chrome.storage.local
        └── 通知 Publisher Tag UI 更新该发布者在当前页面所有帖子的标签
                │
                ▼
         "该用户曾发布广告 5 次"
         "该用户曾发布焦虑营销内容 3 次"
```

### 3.3 已读淡化流程

```
Post Scanner 检测到帖子进入视口
        │
        ▼
  Read History 查询 postId 是否已记录
        │
        ├── 已读过 ──► Read Dim UI 应用 opacity: 0.4 + 降低对比度
        │               └── 点击仍可正常查看，但不抢占注意力
        │
        └── 未读过 ──► 保持正常样式
                │
                ▼
        用户点击帖子 / 停留超过 N 秒
                │
                ▼
        Read History 记录该 postId + 时间戳
                │
                ▼
        Read Dim UI 应用淡化效果（下次看到时生效）

---

## 4. 规则引擎设计（MVP 核心）

### 4.1 规则数据结构

一条用户规则从自然语言被解析为以下结构：

```js
// shared/rule-types.js 中定义的概念模型
{
  id: "rule_001",                    // 唯一标识
  raw: "屏蔽制造焦虑的职场内容",       // 用户原始输入（保留用于后续 AI 理解）
  enabled: true,                     // 是否启用

  // --- 解析后的结构化匹配条件 ---
  keywords: ["焦虑", "35岁", "被裁", "失业"],  // 关键词匹配（AND/OR 可配）
  keywordMode: "any",                // "any" | "all" | "exact"
  regex: null,                       // 可选正则（高级用户）
  excludeKeywords: [],               // 排除词：命中这些词则不屏蔽

  // --- 作用域 ---
  platforms: ["weibo", "xiaohongshu"],  // 生效平台，空=全部
  targetAreas: ["content", "title"],    // 匹配范围：content | title | author | tags

  // --- 动作 ---
  action: "fold",                    // "fold"(折叠) | "hide"(完全隐藏) | "dim"(淡化)

  // --- 元数据 ---
  createdAt: 1718230400000,
  hitCount: 0,                       // 命中次数统计
}
```

### 4.2 规则解析器（rule-parser.js）

MVP 阶段，自然语言 → 结构化规则的转换策略：

| 用户输入模式 | 解析方式 | 示例 |
|---|---|---|
| `屏蔽 [关键词]` | 直接提取关键词 | "屏蔽焦虑" → keywords:["焦虑"] |
| `屏蔽 [A] 和 [B]` | 多关键词 AND | "屏蔽焦虑和广告" → keywords:["焦虑","广告"], mode:"all" |
| `屏蔽 [A] 或 [B]` | 多关键词 OR | "屏蔽焦虑或内卷" → keywords:["焦虑","内卷"], mode:"any" |
| `不要 [描述]` | 提取实词做关键词 | "不要推荐带货帖子" → keywords:["带货","推荐"] |
| `关键词: xxx` | 高级模式入口 | 直接设置 keywords 字段 |

**MVP 不支持复杂语义理解**（那是 AI 阶段的事），但解析器已预留 `raw` 字段保存用户原文，未来可无缝升级。

### 4.3 匹配流程（filter-engine.js）

```
对于每个新帖子:
  1. Platform Adapter 提取 { text, author, tags, title }
  2. 遍历所有 enabled=true 的规则:
     ├── 检查 platforms 匹配当前平台
     ├── 检查 targetAreas 对应字段
     ├── 执行关键词匹配（根据 keywordMode）
     ├── 执行 excludeKeywords 排除检查
     ├── 执行 regex 匹配（如有）
     └── 命中 → 执行 action
  3. 多条规则命中 → 取 action 优先级最高的: hide > fold > dim
```

---

## 5. 平台适配器设计

### 5.1 基类接口（platform-base.js）

```js
// 每个平台适配器需实现的接口
const PlatformAdapter = {
  name: "",               // 平台名标识
  matchURL: (url) => {},  // 判断当前 URL 是否属于该平台

  // DOM 选择器配置
  selectors: {
    feedContainer: "",    // Feed 流容器
    postItem: "",         // 单个帖子元素
    postContent: "",      // 帖子正文
    postTitle: "",        // 帖子标题/摘要
    postAuthor: "",       // 作者显示名
    postAuthorId: "",     // 作者唯一标识（用于跨帖子追踪）
    postTags: "",         // 标签/话题
  },

  // 从帖子 DOM 节点提取结构化数据
  extractPostData: (postElement) => {
    return {
      text: "",           // 拼接后的全文（用于关键词匹配）
      content: "",        // 正文
      title: "",          // 标题
      author: "",         // 作者显示名
      authorId: "",       // 作者唯一 ID（如微博 UID、小红书 user_id）
      tags: [],           // 标签列表
      element: postElement, // 原始 DOM 引用
    };
  },

  // 从帖子元素提取唯一 ID（用于已读记录去重）
  getPostId: (postElement) => "",

  // 从帖子元素提取作者唯一 ID（用于发布者追踪）
  getAuthorId: (postElement) => "",
};
```

### 5.2 平台适配要点

**微博 (weibo.js)**
- Feed 容器：`[node-type="feed_list"]` 或新版 React 渲染的 feed 区域
- 帖子单元：`.vue-recycle-scroller__item-view` 或 `.WB_cardwrap`
- 内容提取：`.WB_text` 内的全文 + `.WB_media_wrap` 中的图片 OCR 预留位
- 特殊处理：转发微博需要同时检查原博内容

**小红书 (xiaohongshu.js)**
- Feed 容器：`.feeds-container` 或瀑布流 `.note-item`
- 帖子单元：`.note-item` / `section.note-item`
- 内容提取：`.title` + `.desc` + `.content` 多层回退
- 特殊处理：视频笔记和图文笔记可能有不同 DOM 结构
- 作者 ID 提取：从帖子 DOM 的 `data-user-id` 属性或作者链接 `href` 中提取

---

## 6. 发布者标签系统（Publisher Tracker）

### 6.1 设计目标

对发布者（作者）建立"行为档案"——每次某发布者的帖子被某条规则命中，就在该发布者的档案上累计一次对应类别的计数。在帖子作者名旁展示标签，让用户一眼识别"惯犯"。

### 6.2 追踪数据结构

```js
// 存储在 chrome.storage.local，key = "publisherStats"
{
  // key = "平台:authorId"（如 "weibo:12345678"）
  "weibo:12345678": {
    authorName: "某营销号",
    platform: "weibo",
    authorId: "12345678",
    profileUrl: "https://weibo.com/u/12345678",   // 可选，方便用户跳转

    // 按规则类别累计的违规次数
    // key = rule.id（或规则类别名）
    infractions: {
      "rule_advertising": { count: 5, lastHit: 1718230400000 },
      "rule_anxiety":     { count: 2, lastHit: 1718230400000 },
    },
    totalInfractions: 7,      // 所有类别合计
    firstSeen: 1718230400000, // 首次命中时间
  },

  "xiaohongshu:87654321": {
    authorName: "某带货博主",
    // ...
  }
}
```

### 6.3 工作流程

```
Filter Engine 命中规则
        │
        ▼
publisherTracker.record(platform, authorId, authorName, ruleId)
        │
        ├── 从 storage 读取 publisherStats
        ├── 查找或创建 publisherStats[`${platform}:${authorId}`]
        ├── 累加 infractions[ruleId].count
        ├── 更新 authorName（可能改名）
        ├── 写入 storage
        └── 触发 UI 更新
                │
                ▼
        扫描当前页面所有该 authorId 的帖子
                │
                ▼
        publisherTag.render(postElement, { authorName, infractions, totalInfractions })
```

### 6.4 标签 UI 展示

根据累计次数分三级展示：

| 级别 | 条件 | 展示效果 |
|---|---|---|
| 轻度 | 命中 1-2 次 | 灰色小标签：`📌 曾发布广告` |
| 中度 | 命中 3-9 次 | 橙色标签：`⚠ 曾发布广告 5 次` |
| 重度 | 命中 ≥10 次 | 红色标签：`🚫 频繁发布广告（12次）` |

标签直接插入到帖子 DOM 中作者名旁边，样式与平台原生 UI 融合（不突兀）。

### 6.5 数据管理

- **自动清理**：超过 90 天未命中的发布者记录自动清除
- **手动管理**：Popup 中可查看"发布者档案"列表，支持手动清除/加白名单
- **白名单**：用户标记"信任"的发布者，即使命中规则也不屏蔽（但仍显示标签供参考）

---

## 7. 已读淡化系统（Read History）

### 7.1 设计目标

自动记录用户浏览过的帖子，下次该帖子再次出现在 feed 中时以半透明样式展示，避免重复点击和注意力消耗。

### 7.2 数据结构

```js
// 存储在 chrome.storage.local，key = "readHistory"
{
  // key = "平台:postId"（如 "weibo:post_4987654321"）
  "weibo:post_4987654321": {
    postId: "post_4987654321",
    platform: "weibo",
    title: "某文章标题",        // 保存标题便于在 popup 中展示
    url: "https://...",         // 帖子链接
    firstSeen: 1718230400000,   // 首次浏览时间
    lastSeen: 1718230500000,    // 最近一次浏览时间
    viewCount: 3,               // 浏览次数
  },
  // ...
}
```

### 7.3 判定"已读"的触发条件

以下任一条件满足即标记为已读：

| 触发条件 | 说明 |
|---|---|
| **点击帖子** | 用户点击帖子正文/链接/评论区（最可靠） |
| **视口停留** | 帖子在视口中停留超过 5 秒（可配置） |
| **展开全文** | 用户点击"展开全文"（微博常见操作） |
| **手动标记** | 用户在帖子右键菜单选择"标记已读" |

### 7.4 淡化样式

```css
/* 已读帖子专用样式 — 叠加在原始帖子之上 */
.post-read-dimmed {
  opacity: 0.45;              /* 半透明 */
  filter: grayscale(20%);     /* 轻微去色 */
  transition: opacity 0.3s ease;
}

/* 鼠标悬停时恢复可读性 */
.post-read-dimmed:hover {
  opacity: 0.85;
  filter: grayscale(0%);
}
```

- 淡化不等于隐藏——hover 时恢复正常，用户仍可交互
- 不强改平台 DOM 结构，仅通过注入 CSS class 实现

### 7.5 数据管理

- **容量上限**：最多保留 2000 条记录（超出时淘汰最旧的）
- **时间淘汰**：超过 30 天的记录自动清除
- **手动清除**：Popup 中可按平台/时间范围清除已读历史

---

## 8. 存储设计

使用 `chrome.storage.sync`（跨设备同步） + `chrome.storage.local`（本地大数据）：

| Key | Storage | 内容 | 大小估算 |
|---|---|---|---|
| `rules` | sync | 用户自定义规则数组 | ~10KB |
| `settings` | sync | 全局开关、默认 action、已读停留秒数等 | ~500B |
| `stats` | local | 各规则命中统计 | ~1KB |
| `publisherStats` | local | 发布者档案：违规次数、类别、时间 | ~50KB |
| `readHistory` | local | 已读帖子记录：ID、时间、次数 | ~200KB |
| `platformCache` | local | 平台 DOM 选择器缓存 | ~2KB |

---

## 9. UI 设计

### 9.1 Popup 弹出窗口

```
┌─────────────────────────────────────┐
│  🧹 社交媒体净化器           [开关]  │
├─────────────────────────────────────┤
│  当前平台: 微博                      │
│  已过滤: 12 条 · 已读: 87 条         │
├─────────────────────────────────────┤
│  [过滤规则] [发布者档案] [已读历史]   │
├─────────────────────────────────────┤
│                                      │
│  📝 添加规则                         │
│  ┌─────────────────────────────────┐│
│  │ 描述你不想看的内容...            ││
│  └─────────────────────────────────┘│
│  [添加]                              │
│                                      │
│  我的规则 (3)                        │
│  ┌─────────────────────────────────┐│
│  │ ✅ 屏蔽焦虑营销    命中 5       ││
│  │ ✅ 屏蔽广告推广    命中 7       ││
│  │ ❌ 屏蔽追星内容    已暂停       ││
│  └─────────────────────────────────┘│
│                                      │
│  ── 发布者档案 ──                    │
│  ┌─────────────────────────────────┐│
│  │ 🚫 某营销号  广告12次/焦虑3次   ││
│  │ ⚠ 某带货    广告5次            ││
│  │ [查看全部 →]                    ││
│  └─────────────────────────────────┘│
│                                      │
│  ── 已读历史 ──                      │
│  ┌─────────────────────────────────┐│
│  │ 共 87 条已读 · 今日本站 15 条    ││
│  │ [清除30天前] [清除全部]          ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### 9.2 帖子遮罩（Content Script 注入）

被屏蔽的帖子显示为折叠卡片：

```
┌─────────────────────────────────────┐
│  🚫 此内容已被过滤                   │
│  原因: "屏蔽焦虑营销"               │
│  [展开查看] [不再过滤此类]           │
└─────────────────────────────────────┘
```

- **展开查看**：临时显示原帖内容（点击后 3 秒自动收回）
- **不再过滤此类**：一键禁用触发该命中的规则

---

## 10. 预设规则库（rules/presets.js）

内置一些开箱即用的规则模板，降低新用户使用门槛：

| 预设名称 | 关键词 | 说明 |
|---|---|---|
| 焦虑营销 | 焦虑、35岁危机、被裁、失业警告 | 制造职场/生活焦虑的内容 |
| 广告推广 | 限时优惠、点击购买、跳转链接 | 硬广和软广 |
| 标题党 | 震惊、万万没想到、惊呆了 | 低质量标题党内容 |
| 对立引战 | 凭什么、活该、活不起 | 刻意制造对立情绪 |

---

## 11. 消息通信设计

Content Script ↔ Service Worker ↔ Popup 之间的消息类型：

```js
// shared/message-types.js
const MSG = {
  // Popup → Service Worker → Content Script
  RULES_UPDATED:           "rules_updated",            // 规则变更通知
  GET_STATS:               "get_stats",                // 获取统计数据
  TOGGLE_ENGINE:           "toggle_engine",            // 全局开关
  GET_PUBLISHER_STATS:     "get_publisher_stats",      // 获取发布者档案
  CLEAR_PUBLISHER:         "clear_publisher",           // 清除某发布者记录
  GET_READ_HISTORY:        "get_read_history",          // 获取已读历史
  CLEAR_READ_HISTORY:      "clear_read_history",        // 清除已读历史

  // Content Script → Service Worker → Popup
  STATS_REPORT:            "stats_report",             // 统计数据上报
  PLATFORM_DETECTED:       "platform_detected",        // 当前平台检测结果
  PUBLISHER_UPDATED:       "publisher_updated",        // 发布者档案更新通知
  READ_HISTORY_UPDATED:    "read_history_updated",     // 已读历史更新通知

  // Content Script 内部
  POST_SCANNED:            "post_scanned",             // 帖子扫描完成
  RULE_MATCHED:            "rule_matched",             // 规则命中
  POST_READ_TRIGGERED:     "post_read_triggered",      // 帖子被标记为已读
};
```

---

## 12. 分阶段实施路线图

### Phase 1 — MVP 三大核心能力（当前）

**基础骨架**
- [ ] `manifest.json` + 基础扩展骨架
- [ ] Content Script 注入机制
- [ ] `chrome.storage` 持久化

**平台适配**
- [ ] 微博平台适配器（DOM 选择器 + 提取 + authorId/postId）
- [ ] 小红书平台适配器

**内容过滤**
- [ ] 规则引擎核心（关键词匹配）
- [ ] 规则解析器（简单模式匹配）
- [ ] UI Overlay（折叠 + 原因展示）
- [ ] 预设规则库
- [ ] Popup 基础界面（规则增删、开关）

**发布者标签**
- [ ] Publisher Tracker 核心（记录/累加/查询）
- [ ] Publisher Tag UI（三级标签渲染）
- [ ] Popup 发布者档案面板
- [ ] 发布者白名单

**已读淡化**
- [ ] Read History 核心（记录/去重/淘汰）
- [ ] Read Dim UI（半透明样式注入）
- [ ] 已读判定（点击/停留/展开）
- [ ] Popup 已读历史管理面板

### Phase 2 — 体验增强

- [ ] 正则表达式支持（高级模式）
- [ ] 规则命中统计与可视化
- [ ] 导入/导出规则（含发布者档案和已读历史）
- [ ] 自定义匹配作用域（仅标题 / 仅正文 / 含评论）
- [ ] 白名单模式（仅看包含某关键词的内容）

### Phase 3 — AI 集成（后续）

- [ ] 接入 LLM API（用户自然语言 → 自动生成关键词+语义规则）
- [ ] 语义相似度匹配（embedding 向量比对）
- [ ] 本地小模型（Transformers.js 在 Service Worker 中运行）
- [ ] 用户反馈学习（"误杀"按钮 → 调整规则）

---

## 13. 技术要点与注意事项

### 13.1 微博的挑战
- 微博大量使用 React/Vue 渲染，DOM 结构不稳定，选择器需要多层回退
- 部分内容在 Shadow DOM 中
- 无限滚动动态加载，需要 `MutationObserver` 持续监听

### 13.2 小红书的挑战
- 瀑布流布局，帖子可能同时出现在不同列
- 反爬机制较强，需要尽量保持低调（不修改页面结构，仅隐藏元素）
- 登录态检测（未登录时 feed 结构不同）

### 13.3 性能考量
- `MutationObserver` 需要 debounce（建议 300ms）
- 规则匹配使用 Trie 树优化多关键词查找
- contenteditable / input 区域不触发扫描
- 已处理的帖子用 `data-filter-checked` 属性标记，避免重复

### 13.4 Manifest V3 约束
- Service Worker 非持久化，不能依赖全局变量
- `chrome.storage.session` 可用于会话级临时数据
- Content Script 通过 `chrome.runtime.sendMessage` 与 Service Worker 通信

### 13.5 法律合规红线

> ⚠️ 以下为开发中必须遵守的法律合规底线，任何功能实现都不得逾越。

**数据全本地化**
- 所有用户数据（规则、发布者档案、已读历史）**仅存储在用户本地浏览器**（`chrome.storage.local` / `chrome.storage.sync`）
- **不收集、不上传、不传输**任何用户数据到任何远程服务器
- 不接入任何第三方统计/埋点/遥测 SDK
- 不向任何外部 API 发送用户浏览的帖子内容

**用户侧内容过滤**
- 本扩展属于**用户侧内容个性化过滤工具**，类比广告拦截器（ad blocker）、暗色模式插件
- 仅修改用户**自己浏览器中**的页面呈现效果（CSS 隐藏/淡化），不影响平台服务器上的原始内容
- 用户拥有对自己浏览器的自主控制权，选择不观看某些内容是其合法权利

**不绕过平台核心机制**
- ❌ 不绕过或尝试破解平台的付费墙、会员系统、DRM
- ❌ 不修改平台的广告投放逻辑（仅基于内容文本过滤，不针对广告系统 API）
- ❌ 不伪装用户身份、不篡改请求头、不伪造登录态
- ❌ 不自动操作平台界面（不模拟点击、不自动滚动、不自动关注/点赞）
- ✅ 仅读取 DOM 中的文本内容做本地匹配，匹配后通过 CSS 调整该帖子的可见性

**不抓取或再分发内容**
- 不将平台的帖子内容复制、存储、转发到任何其他位置
- 已读历史仅存储帖子 ID 和时间戳（用于去重判断），**不存储帖子正文**
- 发布者追踪仅累计规则命中次数，**不存储该发布者的帖子原文**

**用户知情与可控**
- 安装时通过 Chrome 权限提示明确告知：扩展会读取微博/小红书页面的 DOM 内容
- Popup 中提供**全局开关**，用户可随时一键暂停所有过滤
- 每条规则、每个发布者标签均可独立开关或删除
- 所有已读记录和发布者档案均可一键清除

**开源透明**
- 代码完全开源，不混淆、不压缩，任何人可审查扩展的真实行为
- Manifest 中声明的权限与代码实际使用的权限严格一致，不申请多余权限

**不针对特定个人或组织**
- 过滤规则基于内容特征（关键词、话题），不针对特定自然人、特定组织
- 发布者标签仅反映"该发布者的内容被用户自定义规则命中的次数"，属于用户个人偏好记录，而非对发布者的客观评价或诽谤

---

## 14. 文件依赖关系图

```
manifest.json
    │
    ├── background/service-worker.js
    │       └── shared/storage.js
    │
    ├── content/content-entry.js
    │       ├── core/filter-engine.js
    │       │       ├── core/rule-parser.js
    │       │       └── shared/rule-types.js
    │       ├── core/post-scanner.js
    │       ├── core/publisher-tracker.js
    │       │       └── shared/storage.js
    │       ├── core/read-history.js
    │       │       └── shared/storage.js
    │       ├── platforms/platform-base.js
    │       ├── platforms/weibo.js
    │       ├── platforms/xiaohongshu.js
    │       ├── ui/overlay.js
    │       ├── ui/reason-tag.js
    │       ├── ui/publisher-tag.js
    │       │       └── core/publisher-tracker.js
    │       ├── ui/read-dim.js
    │       │       └── core/read-history.js
    │       └── shared/storage.js
    │
    └── popup/popup.html
            ├── popup/popup.js
            │       ├── shared/storage.js
            │       └── shared/message-types.js
            ├── popup/popup.css
            └── rules/presets.js
```

---

## 15. 开发约定

- **不依赖任何 npm 包或构建工具**，所有代码为原生 ES Module（通过 `<script type="module">` 或直接注入）
- **不压缩、不混淆**，保持代码可读性（方便调试和审查）
- 所有文案使用**简体中文**
- 命名规范：
  - 文件名：`kebab-case.js`
  - 变量/函数：`camelCase`
  - 常量：`UPPER_SNAKE_CASE`
  - DOM 选择器变量：`SEL_` 前缀

---

> **下一步**：确认此框架结构后，从 `manifest.json` 和 `content-entry.js` 开始逐步实现。
