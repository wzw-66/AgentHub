## ADDED Requirements

### Requirement: 消息按发送者类型对齐
系统 SHALL 根据消息的 senderType 使用不同的对齐方式。

#### Scenario: 用户消息右对齐
- **WHEN** 消息的 `senderType` 为 `"user"`
- **THEN** 该消息气泡在聊天容器中右对齐

#### Scenario: Contact 消息左对齐
- **WHEN** 消息的 `senderType` 为 `"contact"`
- **THEN** 该消息气泡在聊天容器中左对齐

#### Scenario: 系统消息居中
- **WHEN** 消息的 `senderType` 为 `"system"`
- **THEN** 该消息气泡在聊天容器中居中对齐

### Requirement: 对齐方式使用 flex alignSelf 实现
系统 SHALL 使用 flex 容器的 `alignSelf` 属性实现消息对齐，而非 `textAlign` + `inline-block` 的组合方式。

#### Scenario: 父容器为 flex-col
- **WHEN** 消息容器使用 `display: flex; flex-direction: column`
- **THEN** 每条消息的包装 div 通过 `alignSelf` 属性定位
