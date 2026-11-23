import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

/** Size limit of a posted form (bytes): a larger body is refused with 413 before it is parsed. */
export const formBody = (maxSize = 4096): MiddlewareHandler => bodyLimit({ maxSize, onError: (c) => c.text("Requête trop grande", 413) });
