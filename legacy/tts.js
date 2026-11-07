import fs from "node:fs/promises";
import { getGeminiApiKeys, isGeminiQuotaOrRateLimit, setActiveGeminiApiKey } from "./gemini-keys.js";

export async function generateGeminiTts({ text, outputPath }) {
  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("Missing GEMINI_API_KEY or GEMINI_API_KEYS in .env");
  }
  const model = process.env.GEMINI_TTS_MODEL;
  const voiceName = process.env.GEMINI_TTS_VOICE;
  if (!model || !voiceName) {
    throw new Error("Missing GEMINI_TTS_MODEL or GEMINI_TTS_VOICE in .env");
  }

  const style = process.env.GEMINI_TTS_STYLE_PROMPT || "Speak clearly in a natural YouTube tutorial style.";
  const input = `${style}\n\nTranscript:\n${text}`;
  let lastQuotaError = "";
  if (apiKeys.length > 1) {
    console.log(`    Gemini TTS has ${apiKeys.length} API keys available.`);
  }

  for (let index = 0; index < apiKeys.length; index += 1) {
    const apiKey = apiKeys[index];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: input }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName
              }
            }
          }
        }
      })
    });

    if (response.ok) {
      setActiveGeminiApiKey(apiKey);
      const data = await response.json();
      const part = data.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data);
      if (!part?.inlineData?.data) {
        throw new Error(`Gemini TTS response did not include audio data: ${JSON.stringify(data).slice(0, 1000)}`);
      }

      if (index > 0) {
        console.log(`    Gemini TTS key ${index + 1}/${apiKeys.length} worked after earlier quota limit.`);
      }

      const audio = Buffer.from(part.inlineData.data, "base64");
      const mimeType = part.inlineData.mimeType || "";
      const outputFormat = (process.env.GEMINI_TTS_OUTPUT_FORMAT || "wav").toLowerCase();

      if (outputFormat === "wav" && (mimeType.includes("pcm") || mimeType.includes("L16") || mimeType.includes("raw"))) {
        await fs.writeFile(outputPath, pcmToWav(audio, 24000, 1));
      } else {
        await fs.writeFile(outputPath, audio);
      }

      return { outputPath, mimeType };
    }

    const body = await response.text();
    if (!isGeminiQuotaOrRateLimit(response.status, body)) {
      throw new Error(`Gemini TTS failed (${response.status}): ${body.slice(0, 1000)}`);
    }

    lastQuotaError = body;
    const nextKeyExists = index < apiKeys.length - 1;
    console.log(`    Gemini TTS key ${index + 1}/${apiKeys.length} hit quota. ${nextKeyExists ? "Trying next key..." : "No more keys."}`);
  }

  throw new Error(`All Gemini API keys exceeded the TTS quota. Last Gemini response: ${lastQuotaError.slice(0, 1000)}`);
}

function pcmToWav(pcm, sampleRate, channels) {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
