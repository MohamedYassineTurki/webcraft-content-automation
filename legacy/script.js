import OpenAI from "openai";
import { getGeminiApiKeys, isGeminiQuotaOrRateLimit, setActiveGeminiApiKey } from "./gemini-keys.js";

export async function generateScript({ title, websiteUrl, websiteSummary, reviewSummary, targetLengthSeconds }) {
  const provider = (process.env.SCRIPT_PROVIDER || "gemini").toLowerCase();
  if (provider === "gemini") {
    return generateGeminiScript({ title, websiteUrl, websiteSummary, reviewSummary, targetLengthSeconds });
  }
  if (provider === "openai") {
    return generateOpenAiScript({ title, websiteUrl, websiteSummary, reviewSummary, targetLengthSeconds });
  }
  throw new Error(`Unknown SCRIPT_PROVIDER "${provider}". Use "gemini" or "openai".`);
}

async function generateOpenAiScript({ title, websiteUrl, websiteSummary, reviewSummary, targetLengthSeconds }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in .env");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_SCRIPT_MODEL || "gpt-4.1";
  const prompt = buildPrompt({ title, websiteUrl, websiteSummary, reviewSummary, targetLengthSeconds });

  const response = await client.responses.create({
    model,
    input: prompt,
    temperature: 0.7
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error("OpenAI returned an empty script response");
  }

  return {
    raw: text,
    summary: extractSection(text, "Quick research summary"),
    script: extractSection(text, "Full YouTube script in a paragraph to copy paste") || extractSection(text, "Full YouTube script") || text,
    improvedTitle: extractSection(text, "Optional title improvement suggestion")
  };
}

async function generateGeminiScript({ title, websiteUrl, websiteSummary, reviewSummary, targetLengthSeconds }) {
  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("Missing GEMINI_API_KEY or GEMINI_API_KEYS in .env");
  }

  const model = process.env.GEMINI_SCRIPT_MODEL || "gemini-3.5-flash";
  const prompt = buildPrompt({ title, websiteUrl, websiteSummary, reviewSummary, targetLengthSeconds });
  let lastQuotaError = "";
  if (apiKeys.length > 1) {
    console.log(`    Gemini script generation has ${apiKeys.length} API keys available.`);
  }

  for (let index = 0; index < apiKeys.length; index += 1) {
    const apiKey = apiKeys[index];
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        model,
        input: prompt,
        system_instruction:
          "You are a careful YouTube script writer. Use only the supplied research context, be honest about limited reviews, and write clear natural voiceover copy.",
        generation_config: {
          temperature: 0.7,
          thinking_level: "low"
        }
      })
    });

    if (response.ok) {
      setActiveGeminiApiKey(apiKey);
      const data = await response.json();
      const text = extractGeminiText(data);
      if (!text) {
        throw new Error(`Gemini returned an empty script response: ${JSON.stringify(data).slice(0, 1000)}`);
      }

      if (index > 0) {
        console.log(`    Gemini script key ${index + 1}/${apiKeys.length} worked after earlier quota limit.`);
      }

      return {
        raw: text,
        summary: extractSection(text, "Quick research summary"),
        script: extractSection(text, "Full YouTube script in a paragraph to copy paste") || extractSection(text, "Full YouTube script") || text,
        improvedTitle: extractSection(text, "Optional title improvement suggestion")
      };
    }

    const body = await response.text();
    if (!isGeminiQuotaOrRateLimit(response.status, body)) {
      throw new Error(`Gemini script generation failed (${response.status}): ${body.slice(0, 1000)}`);
    }

    lastQuotaError = body;
    const nextKeyExists = index < apiKeys.length - 1;
    console.log(`    Gemini script key ${index + 1}/${apiKeys.length} hit quota. ${nextKeyExists ? "Trying next key..." : "No more keys."}`);
  }

  throw new Error(`All Gemini API keys exceeded the script-generation quota. Last Gemini response: ${lastQuotaError.slice(0, 1000)}`);
}

function buildPrompt({ title, websiteUrl, websiteSummary, reviewSummary, targetLengthSeconds }) {
  return `I want you to help me create a YouTube video script about an AI website.

Title of the video: ${title}
Website: ${websiteUrl}

Research context:
${websiteSummary}

User review context:
${reviewSummary}

Instructions:
1. Use the provided website and review research.
2. Write a YouTube script around ${targetLengthSeconds || 150} seconds long.
3. Keep it natural, engaging, easy to speak, and useful for a general audience.
4. Include a strong hook in the first 10 seconds, a quick explanation, best features, pros and cons from reviews, final opinion, and CTA.
5. Be honest if reviews are limited or mixed.
6. Do not make it too technical.
7. Do not invent facts, review counts, prices, or claims that are not in the research context.

Output format:
- Quick research summary
- Full YouTube script in a paragraph to copy paste
- Optional title improvement suggestion`;
}

function extractSection(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextHeading = "\\n\\s*-\\s*(Quick research summary|Full YouTube script(?: in a paragraph to copy paste)?|Optional title improvement suggestion)\\s*:?";
  const regex = new RegExp(`(?:^|\\n)\\s*-?\\s*${escaped}\\s*:?\\s*\\n?([\\s\\S]*?)(?=${nextHeading}|$)`, "i");
  return text.match(regex)?.[1]?.trim() || "";
}

function extractGeminiText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text.trim();
  }

  const fromSteps = data.steps
    ?.flatMap((step) => step.content || step.contents || step.parts || [])
    ?.filter(Boolean)
    ?.map((part) => part.text || part.content?.text)
    ?.filter(Boolean)
    ?.join("\n")
    ?.trim();
  if (fromSteps) return fromSteps;

  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    ?.filter(Boolean)
    ?.join("\n")
    ?.trim();
}
