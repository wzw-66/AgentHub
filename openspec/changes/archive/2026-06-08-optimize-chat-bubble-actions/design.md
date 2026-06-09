## Context

当前 `ChatPanel.tsx` 的消息操作按钮分为两层：
1. **hover-actions**（绝对定位在气泡上方）：Agent显示 Fork + Regenerate + Copy，User显示 Edit + Copy
2. **底部按钮**（在气泡下方）：所有消息显示 Reply，最后一条User消息还显示 Delete

这种双层设计带来几个问题：按钮位置分散、Fork功能无用、Regenerate/Edit在所有消息上都可触发而非仅在需要的位置。

## Goals / Non-Goals

**Goals:**
- 统一所有操作按钮到气泡下方（移除hover-actions绝对定位层）
- 精确控制 Regenerate/Edit 的显示条件（仅最后一条相关消息）
- 移除 Fork 和 Delete 按钮
- 保持现有功能逻辑不变（Regenerate API、Edit API、Reply、Copy）

**Non-Goals:**
- 不改动服务器端API逻辑（/regenerate、/update、/pin等接口不变）
- 不改动消息数据模型
- 不改动除了按钮操作以外的消息气泡UI

## Decisions

### Decision 1: 合并两层按钮为气泡下方单层

**选择：** 移除 hover-actions 绝对定位层，将所有按钮放在气泡下方的 flex 容器中。

**理由：**
- 当前 hover-actions 使用 `position: absolute; top: -14px; right: 2px` 悬浮在气泡上方，不符合 IM 类产品的交互直觉
- 统一在气泡下方更接近微信/Telegram等成熟IM的设计模式
- 简化CSS，减少 `position: absolute` 带来的布局问题

**替代方案考虑：** 保留 hover-actions 但调整位置 → 仍有两层按钮的冗余，不如一次性合并。

### Decision 2: 使用 useMemo 计算可操作消息集合

**选择：** 使用 `useMemo` 计算 `lastAgentMsgIds`（Set<string>）来判断哪些Agent消息可Regenerate。

**理由：**
- `lastUserMsgIdx` 已有的计算方式（从后往前遍历）足够高效
- 群聊场景需要按 senderId 分组取最后一条，Set 结构适合 O(1) 查找
- 依赖 messages 和 isGroupChat，当消息列表变化时自动重新计算

**逻辑：**
```typescript
const lastAgentMsgIds = useMemo(() => {
  const ids = new Set<string>();
  if (isGroupChat) {
    const seen = new Set<string>();
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.senderType?.toLowerCase?.() === "contact" && !seen.has(m.senderId)) {
        seen.add(m.senderId);
        ids.add(m.id);
      }
    }
  } else {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.senderType?.toLowerCase?.() === "contact") {
        ids.add(messages[i]!.id);
        break;
      }
    }
  }
  return ids;
}, [messages, isGroupChat]);
```

### Decision 3: 移除全局CSS中的 hover-actions 类

**选择：** 删除 globals.css 中的 `.hover-actions` 样式定义，改用内联样式控制按钮容器的定位和显隐。

**理由：**
- 按钮不再需要绝对定位，直接使用 flex 布局在气泡下方
- 内联样式 + hover state 控制 opacity 保持现有交互模式
- 减少对全局CSS的依赖

### Decision 4: 按钮显隐保持 hover 驱动

**选择：** 按钮只在消息被 hover 时显示（opacity: 0 → 1），延续当前交互模式。

**理由：**
- 用户未要求改变 hover 显隐行为，仅要求位置变更
- 保持界面简洁，避免按钮持续显示造成视觉噪音

## Risks / Trade-offs

- **[布局风险]** 按钮从气泡上方移到下方后，消息之间的垂直间距可能需要微调 → 已有 gap-3（12px），按钮容器约 24px 高，整体间距仍合理
- **[群聊Regenerate歧义]** 群聊中如果 Agent1 和 Agent2 交替发言，用户可能不清楚 Regenerate 是按 Agent 维度最后一条 → 这是按用户明确的业务规则设计的（每个AI最后一条输出可重新生成），不需要额外处理
- **[性能]** useMemo 依赖 messages 全量数组，单次 O(n) 遍历可忽略不计
