export type ActionResult =
  | { ok: true; json: any }
  | { ok: false; errorNumber: number };
