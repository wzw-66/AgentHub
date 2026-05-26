## ADDED Requirements

### Requirement: Artifact detail endpoint
系统应提供 `GET /api/artifacts/:id/detail` 端点，返回指定产物的完整信息。

#### Scenario: 获取产物详情
- **WHEN** 调用 `GET /api/artifacts/:id/detail`
- **THEN** 返回产物详情（type, url, content, status, createdAt）

#### Scenario: 产物不存在
- **WHEN** 产物 ID 不存在
- **THEN** 返回 404

#### Scenario: 未认证请求被拒绝
- **WHEN** 未携带 Bearer token
- **THEN** 返回 401

### Requirement: Artifact preview endpoint
系统应提供 `GET /api/artifacts/:id/preview` 端点，获取产物的预览内容（用于 iframe 嵌入）。

#### Scenario: 获取产物预览
- **WHEN** 调用 `GET /api/artifacts/:id/preview`
- **THEN** 返回产物的 `previewUrl` 或 `content` 字段

#### Scenario: 产物不存在
- **WHEN** 产物 ID 不存在
- **THEN** 返回 404
