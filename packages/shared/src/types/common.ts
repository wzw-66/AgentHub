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
