# Spark AI Gateway & Reverse Proxy

A high-performance reverse proxy for OpenAI-compatible LLM endpoints (Novita AI).

---

## ✨ Features

1. **Light Router / LiteRouter Masking**:
   - Replaces any instance of `light router`, `literouter`, `lightrouter`, `lite router` (case-insensitive) with `spark` / `Spark`.
   - **Preserves** `novita` as requested.
   - Cleans internal gateway/router headers.
2. **Virtual API Key Support**:
   - Issue custom keys (`sk_spark_...`) to your clients so they never see or steal your actual Novita key.
3. **OpenAI SDK & UI Client Compatible**:
   - Streaming SSE support (`stream: true`).
   - CORS enabled for web clients.
   - Works with official OpenAI Python/Node SDKs, NextChat, LibreChat, OpenWebUI.

---

## 🌐 How to Use GitHub as Your Base URL (GitHub Codespaces)

GitHub Pages only hosts static files and rejects `POST /chat/completions` requests. However, **GitHub Codespaces** provides a real, cloud-hosted backend server with a public `*.app.github.dev` Base URL on GitHub:

1. Open this repository on GitHub:
   [https://github.com/rehantheorylab-pixel/spark-api-proxy](https://github.com/rehantheorylab-pixel/spark-api-proxy)
2. Click the green **Code** button → select the **Codespaces** tab.
3. Click **Create codespace on main**.
4. GitHub will boot up the pre-configured `.devcontainer` and start the server automatically on port `3000`.
5. Under the **Ports** tab in Codespaces:
   - Right-click port `3000` → Set **Port Visibility** to **Public**.
   - Copy the forwarded address (e.g. `https://xxxx-3000.app.github.dev`).
6. Your public GitHub Base URL will be:
   ```
   https://<your-codespace>-3000.app.github.dev/v1
   ```

---

## ⚡ Alternative Free Serverless Deployments

* **Netlify**: Connect your GitHub repo on [Netlify](https://app.netlify.com/) for zero-maintenance edge hosting (`https://<site>.netlify.app/v1`).
* **Cloudflare Workers**: Deploy `cloudflare-worker.js` on [Cloudflare Workers](https://dash.cloudflare.com/) (`https://<worker>.workers.dev/v1` or your custom domain).
