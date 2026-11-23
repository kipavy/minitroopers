import type { Config } from "./config.ts";

/**
 * Client IP. CF-Connecting-IP is honoured only when TRUST_PROXY=1 (server behind Cloudflare Tunnel);
 * otherwise a spoofable header would let anyone pick their own IP.
 */
export function clientIp(cfg: Config, header: (name: string) => string | undefined, remote: string | undefined): string {
  if (cfg.trustProxy) {
    const cf = header("cf-connecting-ip")?.trim();
    if (cf) return cf;
  }
  return remote ?? "unknown";
}
