export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface HealthStatus {
  status: "healthy" | "unhealthy";
  latency: number;
  message?: string;
}

/**
 * 把 Json 列读回的 JsonValue 收窄成 string[]。
 *
 * 用于 tags / contactIds 这类在 PostgreSQL 上是 String[]、在 SQLite 上退化为
 * Json 的字段。非数组或含非字符串元素时返回空数组 —— Json 列的值不受 schema
 * 约束，不能假设它一定是合法数组。
 */
export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
