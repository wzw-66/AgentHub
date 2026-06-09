## Why

当前聊天面板的消息气泡操作按钮存在多个可用性和交互问题：Fork（实际是Pin）功能对用户无实际价值、Regenerate/Edit按钮在所有消息上显示而非仅最后一条、按钮悬浮在气泡上方不符合IM交互直觉、以及用户消息的Delete按钮易导致误操作。需要系统性地优化消息气泡的操作按钮体系。

## What Changes

- **移除Fork按钮**：删除Agent消息上的Fork/Pin按钮及相关的API调用
- **Regenerate只在最后一条Agent消息显示**：
  - 单聊：仅该会话最后一条Agent消息显示Regenerate
  - 群聊：每个Agent的最后一条输出消息显示Regenerate
- **Edit只在最后一条User消息显示**：仅该会话最后一条用户消息显示编辑按钮
- **按钮重新定位到气泡下方**：
  - Agent消息：按钮居右下角（Reply + Regenerate）
  - User消息：按钮居左下角（Reply + Edit）
  - 不再使用绝对定位悬浮在气泡上方
- **移除Delete按钮**：删除用户消息的Delete按钮及确认弹窗

## Capabilities

### New Capabilities
- `message-actions`: 消息气泡操作按钮的交互规则，包括按钮类型、显示条件、位置布局

### Modified Capabilities
- *None* — 本次变更涉及的功能（Fork/Regenerate/Edit/Delete等操作按钮）在现有spec中未定义行为规范，属于新增规范

## Impact

- `apps/web/components/ChatPanel.tsx` — 主要修改：删除Fork/Regenerate/Edit/Delete按钮的渲染逻辑和条件判断，重构按钮定位方式
- `apps/web/src/app/globals.css` — 移除或修改 `.hover-actions` 类（不再需要绝对定位在气泡上方）
