## ADDED Requirements

### Requirement: 最后一条消息 hover 操作
系统 SHALL 在聊天面板的最后一条用户消息上 hover 时显示编辑和删除按钮。

#### Scenario: 最后一条用户消息显示操作按钮
- **WHEN** 用户将鼠标悬停在最后一条 senderType 为 "user" 的消息上
- **THEN** 该消息右上角显示编辑（✏️）和删除（🗑）按钮

#### Scenario: 非最后一条消息不显示操作
- **WHEN** 用户将鼠标悬停在非最后一条消息上
- **THEN** 不显示编辑或删除按钮

#### Scenario: Agent 消息不显示操作
- **WHEN** 用户将鼠标悬停在 senderType 为 "contact" 的消息上
- **THEN** 不显示编辑或删除按钮

#### Scenario: 鼠标移出后按钮消失
- **WHEN** 用户将鼠标移出消息区域
- **THEN** 操作按钮隐藏

### Requirement: 消息编辑
系统 SHALL 支持用户编辑最后一条已发送的消息。

#### Scenario: 进入编辑模式
- **WHEN** 用户点击消息的编辑按钮
- **THEN** 消息内容区域切换为 textarea，预填当前内容，下方显示 [保存] 和 [取消] 按钮

#### Scenario: 保存编辑
- **WHEN** 用户在编辑模式下修改内容后点击保存
- **THEN** 调用 `PATCH /api/conversations/:convId/messages/:msgId/update` 更新消息内容
- **AND** 成功后本地 messages 数组同步更新，退出编辑模式

#### Scenario: 取消编辑
- **WHEN** 用户在编辑模式下点击取消
- **THEN** 恢复消息原始显示，不提交修改

#### Scenario: 编辑时清空内容
- **WHEN** 用户将消息内容清空后点击保存
- **THEN** 不提交，提示内容不能为空

### Requirement: 消息删除
系统 SHALL 支持用户删除最后一条已发送的消息。

#### Scenario: 确认删除
- **WHEN** 用户点击删除按钮
- **THEN** 弹出确认提示（或直接删除），调用 `DELETE /api/conversations/:convId/messages/:msgId/delete`

#### Scenario: 删除后更新列表
- **WHEN** 删除 API 返回成功
- **THEN** 消息从本地 messages 数组中移除
