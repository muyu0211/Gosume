# 动画改进方案

> 以下方案供审核，暂不实施。每项标注了影响范围、实现难度和预期效果。

---

## 1. 缓动曲线升级 [中等难度 · 全局影响]

**现状：** 所有动画使用 CSS `ease-out` / `ease-in`，缺乏物理感。

**方案：** 引入 CSS `cubic-bezier` 自定义缓动曲线，模拟自然物理运动。

```css
:root {
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);    /* 弹性出场（弹入） */
  --ease-out-smooth: cubic-bezier(0.16, 1, 0.3, 1);      /* 流畅出场 */
  --ease-in-smooth: cubic-bezier(0.4, 0, 1, 1);          /* 流畅入场 */
  --ease-in-out-smooth: cubic-bezier(0.65, 0, 0.35, 1);  /* 平滑过渡 */
}
```

**预期效果：** 所有动画更有质感，不再是机械的 ease-out。与 Apple HIG / Material Design 3 的高级缓动曲线一致。

---

## 2. 模板卡片交互动效 [低难度 · WelcomePage]

**现状：** 卡片 hover 仅简单的 shadow + border 变化（`transition-all`）。

**方案：**
- Hover 时卡片微微上浮 `-translateY-1`（约 4px）+ 阴影增强
- 点击时卡片缩放反馈 `active:scale-[0.97]`
- 模板预览 iframe 在 hover 时有极微小的缩放（1.02x）

**代码示例：**
```tsx
className="group cursor-pointer rounded-xl border border-surface-200 bg-white 
           overflow-hidden hover:shadow-md hover:border-primary-300 
           transition-all duration-300 ease-out
           hover:-translate-y-1 active:scale-[0.97]"
```

**预期效果：** 卡片有"可交互"的明确反馈，符合 Material Design 的卡片交互规范。

---

## 3. 侧边栏图标切换动画 [低难度 · Sidebar]

**现状：** 点击侧边栏图标时，仅颜色变化，无过渡。

**方案：**
- 激活态背景从透明过渡到 primary-600（已有 `transition-all`）
- 图标本身做微小的弹跳：`active:scale-90` → 恢复
- 激活图标添加微小的发光效果（`shadow-sm shadow-primary-600/25`）

**预期效果：** 提升侧边栏的操作感，视觉上更清晰知道当前选择了哪个项。

---

## 4. 页面切换共享元素过渡 [高难度 · 全局路由]

**现状：** 路由切换仅使用 `animate-page-enter`（淡入+上移），无连贯性。

**方案：**
- WelcomePage 选择模板后，模板卡片"飞入"编辑器预览区（共享元素转场）
- 使用 `animate-page-enter` 的同时，关键元素做独立动画

**⚠️ 注意：** 这是高难度方案，React Router 原生不支持共享元素过渡。需要：
- 引入 `framer-motion` 的 `AnimatePresence` + `layoutId`
- 或使用 FLIP 动画技术手动实现

**建议：** 暂缓实施，可作为后续版本的亮点功能。当前先用页面级别的淡入过渡即可。

---

## 5. 列表交错入场动画 [低难度 · ResumeListDrawer / 欢迎页]

**现状：** 简历列表一次性全部出现，无层次感。

**方案：**
- 为列表项添加 `stagger` 延迟（每项间隔 30-50ms）
- 使用 CSS animation-delay 或 JS 动态 style

```tsx
{resumeList.map((item, i) => (
  <div style={{ animationDelay: `${i * 40}ms` }} className="animate-section-enter">
    {/* list item */}
  </div>
))}
```

**预期效果：** 列表展开时有层次感，符合 Material Design 的 staggered list 规范。

---

## 6. 导出按钮成功/失败微动效 [低难度 · ExportDialog]

**现状：** 导出完成后仅显示绿色对勾文本。

**方案：**
- 导出成功时：按钮短暂变为绿色 + 打勾图标做弹性缩放动画
- 导出失败时：按钮微微抖动（shake animation 2-3 次）+ 显示错误信息

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
```

**预期效果：** 操作反馈更生动，用户一眼就知道结果状态。

---

## 7. 骨架屏 shimmer 优化 [低难度 · 所有 Skeleton]

**现状：** 加载骨架使用 `animate-pulse`（整块闪烁），较生硬。

**方案：** 使用 shimmer 流动光效替代 pulse：

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(90deg, #f5f5f4 25%, #e7e5e4 50%, #f5f5f4 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

**注：** 此方案已在 globals.css 中添加了 `.animate-shimmer` 类，EditorSkeleton 已改为使用 shimmer。

**预期效果：** 加载状态更流畅、更现代，类似 macOS/iOS 的骨架屏效果。

---

## 8. 编辑器分区切换交叉淡入淡出 [低难度 · EditorPanel]

**现状：** 切换编辑分区时，使用 `animate-section-enter`（仅入场动画，旧内容立即消失）。

**方案：**
- 旧内容淡出（0.1s）→ 新内容淡入（0.2s），交叉过渡
- 使用 `AnimatePresence` 或 CSS transition group

**预期效果：** 内容切换更平滑，不会有"闪烁"感。

---

## 9. 数值滚动动画 [低难度 · Toolbar Zoom 显示]

**现状：** 缩放百分比直接跳变（如 100% → 90%）。

**方案：** 使用 `useSpring` 或 CSS transition 让数字平滑过渡：

```tsx
// 简化的计数动画
<span className="tabular-nums transition-all duration-200">
  {Math.round(zoom * 100)}%
</span>
```

**预期效果：** 缩放数值变化更流畅。

---

## 实施优先级建议

| 优先级 | 方案 | 理由 |
|--------|------|------|
| 🔴 P0 | 7. 骨架屏 shimmer | 已在代码中实施，无需额外工作 |
| 🟡 P1 | 1. 缓动曲线升级 | 全局影响，改动小，效果明显 |
| 🟡 P1 | 2. 模板卡片交互动效 | WelcomePage 是门面，用户体验关键 |
| 🟢 P2 | 3. 侧边栏图标切换 | 提升操作反馈感 |
| 🟢 P2 | 5. 列表交错入场 | 小幅改动，效果明显 |
| 🟢 P2 | 6. 导出按钮动效 | 关键操作的反馈很重要 |
| 🔵 P3 | 8. 分区切换过渡 | 需要引入 AnimatePresence |
| 🔵 P3 | 9. 数值滚动动画 | 锦上添花 |
| ⚪ 远期 | 4. 共享元素过渡 | 需要引入 framer-motion，工作量大 |

---

请审阅以上方案，确认后我将按优先级逐步实施。
