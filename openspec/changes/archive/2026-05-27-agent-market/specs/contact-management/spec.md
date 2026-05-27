## ADDED Requirements

### Requirement: 联系人列表
系统应显示当前用户的联系人列表。

#### Scenario: 加载联系人
- **WHEN** 用户导航到联系人管理页面
- **THEN** 调用 `GET /api/contacts/list` 加载联系人列表
- **THEN** 列表按置顶状态排序（置顶在前），相同状态按名称字母序

#### Scenario: 显示联系人
- **WHEN** 联系人列表加载完成
- **THEN** 每个联系人在列表中显示关联 Agent 的头像、联系人显示名称和提供商
- **THEN** 置顶联系人显示置顶图标

#### Scenario: 空联系人列表
- **WHEN** 用户还没有任何联系人
- **THEN** 显示空状态提示"暂无联系人"

### Requirement: 编辑联系人显示名称
系统应允许用户修改联系人的显示名称。

#### Scenario: 编辑名称
- **WHEN** 用户在联系人上点击编辑
- **THEN** 显示编辑名称输入框，预填当前名称
- **THEN** 用户修改后保存，调用 `PATCH /api/contacts/:id/update`
- **THEN** 联系人列表更新为新的显示名称

### Requirement: 置顶/取消置顶联系人
系统应允许用户切换联系人的置顶状态。

#### Scenario: 置顶联系人
- **WHEN** 用户切换联系人的置顶开关
- **THEN** 调用 `PATCH /api/contacts/:id/update` 更新 isPinned 状态
- **THEN** 联系人列表重新排序

### Requirement: 删除联系人
系统应允许用户删除联系人。

#### Scenario: 删除联系人
- **WHEN** 用户在联系人上点击删除
- **THEN** 显示确认对话框
- **THEN** 用户确认后调用 `DELETE /api/contacts/:id/delete`
- **THEN** 联系人从列表中移除
