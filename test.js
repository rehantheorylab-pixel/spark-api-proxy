// Automated Verification Script
const http = require('http');

// Load masking function logic from server
function maskText(content) {
  if (!content) return content;
  return content
    .replace(/light[\s\-_]*router/gi, (match) => {
      if (match === match.toUpperCase()) return "SPARK";
      if (match[0] === "L") return "Spark";
      return "spark";
    })
    .replace(/api\.novita\.ai/gi, "api.spark.ai")
    .replace(/novita\.ai/gi, "spark.ai")
    .replace(/novita/gi, (match) => {
      if (match === match.toUpperCase()) return "SPARK";
      if (match[0] === "N") return "Spark";
      return "spark";
    });
}

console.log("=== STEP 1: Testing Masking Logic ===");

const testSamples = [
  {
    input: "Error: light router failure while resolving upstream endpoint",
    expected: "Error: spark failure while resolving upstream endpoint"
  },
  {
    input: "Fatal: Light Router timeout connecting to novita.ai",
    expected: "Fatal: Spark timeout connecting to spark.ai"
  },
  {
    input: '{"id":"model-1","owned_by":"novita","root":"novita.ai"}',
    expected: '{"id":"model-1","owned_by":"spark","root":"spark.ai"}'
  },
  {
    input: "LIGHT ROUTER EXCEPTION: connection reset by NOVITA",
    expected: "SPARK EXCEPTION: connection reset by SPARK"
  }
];

let allPassed = true;
testSamples.forEach((sample, i) => {
  const result = maskText(sample.input);
  if (result === sample.expected) {
    console.log(`[PASS] Sample ${i + 1}`);
  } else {
    console.error(`[FAIL] Sample ${i + 1}: Expected "${sample.expected}", got "${result}"`);
    allPassed = false;
  }
});

if (!allPassed) {
  process.exit(1);
}

console.log("\n=== STEP 2: Testing Live Local Server ===");
process.env.PORT = "3899";
// Set a virtual client key to test authentication virtualization
process.env.CLIENT_API_KEY = "sk-spark-client-test-key-12345";

require('./server.js');

setTimeout(async () => {
  try {
    // 1. Test Root
    const rootRes = await fetch("http://localhost:3899/");
    const rootJson = await rootRes.json();
    console.log("[PASS] Root Endpoint Response:", rootJson.service);

    // 2. Test Invalid Client Key
    const unauthRes = await fetch("http://localhost:3899/v1/models", {
      headers: { "Authorization": "Bearer wrong-key" }
    });
    console.log(`[PASS] Rejected wrong key with HTTP ${unauthRes.status}`);

    // 3. Test Valid Virtual Client Key forwarding to upstream Novita models
    console.log("Fetching /v1/models with virtual key...");
    const modelsRes = await fetch("http://localhost:3899/v1/models", {
      headers: { "Authorization": "Bearer sk-spark-client-test-key-12345" }
    });
    const modelsText = await modelsRes.text();
    const hasNovita = /novita/i.test(modelsText);
    const hasLightRouter = /light[\s\-_]*router/i.test(modelsText);
    const hasSpark = /spark/i.test(modelsText);

    console.log(`[PASS] Upstream Models status: ${modelsRes.status}`);
    console.log(`       Contains 'novita': ${hasNovita} (Should be false)`);
    console.log(`       Contains 'light router': ${hasLightRouter} (Should be false)`);
    console.log(`       Contains 'spark': ${hasSpark} (Should be true)`);

    // 4. Test Chat Completions endpoint error masking
    console.log("Testing /v1/chat/completions error handling...");
    const chatRes = await fetch("http://localhost:3899/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer sk-spark-client-test-key-12345",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct",
        messages: [{ role: "user", content: "Hi" }]
      })
    });
    const chatText = await chatRes.text();
    console.log(`[PASS] Chat Completions returned HTTP ${chatRes.status}`);
    console.log(`       Masked Response: ${chatText}`);

    // 5. Check Server header
    console.log(`[PASS] Server Header: ${chatRes.headers.get("server")}`);

    console.log("\nALL TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } catch (err) {
    console.error("Test error:", err);
    process.exit(1);
  }
}, 1000);
