# Spark AI Gateway & Reverse Proxy (White-Label Mask)

A high-performance, zero-leak reverse proxy for OpenAI-compatible LLM endpoints (specifically configured for **Novita AI**).

---

## ✨ Features

1. **Complete Origin Masking (White-labeling)**:
   - Replaces all instances of `light router` (case-insensitive) with `spark`.
   - Replaces `novita.ai` and `novita` with `spark.ai` and `spark` across all response bodies, error messages, and model metadata.
   - Strips upstream headers (`cf-ray`, `x-request-id`, `x-envoy-*`, `server`) and identifies as `Server: Spark-Gateway`.
2. **Virtual API Key Support (Essential for Reselling)**:
   - Instead of giving your client your actual upstream API key (which would let them discover the provider or drain it directly), you give them a **Virtual Client Key** (e.g., `sk-spark-client-xxx`).
   - The gateway validates their key and injects your real Novita API key on the fly.
3. **OpenAI SDK & UI Client Compatible**:
   - Works with official OpenAI Python/Node SDKs, LangChain, LlamaIndex, OpenWebUI, LibreChat, NextChat, Chatbox, Cursor, and more.
   - Automatically handles streaming (`stream: true` / Server-Sent Events `text/event-stream`).
   - Supports full CORS preflight (`OPTIONS`) for direct browser-based web apps.
   - Flexible routing: supports `https://your-domain/v1`, `https://your-domain/chat/completions`, and `/v1/models`.

---

## 🚀 Quick Deployment Options

### Option 1: Deploy on Netlify via GitHub (Recommended)

1. Create a new repository on [GitHub](https://github.com/new) (e.g. `spark-api-proxy`).
2. Push this folder to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Spark AI proxy"
   git branch -M main
   git remote add origin https://github.com/<your-username>/spark-api-proxy.git
   git push -u origin main
   ```
3. Go to [Netlify](https://app.netlify.com/) -> **Add new site** -> **Import an existing project**.
4. Select your GitHub repository. Netlify will automatically detect `netlify.toml` and configure the Edge Function.
5. In Netlify **Site configuration -> Environment variables**, add:
   - `NOVITA_API_KEY`: Your real key `sk_jl4V1qwUkaGNVo8aG9xYhNGHOY_gm4Qt4OknEfrIji0`
   - `CLIENT_API_KEY`: A custom virtual key you create for your buyer (e.g. `sk_spark_buyer_2026`)
6. Click **Deploy**. Your custom base URL will be:
   ```
   https://<your-site-name>.netlify.app/v1
   ```
   *(You can also connect your own custom domain in Netlify under "Domain management" in 1 click!)*

---

### Option 2: Deploy on Cloudflare Workers (Instant 1-Minute Setup)

1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/) -> **Workers & Pages** -> **Create application** -> **Create Worker**.
2. Click **Deploy**, then click **Edit code**.
3. Copy the entire contents of [`cloudflare-worker.js`](./cloudflare-worker.js) and paste it into the Cloudflare code editor.
4. Click **Deploy**.
5. (Optional) Go to **Settings -> Variables** to set `NOVITA_API_KEY` and `CLIENT_API_KEY`.
6. (Optional) In **Settings -> Triggers**, add your custom domain (e.g., `api.yourdomain.com`).

---

### Option 3: Run Locally or on VPS (Node.js)

```bash
# Start server
node server.js

# Or with custom port & keys
PORT=8080 CLIENT_API_KEY=sk_spark_test node server.js
```

Run test suite:
```bash
node test.js
```

---

## 🛠️ How Your Client Configures Their Apps

### Python (OpenAI SDK):
```python
from openai import OpenAI

client = OpenAI(
    base_url="https://<your-site>.netlify.app/v1",
    api_key="sk_spark_buyer_2026"  # The key you sold them
)

response = client.chat.completions.create(
    model="meta-llama/llama-3.1-8b-instruct",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Node.js (OpenAI SDK):
```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://<your-site>.netlify.app/v1",
  apiKey: "sk_spark_buyer_2026",
});

const completion = await client.chat.completions.create({
  model: "meta-llama/llama-3.1-8b-instruct",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(completion.choices[0].message.content);
```

### Chat UIs (OpenWebUI, LibreChat, NextChat, etc.):
- **API Base URL**: `https://<your-site>.netlify.app/v1`
- **API Key**: `sk_spark_buyer_2026`
- **Models**: Any model supported by Novita (e.g. `meta-llama/llama-3.1-8b-instruct`, `deepseek/deepseek-r1`, etc.)
