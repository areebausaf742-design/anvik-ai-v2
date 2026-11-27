/**=============================================================================
 * ANVIK AI — WAF Middleware (Enterprise Security)
 * ============================================================================
 * Provides Web Application Firewall protection for API routes.
 * Blocks SQL injection, XSS, path traversal, and bad bot patterns.
 * Designed for Next.js API routes with the edge runtime.
 * ==========================================================================*/

import type { Request, Response } from "express";

/** SQL injection patterns (normalized, case-insensitive) */
const SQL_PATTERNS = [
  /(?:union\s+select|insert\s+into|delete\s+from|drop\s+table|alter\s+table|create\s+table)/i,
  /(?:exec\s*\(|execute\s*|sp_|xp_cmdshell)/i,
  /(?:--|;|%27|%3B)/, // comment and statement terminator
];

/** XSS patterns */
const XSS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe[^>]*>/i,
  /onerror\s*=/i,
];

/** Path traversal patterns */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\./,
  /%2e%2e/,
  /%2e%2e/i,
];

/** Bad bot user-agent patterns */
const BAD_BOT_PATTERNS = [
  /^$bot$/i,
  /^python-requests/i,
  /^curl/i,
  /^wget/i,
  /^http-client/i,
];

/** WAF result */
export interface WafResult {
  blocked: boolean;
  reason?: string;
  blockedAt: number;
}

/** Run WAF checks on a request */
export function runWafCheck(request: Request): WafResult {
  const body = request.body ?? "";
  const query = request.nextUrl.search ?? "";
  const userAgent = request.headers.get("user-agent") ?? "";
  const path = request.nextUrl.pathname;

  // Check body for SQL injection
  for (const pattern of SQL_PATTERNS) {
    if (pattern.test(body)) {
      return {
        blocked: true,
        reason: "SQL injection attempt detected",
        blockedAt: Date.now(),
      };
    }
  }

  // Check body for XSS
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(body)) {
      return {
        blocked: true,
        reason: "Cross-site scripting attempt detected",
        blockedAt: Date.now(),
      };
    }
  }

  // Check for path traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(path) || pattern.test(body)) {
      return {
        blocked: true,
        reason: "Path traversal attempt detected",
        blockedAt: Date.now(),
      };
    }
  }

  // Check user-agent for bad bots
  for (const pattern of BAD_BOT_PATTERNS) {
    if (pattern.test(userAgent)) {
      return {
        blocked: true,
        reason: "Bot user-agent detected",
        blockedAt: Date.now(),
      };
    }
  }

  // Check query string for common attack patterns
  const fullPath = path + query;
  for (const pattern of SQL_PATTERNS.concat(XSS_PATTERNS)) {
    if (pattern.test(fullPath)) {
      return {
        blocked: true,
        reason: "Attack pattern in query string detected",
        blockedAt: Date.now(),
      };
    }
  }

  return {
    blocked: false,
    blockedAt: Date.now(),
  };
}

/** WAF middleware for Express/Next.js routes */
export function wafMiddleware(req: Request, res: Response, next: any): void {
  const result = runWafCheck(req);

  if (result.blocked) {
    res.status(403).json({
      error: "Request blocked by WAF",
      code: "waf_blocked",
      reason: result.reason,
      timestamp: result.blockedAt,
    });
    return;
  }

  next();
}

/** Helper to add WAF protection to Next.js API routes */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function withWafProtection(handler: (req: Request, res: Response) => Promise<void>): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response) => {
    try {
      // Quick WAF check on the path and method
      const path = req.nextUrl?.pathname ?? req.path ?? "";
      const ua = req.headers.get("user-agent") ?? "";

      // Simple checks without full body parsing
      const dangerousPatterns = [/\.\./, /<script/i, /union\s+select/i];
      for (const pat of dangerousPatterns) {
        if (pat.test(path) || (req.method === "POST" && pat.test(req.body ?? ""))) {
          res.status(403).json({
            error: "Request blocked by security filter",
            code: "security_blocked",
          });
          return;
        }
      }

      await handler(req as any, res);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  };
}