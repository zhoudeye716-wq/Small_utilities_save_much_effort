# 微信小程序恢复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在空工作区重建可由微信开发者工具导入的原生小程序，恢复两个已启用工具的截图所示页面与已知交互。

**Architecture:** 使用原生 WXML、WXSS、JavaScript 和 `wx` 本地存储，不依赖服务端。页面按首页、扑克决策助手、线下围坐拆分；围坐牌局状态转移放在独立模块，扑克决策输出单独封装，未由参考材料证明的算法不伪装为原版结果。

**Tech Stack:** 微信小程序原生工程；无第三方依赖。

**Spec:** `RESTORE_DESIGN.md`

## Global Constraints

- 必须使用原生微信小程序 WXML/WXSS/JavaScript。
- 两个已启用工具可用；三个“敬请期待”入口保持占位。
- 页面与牌局状态本地保存，不依赖线上服务。
- 本地牌力/胜率估算使用标准德州扑克规则实现，明确标注为估算，不声称复刻原版 AI。

## Review Focus

- 2–9 人桌的人数与座位角色映射符合指南，玩家少于 2 或多于 9 时不可进入。
- 一副牌不能重复选择同一张牌，手牌/公共牌数量不能超出牌局阶段。
- 已弃牌/已行动玩家不会重复行动；庄家和本人角色约束保持正确。
- 新一局重置筹码与按钮位置遵循指南；自动开始下一局时保留当前庄家位置。
- 竖屏手机与横向牌桌页面均可操作，滚动页的按钮不被系统导航区遮挡。

---

### Task 1: 原生工程骨架与首页

**Files:**
- Create: `project.config.json`, `app.json`, `app.js`, `app.wxss`
- Create: `pages/home/index.{json,wxml,wxss,js}`

**Interfaces:** 首页只负责入口与路由；其余页面路径在 `app.json` 中注册。

- [x] 建立可导入的小程序配置，首页设置为启动页。
- [x] 按截图实现暗色卡片首页、两个可用入口和三个占位入口。
- [x] 静态检查 JSON/JS 语法；开发者工具预览留待用户导入验证。

### Task 2: 扑克决策助手页面与选牌状态

**Files:**
- Create: `pages/analyzer-setup/index.{json,wxml,wxss,js}`
- Create: `pages/analyzer/index.{json,wxml,wxss,js}`
- Create: `pages/analyzer-guide/index.{json,wxml,wxss,js}`
- Create: `utils/cards.js`, `utils/decision.js`

**Interfaces:** `cards.js` 提供牌组与去重校验；`decision.js` 暴露 `analyzeHand(input)`，输入包含手牌、公共牌、筹码参数、玩家数与当前牌局状态。

- [x] 实现比率、总持有、单价、参与人数设置与本地保存。
- [x] 实现牌选择、共享牌、座位角色、筹码增量、持续开关、输赢/清空操作。
- [x] 基于标准牌型与随机对手模拟输出本地估算胜率，并比较底池赔率，明确说明不等同于原版 AI。
- [x] 静态检查；开发者工具手动交互留待用户导入验证。

### Task 3: 线下围坐设置、指南与牌桌

**Files:**
- Create: `pages/offline-setup/index.{json,wxml,wxss,js}`
- Create: `pages/offline-guide/index.{json,wxml,wxss,js}`
- Create: `pages/offline-table/index.{json,wxml,wxss,js}`
- Create: `utils/offline-table.js`

**Interfaces:** `createTable(config)`, `setDealer(state, seat)`, `setHero(state, seat)`, `applyAction(state, action)`, `settleHand(state, winnerSeat)`, `startNewHand(state, {resetStacks})`；均返回新状态，不直接操作页面。

- [x] 实现盲注、筹码、单价、人数设置与参与人数 2–9 的边界。
- [x] 按指南实现 D/SB/BB/UTG 等动态座位标签、庄家/本人选择、加注、弃牌、下一位、结算和新一局。
- [x] 实现横向桌面布局和截图中的筹码池及快捷加注按钮。
- [x] 静态检查；开发者工具手动走局留待用户导入验证。

### Task 4: 本地持久化与整体收尾

**Files:**
- Create: `utils/storage.js`
- Modify: 各设置/牌桌页面的状态读写

**Interfaces:** `loadState(key, fallback)`, `saveState(key, value)`, `clearState(key)` 封装 `wx.getStorageSync`/`wx.setStorageSync`。

- [x] 保存用户设置和线下牌局状态，清空操作只清理对应功能的数据。
- [x] 检查页面路径、返回导航、竖屏设置页与横向牌桌的切换。
- [ ] 用户在微信开发者工具导入并预览全部已实现页面；当前开发环境未运行微信开发者工具。
- [x] 记录原版策略细节仍需真实线上结果页或操作录屏才能复刻。

## 验证方式

不新增自动化测试；按各任务列出的静态语法检查与微信开发者工具手动预览/交互检查验证。
