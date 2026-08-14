import { UnitValue } from "./units.js";
import { KevError } from "./errors.js";

export class KevHttpResponse {
  body: any;
  status: number;
  headers: Record<string, string>;

  constructor(
    body: any,
    status: number = 200,
    headers: Record<string, string> = {}
  ) {
    this.body = body;
    this.status = status;
    this.headers = headers;
  }
}

export interface KevRoute {
  method: string;
  path: string;
  handler: any;
}

export interface MatchResult {
  route: KevRoute;
  params: Record<string, string>;
}

export interface KevRequest {
  method: string;
  path: string;
  url: string;
  query: Record<string, string>;
  params: Record<string, string>;
  headers: Record<string, string>;
  body?: any;
  original?: any;
}

export class Backend {
  routes: KevRoute[] = [];
  started = false;
  server?: any;

  addRoute(method: string, path: string, handler: any): void {
    this.routes.push({
      method: method.toUpperCase(),
      path,
      handler
    });
  }

  match(method: string, pathname: string): MatchResult | null {
    const upperMethod = method.toUpperCase();

    for (const route of this.routes) {
      if (route.method !== upperMethod) continue;

      const params = matchPattern(route.path, pathname);
      if (params) {
        return { route, params };
      }
    }

    return null;
  }

  start(port: number, runtime: any): any {
    const g = globalThis as any;

    if (!g.Bun?.serve) {
      throw new KevError(
        "⚡ requires Bun.serve. Run KevLang with the Bun runtime.",
        { kind: "runtime" }
      );
    }

    if (this.started) {
      return this.server;
    }

    this.server = g.Bun.serve({
      port,
      hostname: "0.0.0.0",
      fetch: async (request: any) => {
        return this.handle(request, runtime);
      }
    });

    this.started = true;
    return this.server;
  }

  async handle(request: any, runtime: any): Promise<any> {
    try {
      const url = new URL(request.url);
      const matched = this.match(request.method, url.pathname);

      if (!matched) {
        return jsonResponse(
          {
            error: "Not Found",
            method: request.method,
            path: url.pathname
          },
          404
        );
      }

      const req = await createKevRequest(request, url, matched.params);
      const result = await runtime.evaluateRoute(matched.route.handler, req);

      return toWebResponse(result);
    } catch (err: any) {
      return jsonResponse(
        {
          error: "KevLang backend error",
          message: err?.message ?? String(err)
        },
        500
      );
    }
  }
}

function matchPattern(
  pattern: string,
  pathname: string
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];

    if (p === "*") {
      params["*"] = pathParts.slice(i).map(decodeURIComponent).join("/");
      return params;
    }

    if (i >= pathParts.length) {
      return null;
    }

    const actual = decodeURIComponent(pathParts[i]);

    if (p.startsWith(":")) {
      params[p.slice(1)] = actual;
      continue;
    }

    if (p !== actual) {
      return null;
    }
  }

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  return params;
}

async function createKevRequest(
  request: any,
  url: any,
  params: Record<string, string>
): Promise<KevRequest> {
  const query: Record<string, string> = {};

  try {
    url.searchParams.forEach((value: string, key: string) => {
      query[key] = value;
    });
  } catch {
    // ignore query parse issues
  }

  const headers: Record<string, string> = {};

  try {
    request.headers.forEach((value: string, key: string) => {
      headers[key] = value;
    });
  } catch {
    // ignore header parse issues
  }

  let body: any = undefined;
  const method = request.method.toUpperCase();

  if (method !== "GET" && method !== "HEAD") {
    const contentType = request.headers.get?.("content-type") ?? "";

    try {
      if (contentType.includes("application/json")) {
        body = await request.json();
      } else if (contentType.includes("text")) {
        body = await request.text();
      } else {
        body = await request.text();
      }
    } catch {
      body = undefined;
    }
  }

  return {
    method,
    path: url.pathname,
    url: request.url,
    query,
    params,
    headers,
    body,
    original: request
  };
}

export function jsonify(value: any, seen = new WeakSet<any>()): any {
  if (value === null || value === undefined) {
    return null;
  }

  const type = typeof value;

  if (type === "string" || type === "number" || type === "boolean") {
    return value;
  }

  if (value instanceof UnitValue) {
    return {
      value: value.value,
      unit: value.unit
    };
  }

  if (value instanceof KevHttpResponse) {
    return {
      status: value.status,
      headers: value.headers,
      body: jsonify(value.body, seen)
    };
  }

  if (type === "object") {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((v) => jsonify(v, seen));
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    const isPlain =
      !value.constructor ||
      value.constructor === Object;

    if (!isPlain && typeof value.toString === "function") {
      return String(value);
    }

    const out: Record<string, any> = {};

    for (const [k, v] of Object.entries(value)) {
      out[k] = jsonify(v, seen);
    }

    return out;
  }

  return String(value);
}

export function jsonResponse(body: any, status = 200): any {
  return new Response(JSON.stringify(jsonify(body)), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export function toWebResponse(value: any): any {
  if (value === undefined) {
    return new Response(null, { status: 204 });
  }

  if (typeof Response !== "undefined" && value instanceof Response) {
    return value;
  }

  if (value instanceof KevHttpResponse) {
    const headers: Record<string, string> = {
      ...value.headers
    };

    const hasContentType =
      headers["Content-Type"] !== undefined ||
      headers["content-type"] !== undefined;

    if (!hasContentType) {
      if (typeof value.body === "string") {
        headers["Content-Type"] = "text/plain; charset=utf-8";
      } else {
        headers["Content-Type"] = "application/json; charset=utf-8";
      }
    }

    const serialized =
      typeof value.body === "string"
        ? value.body
        : JSON.stringify(jsonify(value.body));

    if (value.status === 204) {
      return new Response(null, {
        status: 204,
        headers
      });
    }

    return new Response(serialized, {
      status: value.status,
      headers
    });
  }

  if (typeof value === "string") {
    return new Response(value, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return new Response(String(value), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }

  if (value instanceof UnitValue) {
    return jsonResponse({
      value: value.value,
      unit: value.unit
    });
  }

  return jsonResponse(value);
}
