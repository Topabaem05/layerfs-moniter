/**
 * Vendored from Topabaem05/Falsify (MIT, Copyright (c) 2026 Topabaem05).
 * Upstream path: packages/domain/src/result.ts
 * Local import paths point at monitor/src/falsify/types.ts instead of @falsify/contracts.
 * See ./LICENSE.
 */
/**
 * Minimal `Result` type (SDD §13, ADR-002).
 *
 * The domain never throws for expected outcomes: every rule returns a value the
 * caller must branch on. The application layer maps `DomainError.category` onto
 * the WebMCP `ToolResult.status` envelope (§7.2), so a thrown exception would
 * bypass the whole error contract.
 *
 * Deliberately hand-rolled instead of pulling in `neverthrow`: the domain
 * package has zero runtime dependencies (SDD §19).
 */
import type { DomainError } from "./errors.js";

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };

/** Success or failure, with `DomainError` as the default failure type. */
export type Result<T, E = DomainError> = Ok<T> | Err<E>;

/** A rule that only needs to say "allowed" — `Result<void>` in call sites. */
export type Check = Result<void, DomainError>;

export function ok(): Ok<void>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value?: T): Ok<T | undefined> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Maps the success value, propagating the error untouched. */
export function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Chains a fallible step onto a success. */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Runs checks in order and returns the first failure, or `ok()`.
 * Lazily evaluated so a later check never sees state an earlier one rejected.
 */
export function allChecks(...checks: readonly (() => Check)[]): Check {
  for (const check of checks) {
    const result = check();
    if (!result.ok) return result;
  }
  return ok();
}

/**
 * Escape hatch for tests and for call sites that have already proven success.
 * Throws on failure — never use it to handle an expected domain outcome.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`unwrap() on an error result: ${JSON.stringify(result.error)}`);
}

/** Mirror of {@link unwrap} for the failure branch. */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (!result.ok) return result.error;
  throw new Error(`unwrapErr() on a success result: ${JSON.stringify(result.value)}`);
}
