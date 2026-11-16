// Netlify Edge Function: Spark AI Gateway & Masking Reverse Proxy

const UPSTREAM_ORIGIN = "https://api.novita.ai/openai/v1";

// Default Novita key if not specified in Netlify Environment Variables
const DEFAULT_UPSTREAM_KEY = "sk_jl4V1qwUkaGNVo8aG9xYhNGHOY_gm4Qt4OknEfrIji0";

/**
 * Text replacement to completely mask upstream branding, novita domain, and "light router" errors.
 */
function maskText(content: string): string {
  if (!content) return content;

  return content
    // Replace light router variations
    .replace(/light[\s\-_]*router/gi, (match) => {
      if (match === match.toUpperCase()) return "SPARK";
      if (match[0] === "L") return "Spark";
      return "spark";
    })
    // Replace domain
    .replace(/api\.novita\.ai/gi, "api.spark.ai")
    .replace(/novita\.ai/gi, "spark.ai")
    // Replace standalone novita
    .replace(/novita/gi, (match) => {
      if (match === match.toUpperCase()) return "SPARK";
      if (match[0] === "N") return "Spark";
      return "spark";
    });
}

/**
 * Normalizes incoming path to upstream OpenAI v1 endpoints.
 * Supports:
 *   /chat/completions -> /chat/completions
 *   /v1/chat/completions -> /chat/completions
 *   /openai/v1/chat/completions -> /chat/completions
 *   /models -> /models
 *   /v1/models -> /models
 */
function resolveUpstreamUrl(url: URL): string {
  let pathname = url.pathname;

  if (pathname.startsWith("/openai/v1")) {
    pathname = pathname.slice("/openai/v1".length);
  } else if (pathname.startsWith("/v1")) {
    pathname = pathname.slice("/v1".length);
  }

  if (!pathname.startsWith("/")) {
    pathname = "/" + pathname;
  }

  // Default root to /chat/completions if path is empty
  if (pathname === "/" || pathname === "") {
    pathname = "/chat/completions";
  }

  return `${UPSTREAM_ORIGIN}${pathname}${url.search}`;
}

export default async (request: Request, _context: any) => {
  const url = new URL(request.url);

  // 1. CORS Preflight Support (Allow browser-based AI frontends)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, X-Requested-With",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // 2. Friendly root info page (when visiting the base URL in a web browser)
  if (url.pathname === "/" && request.method === "GET") {
    return new Response(
      JSON.stringify(
        {
          service: "Spark AI Gateway",
          status: "healthy",
          version: "1.0.0",
          endpoints: [
            "/v1/chat/completions",
            "/v1/models",
            "/chat/completions"
          ],
          documentation: "OpenAI-compatible Base URL endpoint. Use Authorization: Bearer <API_KEY>"
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Server": "Spark-Gateway",
        },
      }
    );
  }

  // 3. Resolve Target API Keys
  // Read from environment if set, otherwise use the configured default key
  const upstreamApiKey = (typeof Deno !== "undefined" ? Deno.env.get("NOVITA_API_KEY") : null) || DEFAULT_UPSTREAM_KEY;
  const clientAuthSecret = (typeof Deno !== "undefined" ? Deno.env.get("CLIENT_API_KEY") : null) || null;

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  // If a specific CLIENT_API_KEY is defined in environment variables, validate it
  if (clientAuthSecret && token !== clientAuthSecret && token !== upstreamApiKey) {
    return new Response(
      JSON.stringify({
        error: {
          message: "Incorrect API key provided.",
          type: "invalid_request_error",
          param: null,
          code: "invalid_api_key",
        },
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Server": "Spark-Gateway",
        },
      }
    );
  }

  // 4. Construct Upstream Request
  const upstreamUrl = resolveUpstreamUrl(url);

  const forwardHeaders = new Headers();
  for (const [key, val] of request.headers.entries()) {
    const lower = key.toLowerCase();
    // Strip host, referer, origin headers to prevent upstream detection
    if (lower === "host" || lower === "referer" || lower === "origin") continue;
    forwardHeaders.set(key, val);
  }

  // Inject the real Novita API key into the authorization header
  forwardHeaders.set("Authorization", `Bearer ${upstreamApiKey}`);
  forwardHeaders.set("Accept-Encoding", "identity");

  const init: RequestInit = {
    method: request.method,
    headers: forwardHeaders,
    redirect: "follow",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, init);

    // Prepare response headers, stripping sensitive upstream identifiers
    const responseHeaders = new Headers();
    upstreamResponse.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (
        lower === "cf-ray" ||
        lower === "server" ||
        lower === "x-request-id" ||
        lower === "content-encoding" ||
        lower === "content-length" ||
        lower === "transfer-encoding" ||
        lower.startsWith("x-envoy-")
      ) {
        return;
      }
      responseHeaders.set(key, val);
    });

    // Custom gateway branding & CORS
    responseHeaders.set("Server", "Spark-Gateway");
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    const contentType = upstreamResponse.headers.get("content-type") || "";

    // 5. Handle Streaming Responses (SSE / text/event-stream)
    if (contentType.includes("text/event-stream") && upstreamResponse.body) {
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      const transformStream = new TransformStream({
        transform(chunk, controller) {
          const text = decoder.decode(chunk, { stream: true });
          const masked = maskText(text);
          controller.enqueue(encoder.encode(masked));
        },
      });

      return new Response(upstreamResponse.body.pipeThrough(transformStream), {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    }

    // 6. Handle Standard Text / JSON Responses (including error payloads)
    const rawBody = await upstreamResponse.text();
    const maskedBody = maskText(rawBody);

    return new Response(maskedBody, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    const errorMsg = `Spark Gateway proxy error: ${err?.message || "Unknown error"}`;
    return new Response(
      JSON.stringify({
        error: {
          message: maskText(errorMsg),
          type: "spark_gateway_error",
          code: 502,
        },
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Server": "Spark-Gateway",
        },
      }
    );
  }
};
