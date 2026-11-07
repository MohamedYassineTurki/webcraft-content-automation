export function getGeminiApiKeys() {
  const keys = [];
  addKey(keys, process.env.GEMINI_API_KEY);

  if (process.env.GEMINI_API_KEYS) {
    for (const key of process.env.GEMINI_API_KEYS.split(/[,;\s]+/)) {
      addKey(keys, key);
    }
  }

  const numberedKeys = Object.entries(process.env)
    .filter(([name]) => /^GEMINI_API_KEY_?\d+$/.test(name))
    .sort(([a], [b]) => Number(a.match(/\d+$/)?.[0] || 0) - Number(b.match(/\d+$/)?.[0] || 0));

  for (const [, value] of numberedKeys) {
    addKey(keys, value);
  }

  return keys;
}

export function isGeminiQuotaOrRateLimit(status, body) {
  if (status !== 429) {
    return false;
  }

  const text = String(body || "");
  return (
    /quota/i.test(text) ||
    /rate.?limit/i.test(text) ||
    /too_many_requests/i.test(text) ||
    /resource_exhausted/i.test(text) ||
    /retry/i.test(text)
  );
}

export function setActiveGeminiApiKey(apiKey) {
  process.env.GEMINI_API_KEY = apiKey;
}

function addKey(keys, value) {
  const key = String(value || "").trim();
  if (key && !keys.includes(key)) {
    keys.push(key);
  }
}
