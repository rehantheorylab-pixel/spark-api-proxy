// Standalone Node.js Proxy Server for Local Testing & Self-Hosting
const http = require('http');
const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const UPSTREAM_ORIGIN = "https://api.novita.ai/openai/v1";
const DEFAULT_UPSTREAM_KEY = process.env.NOVITA_API_KEY || "sk_jl4V1qwUkaGNVo8aG9xYhNGHOY_gm4Qt4OknEfrIji0";
const CLIENT_API_KEY = process.env.CLIENT_API_KEY || null;

/**
 * Text replacement: detects any variation of "light router" / "literouter" and replaces with "spark".
 * Does NOT touch novita or any other words.
 */
function maskText(content) {
  if (!content) return content;
  return content.replace(/(light|lite)[\s\-_]*router/gi, (match) => {
    if (match === match.toUpperCase()) return "SPARK";
    if (match[0] === match[0].toUpperCase()) return "Spark";
    return "spark";
  });
}

function resolveUpstreamPath(pathname) {
  let clean = pathname;
  if (clean.startsWith("/openai/v1")) {
    clean = clean.slice("/openai/v1".length);
  } else if (clean.startsWith("/v1")) {
    clean = clean.slice("/v1".length);
  }

  if (!clean.startsWith("/")) {
    clean = "/" + clean;
  }

  if (clean === "/" || clean === "") {
    clean = "/chat/completions";
  }
  return clean;
}

const server = http.createServer((req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Root status check
  if (reqUrl.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Server': 'Spark-Gateway',
    });
    return res.end(JSON.stringify({
      service: "Spark AI Gateway",
      status: "healthy",
      version: "1.0.0",
      endpoints: ["/v1/chat/completions", "/v1/models", "/chat/completions"],
      documentation: "OpenAI-compatible Base URL endpoint. Use Authorization: Bearer <API_KEY>"
    }, null, 2));
  }

  // API Key Validation
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (CLIENT_API_KEY && token !== CLIENT_API_KEY && token !== DEFAULT_UPSTREAM_KEY) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Server': 'Spark-Gateway',
    });
    return res.end(JSON.stringify({
      error: {
        message: "Incorrect API key provided.",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key",
      }
    }));
  }

  // Upstream Routing
  const cleanPath = resolveUpstreamPath(reqUrl.pathname);
  const targetUrl = new URL(`${UPSTREAM_ORIGIN}${cleanPath}${reqUrl.search}`);

  const forwardHeaders = { ...req.headers };
  delete forwardHeaders['host'];
  delete forwardHeaders['referer'];
  delete forwardHeaders['origin'];
  // Request uncompressed text from upstream to guarantee text masking
  forwardHeaders['accept-encoding'] = 'identity';
  // Inject real upstream Novita key
  forwardHeaders['authorization'] = `Bearer ${DEFAULT_UPSTREAM_KEY}`;

  const upstreamReq = https.request(targetUrl, {
    method: req.method,
    headers: forwardHeaders,
  }, (upstreamRes) => {
    const responseHeaders = { ...upstreamRes.headers };
    // Strip sensitive identifiers
    delete responseHeaders['cf-ray'];
    delete responseHeaders['x-request-id'];
    delete responseHeaders['transfer-encoding'];
    delete responseHeaders['content-encoding'];
    delete responseHeaders['content-length'];
    Object.keys(responseHeaders).forEach(k => {
      if (k.startsWith('x-envoy-')) delete responseHeaders[k];
    });

    responseHeaders['server'] = 'Spark-Gateway';
    responseHeaders['access-control-allow-origin'] = '*';

    // Handle compression stream if upstream ignored identity
    const encoding = upstreamRes.headers['content-encoding'];
    let decompressStream = upstreamRes;
    if (encoding === 'gzip') {
      decompressStream = upstreamRes.pipe(zlib.createGunzip());
    } else if (encoding === 'deflate') {
      decompressStream = upstreamRes.pipe(zlib.createInflate());
    } else if (encoding === 'br') {
      decompressStream = upstreamRes.pipe(zlib.createBrotliDecompress());
    }

    const contentType = upstreamRes.headers['content-type'] || '';

    // If streaming SSE
    if (contentType.includes('text/event-stream')) {
      res.writeHead(upstreamRes.statusCode, responseHeaders);
      decompressStream.on('data', (chunk) => {
        const masked = maskText(chunk.toString('utf8'));
        res.write(masked);
      });
      decompressStream.on('end', () => res.end());
      return;
    }

    // Buffer JSON / standard responses
    let bodyChunks = [];
    decompressStream.on('data', (chunk) => {
      bodyChunks.push(chunk);
    });

    decompressStream.on('end', () => {
      const rawBody = Buffer.concat(bodyChunks).toString('utf8');
      const maskedBody = maskText(rawBody);

      responseHeaders['content-type'] = contentType || 'application/json; charset=utf-8';
      responseHeaders['content-length'] = Buffer.byteLength(maskedBody);

      res.writeHead(upstreamRes.statusCode, responseHeaders);
      res.end(maskedBody);
    });

    decompressStream.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json', 'Server': 'Spark-Gateway' });
      res.end(JSON.stringify({ error: { message: `Decompression error: ${err.message}` } }));
    });
  });

  upstreamReq.on('error', (err) => {
    res.writeHead(502, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Server': 'Spark-Gateway',
    });
    res.end(JSON.stringify({
      error: {
        message: maskText(`Spark Gateway proxy error: ${err.message}`),
        type: "spark_gateway_error",
        code: 502,
      }
    }));
  });

  req.pipe(upstreamReq);
});

server.listen(PORT, () => {
  console.log(`Spark Gateway running at http://localhost:${PORT}`);
});
