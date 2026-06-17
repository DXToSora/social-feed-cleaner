# 🧹 社交媒体净化器

智能过滤中文社交媒体信息流——用自然语言描述"不想看什么"，自动帮你屏蔽。

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 功能

| 能力 | 说明 |
|---|---|
| 🔇 **内容过滤** | 用自然语言描述不想看的内容（如「屏蔽焦虑营销」「屏蔽广告推广」），自动识别并折叠 |
| 🏷 **发布者标签** | 自动追踪违规发布者，在作者名旁标注「曾发布广告 5 次」 |
| 👁 **已读淡化** | 浏览过的帖子变半透明，避免重复点击 |

## 支持的平台

- ✅ 微博（weibo.com）
- ✅ 小红书（xiaohongshu.com）
- ✅ 抖音（douyin.com）

## 安装

1. 下载本仓库或 `git clone`
2. 打开 Chrome/Edge，地址栏输入 `chrome://extensions`（Edge 用 `edge://extensions`）
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择本项目文件夹
6. 完成

## 使用

### 添加规则

1. 打开微博或小红书
2. 点击工具栏的扩展图标，弹出面板
3. 输入「屏蔽xxx」，点击添加
4. 刷新页面，匹配的帖子即被折叠

### 规则示例

| 输入 | 效果 |
|---|---|
| `屏蔽广告` | 屏蔽含「广告」的帖子 |
| `屏蔽焦虑和失业` | 必须同时包含「焦虑」和「失业」才屏蔽 |
| `屏蔽广告或推广` | 包含任一关键词即屏蔽 |
| `不要推荐带货` | 屏蔽含「带货」「推荐」的帖子 |

### 预设规则

面板中提供开箱即用的预设：焦虑营销、广告推广、标题党、对立引战、热点引流。

## 项目结构

```
social-feed-cleaner/
├── manifest.json              # Chrome 扩展配置
├── background/                # Service Worker（消息路由、存储）
├── content/                   # Content Script（页面注入）
│   ├── core/                  # 核心引擎
│   │   ├── filter-engine.js   #   规则匹配引擎
│   │   ├── rule-parser.js     #   自然语言解析
│   │   ├── post-scanner.js    #   帖子扫描器
│   │   ├── publisher-tracker.js # 发布者追踪
│   │   └── read-history.js    #   已读记录
│   ├── platforms/             # 平台适配器
│   │   ├── weibo.js           #   微博
│   │   ├── xiaohongshu.js     #   小红书
│   │   └── douyin.js          #   抖音
│   └── ui/                    # 界面组件
│       ├── overlay.js         #   折叠遮罩
│       ├── publisher-tag.js   #   发布者标签
│       └── read-dim.js        #   已读淡化
├── popup/                     # 弹出面板
├── shared/                    # 共享模块
│   ├── storage.js             #   存储封装
│   ├── rule-types.js          #   规则数据结构
│   └── message-types.js       #   消息类型
└── rules/                     # 预设规则库
```

## 技术栈

- 纯前端，零依赖，零构建
- Chrome/Edge Manifest V3
- `chrome.storage` 持久化
- `MutationObserver` 实时扫描

## 文档

完整架构设计见 [DESIGN.md](DESIGN.md)

