export type Ok<T> = { ok: true; value: T };
export type Err<E extends string> = { ok: false; error: E };
export type Result<T, E extends string> = Ok<T> | Err<E>;

export const ok = <T = undefined>(value?: T): Ok<T> => ({ ok: true, value: value as T });
export const err = <E extends string>(error: E): Err<E> => ({ ok: false, error });
