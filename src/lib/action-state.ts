/**
 * Shared shape for server-action results.
 *
 * Deliberately NOT inside a "use server" module: those may only export async
 * functions, so the type and its initial value live here.
 */
export interface ActionState {
  ok: boolean;
  message: string;
  /** Field-level messages, keyed by input name. */
  errors?: Record<string, string>;
}

export const idle: ActionState = { ok: false, message: "" };

export interface BulkResult {
  created: number;
  skipped: number;
  names: string[];
}

export interface LoginState {
  error?: string;
}
