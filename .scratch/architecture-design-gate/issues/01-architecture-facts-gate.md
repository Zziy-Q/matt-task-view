---
id: "01"
status: done
depends_on: []
blocked_reason: ""
phase: "架构门禁"
architecture_revision: "22a77a88c144e7bfc649f20b6b5c2a13c70c2eeea6d3fd584895a8f96ef8f5f0"
affects:
  - "impact"
  - "planned"
  - "validation"
  - "approval"
---

# 01: 从架构事实生成开发门禁

**What to build:** 用户可以把架构影响判断、Archify JSON、已交付 HTML、交付回执和显式批准记录放进功能目录，在任务图快照和 SDD 摘要中看到可信的架构状态；需要架构却尚未批准的功能不能进入开发前沿。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] 快照公开架构影响判断、生命周期、当前哈希、回执核验结果、组件和下一步；全新项目没有“当前架构”是正常状态。
- [x] 门禁区分“不需要且有理由”、缺失或未核验、待批准、已批准、架构源已变化、展示产物被篡改等状态。
- [x] 只有批准记录中的规格 SHA、回执中的规格 SHA、当前 JSON SHA 三者一致，且 HTML 与回执中的产物 SHA 和字节数一致，才算已批准；工具校验成功不能代替用户批准。
- [x] 需要架构但未批准或已过期时，尚未开始的 ready 工单不能进入开发前沿；不含架构文件的既有功能保持兼容并可只读展示。
- [x] 使用 Node 内置测试覆盖正常、缺失、过期、篡改、跳过和向后兼容分支。
