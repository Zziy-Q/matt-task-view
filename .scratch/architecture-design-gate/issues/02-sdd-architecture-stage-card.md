---
id: "02"
status: done
depends_on:
  - "01"
blocked_reason: ""
phase: "架构展示"
architecture_revision: "22a77a88c144e7bfc649f20b6b5c2a13c70c2eeea6d3fd584895a8f96ef8f5f0"
affects:
  - "planned"
  - "validation"
  - "approval"
---

# 02: 在 SDD 中安全展示中文架构阶段卡片

**What to build:** 用户在开发任务视图的 SDD 流程中看到位于“规格”与“任务规划”之间的第二张原生架构卡片；卡片以中文概览可信架构，并通过隔离页面按需展开 Archify 大图。

**Blocked by:** 01: 从架构事实生成开发门禁.

**Status:** ready-for-agent

- [x] 架构卡片固定处于规格与任务规划之间；初始化、待批准、过期和实际架构待复核时自动展开，批准且进入实现后默认折叠。
- [x] 卡片显示下一步、设计类型、架构变化、代码证据、生命周期、修订绑定、受影响组件和绑定工单，所有用户可见架构内容使用中文。
- [x] 架构工件路由只返回功能目录内经回执核验的当前或最后可信 HTML，并拒绝路径穿越、缺失文件和产物篡改。
- [x] iframe 仅允许 `allow-scripts`、禁止 `allow-same-origin`，响应设置严格 CSP、无引用来源、`nosniff`、同源资源策略和权限限制。
- [x] 526px 与 390px 窄面板先显示概览并提供“展开大图”，无横向溢出；键盘、焦点和状态信息不只依赖颜色。
- [x] 使用服务、渲染和浏览器回归测试覆盖正常、窄屏、安全失败和空态。

## Comments

- 2026-09-03：`npm test` 38/38 通过；真实中文 Archify 工件读回 SHA-256 `a0313c21fcbf7e0fd3e259de276085efd73f0c57936981922862f730dda25fd4`、721728 字节。
- 2026-09-03：浏览器回归在 CSS 视口 526px 与 390px 均满足 `document.documentElement.scrollWidth === innerWidth`；窄屏概览和“展开大图”可见，键盘可展开原生卡片且焦点轮廓可见，iframe 为 `sandbox="allow-scripts"`。
