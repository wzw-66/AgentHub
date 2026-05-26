## ADDED Requirements

### Requirement: Credential list endpoint
系统应提供 `GET /api/credentials/list` 端点，返回当前用户的 API 凭据列表，加密密钥脱敏。

#### Scenario: 列出凭据（脱敏）
- **WHEN** 调用 `GET /api/credentials/list`
- **THEN** 返回凭据数组，其中 `encryptedKey` 字段替换为 `"****"`，不暴露原始加密密钥

#### Scenario: 未认证请求被拒绝
- **WHEN** 未携带 Bearer token
- **THEN** 返回 401

### Requirement: Credential create endpoint
系统应提供 `POST /api/credentials/create` 端点，保存新的 API 凭据。

#### Scenario: 创建凭据
- **WHEN** 使用 `{ provider, encryptedKey }` 调用 `POST /api/credentials/create`
- **THEN** 返回 201 及新创建的凭据

#### Scenario: 缺少必需字段被拒绝
- **WHEN** 请求体缺少 `provider` 或 `encryptedKey`
- **THEN** 返回 400

### Requirement: Credential delete endpoint
系统应提供 `DELETE /api/credentials/:id/delete` 端点，删除指定凭据。

#### Scenario: 删除凭据
- **WHEN** 调用 `DELETE /api/credentials/:id/delete`
- **THEN** 返回 204

#### Scenario: 凭据不存在
- **WHEN** 凭据 ID 不存在
- **THEN** 返回 404

#### Scenario: 删除他人凭据被拒绝
- **WHEN** 当前用户不是该凭据的所有者
- **THEN** 返回 403
