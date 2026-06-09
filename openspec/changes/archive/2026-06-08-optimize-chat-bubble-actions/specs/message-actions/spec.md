## ADDED Requirements

### Requirement: Agent消息操作按钮
Agent消息在hover时SHALL在气泡下方右下角显示操作按钮。

#### Scenario: Agent消息显示Reply按钮
- **WHEN** 用户hover到Agent消息气泡
- **THEN** 在气泡下方右下角显示Reply按钮

#### Scenario: 单聊最后一条Agent消息显示Regenerate
- **WHEN** 当前为单聊会话，用户hover到最后一条Agent消息（该会话中senderType为contact的最后一条消息）
- **THEN** 在气泡下方右下角显示Reply和Regenerate按钮

#### Scenario: 单聊非最后一条Agent消息不显示Regenerate
- **WHEN** 当前为单聊会话，用户hover到非最后一条Agent消息
- **THEN** 气泡下方右下角仅显示Reply按钮，不显示Regenerate按钮

#### Scenario: 群聊每个Agent的最后一条消息显示Regenerate
- **WHEN** 当前为群聊会话，用户hover到某个Agent的最后一条输出（该Agent在该会话中的最后一条消息）
- **THEN** 在气泡下方右下角显示Reply和Regenerate按钮

#### Scenario: 群聊非最后一条消息不显示Regenerate
- **WHEN** 当前为群聊会话，用户hover到某个Agent的非最后一条消息
- **THEN** 气泡下方右下角仅显示Reply按钮

#### Scenario: Agent消息不显示Fork按钮
- **WHEN** 用户hover到任何Agent消息
- **THEN** 不显示Fork/Pin按钮

#### Scenario: Agent消息不显示Edit按钮
- **WHEN** 用户hover到任何Agent消息
- **THEN** 不显示Edit按钮

#### Scenario: Agent消息不显示Delete按钮
- **WHEN** 用户hover到任何Agent消息
- **THEN** 不显示Delete按钮

### Requirement: 用户消息操作按钮
用户消息在hover时SHALL在气泡下方左下角显示操作按钮。

#### Scenario: 用户消息显示Reply按钮
- **WHEN** 用户hover到用户消息气泡
- **THEN** 在气泡下方左下角显示Reply按钮

#### Scenario: 最后一条用户消息显示Edit
- **WHEN** 用户hover到该会话中最后一条用户消息
- **THEN** 在气泡下方左下角显示Reply和Edit按钮

#### Scenario: 非最后一条用户消息不显示Edit
- **WHEN** 用户hover到非最后一条用户消息
- **THEN** 气泡下方左下角仅显示Reply按钮

#### Scenario: 用户消息不显示Delete
- **WHEN** 用户hover到任何用户消息
- **THEN** 不显示Delete按钮

### Requirement: 按钮悬浮显示
所有操作按钮SHALL仅在用户hover到对应消息气泡时显示，鼠标移出时隐藏。

#### Scenario: 按钮hover显示
- **WHEN** 用户鼠标进入消息区域
- **THEN** 操作按钮以淡入动画显示

#### Scenario: 按钮hover隐藏
- **WHEN** 用户鼠标移出消息区域
- **THEN** 操作按钮以淡出动画隐藏

### Requirement: 操作按钮功能
各操作按钮SHALL保持现有功能不变。

#### Scenario: Reply功能
- **WHEN** 用户点击Reply按钮
- **THEN** 输入框上方显示回复引用条，包含被回复消息的预览

#### Scenario: Regenerate功能
- **WHEN** 用户点击Regenerate按钮
- **THEN** 调用 `POST /api/conversations/{id}/messages/{msgId}/regenerate`，Agent重新生成回复

#### Scenario: Edit功能
- **WHEN** 用户点击Edit按钮
- **THEN** 消息气泡变为textarea编辑模式，用户可修改内容后Save或Cancel

#### Scenario: Copy功能
- **WHEN** 用户点击Copy按钮
- **THEN** 消息内容被复制到剪贴板
