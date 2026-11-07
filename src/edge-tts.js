import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export async function generateEdgeTts({ text, outputPath }) {
  const voice = process.env.EDGE_TTS_VOICE || "en-US-GuyNeural";
  const rate = process.env.EDGE_TTS_RATE || "+10%";
  const volume = process.env.EDGE_TTS_VOLUME || "+0%";
  const pitch = process.env.EDGE_TTS_PITCH || "+0Hz";
  const timeoutMs = positiveNumber(process.env.EDGE_TTS_TIMEOUT_MS, 300000);
  const pythonPath = getPythonPath();
  const pythonPackages = path.resolve(
    projectRoot, process.env.EDGE_TTS_PYTHON_PACKAGES || ".tts-runtime/packages"
  );
  const inputPath = path.join(
    path.dirname(outputPath),
    `.edge-tts-input-${process.pid}-${Date.now()}.txt`
  );

  console.log(`    Edge TTS voice: ${voice}, rate: ${rate}, volume: ${volume}, pitch: ${pitch}`);

  try {
    await verifyEdgeTtsInstall(pythonPath, pythonPackages);
    await fs.writeFile(inputPath, text, "utf8");

    const args = [
      path.join(projectRoot, "src", "run-edge-tts.py"),
      pythonPackages,
      "--voice", voice,
      `--rate=${rate}`,
      `--volume=${volume}`,
      `--pitch=${pitch}`,
      "--file", inputPath,
      "--write-media", outputPath
    ];

    await runPython(pythonPath, args, pythonPackages, timeoutMs);

    const audio = await fs.stat(outputPath);
    if (!audio.isFile() || audio.size < 1000) {
      throw new Error(`Edge TTS returned an invalid audio file (${audio.size} bytes).`);
    }

    console.log(`    Edge TTS received ${audio.size} audio bytes.`);
  } catch (error) {
    await fs.unlink(outputPath).catch(() => {});
    throw new Error(formatEdgeTtsError(error), { cause: error });
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }
}

function runPython(pythonPath, args, pythonPackages, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, args, {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONPATH: [pythonPackages, process.env.PYTHONPATH]
          .filter(Boolean)
          .join(path.delimiter)
      }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Edge TTS did not finish within ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = appendLimited(stdout, chunk);
      const message = chunk.toString().trim();
      if (message) console.log(indent(message));
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendLimited(stderr, chunk);
    });

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      const details = stderr.trim() || stdout.trim() || "No error details were returned.";
      reject(new Error(
        `Edge TTS process exited with code ${code ?? "unknown"}`
        + `${signal ? ` (signal ${signal})` : ""}.\n${details}`
      ));
    });
  });
}

async function verifyEdgeTtsInstall(pythonPath, pythonPackages) {
  try {
    await fs.access(pythonPath);
  } catch {
    throw new Error(
      `Python was not found at ${pythonPath}. Follow docs/setup.md to create .venv, or set EDGE_TTS_PYTHON in .env.`
    );
  }

  try {
    for (const filename of ["__init__.py", "__main__.py", "communicate.py"]) {
      await fs.readFile(path.join(pythonPackages, "edge_tts", filename));
    }
  } catch {
    throw new Error(
      `The Edge TTS installation is incomplete or unreadable in ${pythonPackages}. Run .venv's Python with scripts/setup-tts.py.`
    );
  }
}

function getPythonPath() {
  if (process.env.EDGE_TTS_PYTHON) {
    return path.resolve(process.env.EDGE_TTS_PYTHON);
  }

  return path.join(projectRoot, ".venv", process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "python.exe" : "python");
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function appendLimited(current, chunk) {
  const next = current + chunk.toString();
  return next.length > 20000 ? next.slice(-20000) : next;
}

function indent(value) {
  return value.split(/\r?\n/).map((line) => `    ${line}`).join("\n");
}

function formatEdgeTtsError(error) {
  const message = error?.message || String(error);

  if (/ClientConnectorError|ClientConnectionError/i.test(message) && /Access is denied|Permission denied|socket code (13|10013)\b/i.test(message)) {
    return [
      "Windows blocked Python's connection to speech.platform.bing.com:443 after three audio attempts.",
      "Check that your VPN is fully connected and stable. VPN kill-switch rules or security software can deny this connection.",
      "If it persists, check whether your security software allows the Python executable shown below.",
      `Python: ${getPythonPath()}`,
      `Technical error: ${message}`
    ].join("\n");
  }

  if (/ClientConnectorError|ClientConnectionError|ClientConnectorDNSError|ServerDisconnectedError|ServerTimeoutError|ConnectionTimeoutError/i.test(message)) {
    return [
      "Edge TTS could not maintain its network connection after three audio attempts.",
      "Check your internet connection and VPN connection, then retry the failed row.",
      `Technical error: ${message}`
    ].join("\n");
  }

  if (/403|Forbidden|Unexpected server response/i.test(message)) {
    return [
      "Edge TTS was rejected by Microsoft's speech service.",
      "Microsoft still refused the connection after server-time correction and bounded connection recovery. Check the endpoint and clock messages above.",
      `Technical error: ${message}`
    ].join("\n");
  }

  if (/did not finish|timeout/i.test(message)) {
    return [
      "Edge TTS timed out.",
      "The process was stopped and any incomplete MP3 was deleted.",
      `Technical error: ${message}`
    ].join("\n");
  }

  return `Edge TTS failed: ${message}`;
}
