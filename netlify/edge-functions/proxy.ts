// Netlify Edge Function: Spark AI Gateway & Masking Reverse Proxy

const UPSTREAM_ORIGIN = "https://api.novita.ai/openai/v1";
const DEFAULT_UPSTREAM_KEY = "sk_jl4V1qwUkaGNVo8aG9xYhNGHOY_gm4Qt4OknEfrIji0";

/**
 * Text replacement: detects any variation of "light router" / "literouter" and replaces with "spark".
 * Does NOT replace novita.
 */
function maskText(content: string): string {
  if (!content) return content;
  return content.replace(/(light|lite)[\s\-_]*router/gi, (match) => {
    if (match === match.toUpperCase()) return "SPARK";
    if (match[0] === match[0].toUpperCase()) return "Spark";
    return "spark";
  });
}

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

  if (pathname === "/" || pathname === "") {
    pathname = "/chat/completions";
  }

  return `${UPSTREAM_ORIGIN}${pathname}${url.search}`;
}

export default async (request: Request, _context: any) => {
  const url = new URL(request.url);

  // 1. CORS Preflight Support
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

  // 2. Friendly root info page
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
  const upstreamApiKey = (typeof Deno !== "undefined" ? Deno.env.get("NOVITA_API_KEY") : null) || DEFAULT_UPSTREAM_KEY;
  const clientAuthSecret = (typeof Deno !== "undefined" ? Deno.env.get("CLIENT_API_KEY") : null) || null;

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

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
    if (lower === "host" || lower === "referer" || lower === "origin") continue;
    forwardHeaders.set(key, val);
  }

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

    // 6. Handle Standard Text / JSON Responses
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
