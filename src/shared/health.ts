/** The environment checks, in the order they are evaluated. */
export type HealthCheck = "binary" | "version" | "project";

/** The body of `GET /api/health`. Imported by both the server and the client. */
export interface HealthResponse {
  status: "ok" | "error";
  /** The first check that failed. Absent when `status` is `ok`. */
  check?: HealthCheck;
  /** Human-readable description of the failure. Absent when `status` is `ok`. */
  message?: string;
  /** A concrete corrective action. Absent when `status` is `ok`. */
  remedy?: string;
  /** Absolute path the binary resolved to, whenever resolution succeeded. */
  resolvedBinaryPath?: string;
  /** The version the binary reported, whenever it could be obtained. */
  version?: string;
  projectRoot?: string;
}
