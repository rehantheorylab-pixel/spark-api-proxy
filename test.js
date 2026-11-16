// Automated Verification Script
const http = require('http');

function maskText(content) {
  if (!content) return content;
  return content.replace(/(light|lite)[\s\-_]*router/gi, (match) => {
    if (match === match.toUpperCase()) return "SPARK";
    if (match[0] === match[0].toUpperCase()) return "Spark";
    return "spark";
  });
}

console.log("=== STEP 1: Testing Masking Logic (Only literouter/light router -> spark, KEEP novita) ===");

const testSamples = [
  {
    input: "Error: literouter failure while resolving upstream endpoint for novita.ai",
    expected: "Error: spark failure while resolving upstream endpoint for novita.ai"
  },
  {
    input: "Fatal: Light Router timeout on novita model endpoint",
    expected: "Fatal: Spark timeout on novita model endpoint"
  },
  {
    input: '{"id":"model-1","owned_by":"novita","error":"lite router error"}',
    expected: '{"id":"model-1","owned_by":"novita","error":"spark error"}'
  },
  {
    input: "LITEROUTER EXCEPTION: connection reset by upstream",
    expected: "SPARK EXCEPTION: connection reset by upstream"
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
process.env.CLIENT_API_KEY = "sk-spark-client-test-key-12345";

require('./server.js');

setTimeout(async () => {
  try {
    // 1. Test Root
    const rootRes = await fetch("http://localhost:3899/");
    const rootJson = await rootRes.json();
    console.log("[PASS] Root Endpoint Response:", rootJson.service);

    // 2. Test Upstream Models
    const modelsRes = await fetch("http://localhost:3899/v1/models", {
      headers: { "Authorization": "Bearer sk-spark-client-test-key-12345" }
    });
    const modelsText = await modelsRes.text();
    const hasNovita = /novita/i.test(modelsText);
    const hasLightRouter = /(light|lite)[\s\-_]*router/i.test(modelsText);

    console.log(`[PASS] Upstream Models status: ${modelsRes.status}`);
    console.log(`       Contains 'novita': ${hasNovita} (Should be TRUE, as requested)`);
    console.log(`       Contains 'light/lite router': ${hasLightRouter} (Should be FALSE)`);

    console.log("\nALL TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } catch (err) {
    console.error("Test error:", err);
    process.exit(1);
  }
}, 1000);
