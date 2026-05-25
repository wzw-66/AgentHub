## ADDED Requirements

### Requirement: User Registration
The system SHALL allow new users to register with email and password, and return JWT tokens upon successful registration.

#### Scenario: Successful registration
- **WHEN** user submits `POST /auth/register` with valid `email`, `name`, and `password` (minimum 8 characters)
- **THEN** the system SHALL create a new user, hash the password with bcryptjs, and return `201` status with `{ user: { id, name, email }, accessToken, refreshToken }`

#### Scenario: Duplicate email rejected
- **WHEN** user submits `POST /auth/register` with an email that already exists
- **THEN** the system SHALL return `409 Conflict` with error message indicating duplicate email

#### Scenario: Invalid email format rejected
- **WHEN** user submits `POST /auth/register` with an malformed email address
- **THEN** the system SHALL return `400 Bad Request`

#### Scenario: Short password rejected
- **WHEN** user submits `POST /auth/register` with a password of fewer than 8 characters
- **THEN** the system SHALL return `400 Bad Request`

### Requirement: User Login
The system SHALL authenticate users using email and password, and return JWT tokens upon successful authentication.

#### Scenario: Successful login
- **WHEN** user submits `POST /auth/login` with correct `email` and `password`
- **THEN** the system SHALL return `200` status with `{ user: { id, name, email }, accessToken, refreshToken }`, where accessToken has a 15-minute expiry and refreshToken has a 7-day expiry

#### Scenario: Invalid credentials
- **WHEN** user submits `POST /auth/login` with an incorrect password
- **THEN** the system SHALL return `401 Unauthorized`

#### Scenario: Non-existent email
- **WHEN** user submits `POST /auth/login` with an email that is not registered
- **THEN** the system SHALL return `401 Unauthorized` (same response as wrong password to prevent email enumeration)

### Requirement: Token Refresh
The system SHALL allow clients to obtain a new accessToken using a valid refreshToken.

#### Scenario: Successful token refresh
- **WHEN** user submits `POST /auth/refresh` with a valid, non-expired `refreshToken` in the request body
- **THEN** the system SHALL return `200` status with a new `accessToken` (15-minute expiry), while the refreshToken remains unchanged

#### Scenario: Expired refreshToken rejected
- **WHEN** user submits `POST /auth/refresh` with an expired refreshToken
- **THEN** the system SHALL return `401 Unauthorized`

#### Scenario: Invalid refreshToken signature rejected
- **WHEN** user submits `POST /auth/refresh` with a tampered refreshToken
- **THEN** the system SHALL return `401 Unauthorized`

### Requirement: JWT Authentication Middleware
The system SHALL provide a reusable authentication middleware that validates accessToken for protected routes.

#### Scenario: Valid accessToken passes middleware
- **WHEN** a request to a protected route includes `Authorization: Bearer <valid accessToken>`
- **THEN** the middleware SHALL verify the token, extract `userId`, attach it to the request context, and pass the request to the route handler

#### Scenario: Missing Authorization header rejected
- **WHEN** a request to a protected route has no `Authorization` header
- **THEN** the middleware SHALL return `401 Unauthorized` with error code `missing_token`

#### Scenario: Invalid token format rejected
- **WHEN** a request to a protected route includes a malformed `Authorization` header (e.g., no Bearer prefix)
- **THEN** the middleware SHALL return `401 Unauthorized`

#### Scenario: Expired accessToken rejected
- **WHEN** a request to a protected route includes an expired accessToken
- **THEN** the middleware SHALL return `401 Unauthorized` with error code `token_expired`

### Requirement: SSE/WebSocket Token Validation
The system SHALL support token validation via query parameters for SSE and WebSocket connections.

#### Scenario: SSE connection with valid token
- **WHEN** client connects to SSE endpoint with `?token=<valid accessToken>` query parameter
- **THEN** the system SHALL validate the token, extract `userId`, and establish the SSE connection

#### Scenario: SSE connection with invalid token rejected
- **WHEN** client connects to SSE endpoint with an invalid or expired token in query parameter
- **THEN** the system SHALL reject the connection with `401 Unauthorized`

#### Scenario: WebSocket connection with valid token
- **WHEN** client establishes a WebSocket connection with `?token=<valid accessToken>` query parameter
- **THEN** the system SHALL validate the token, extract `userId`, and establish the WebSocket connection

#### Scenario: WebSocket connection with invalid token rejected
- **WHEN** client attempts WebSocket connection with an invalid or expired token
- **THEN** the system SHALL reject the connection with a close frame indicating authentication failure
