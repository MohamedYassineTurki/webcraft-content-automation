"""Run Edge TTS with headers matching the locally installed Microsoft Edge."""

import os
import asyncio
from email.utils import parsedate_to_datetime
from pathlib import Path
import re
import runpy
import sys
import time


VERSION_PATTERN = re.compile(r"\d+\.\d+\.\d+\.\d+\Z")


def retry_kind(error):
    import aiohttp

    if isinstance(error, (aiohttp.ClientConnectorCertificateError, aiohttp.ClientConnectorSSLError)):
        return None
    if getattr(error, "status", None) == 403:
        return "Microsoft rejected the speech connection (403)", 5
    if isinstance(error, (aiohttp.ClientConnectionError, TimeoutError)):
        socket_error = getattr(error, "os_error", None)
        if getattr(socket_error, "winerror", None) == 10013 or getattr(socket_error, "errno", None) in (13, 10013):
            return "Windows denied the speech connection; waiting for VPN/security filtering to settle", 20
        return "Speech connection failed; waiting for the network to recover", 20
    return None


def run_with_retries(operation, on_retry=None):
    for attempt in range(1, 4):
        try:
            operation()
            return
        except Exception as error:
            recovery = retry_kind(error)
            if recovery is None or attempt == 3:
                raise
            if on_retry is not None:
                on_retry(error, attempt)
            reason, delay = recovery
            print(f"{reason}. Retrying audio attempt {attempt + 1}/3 in {delay} seconds...", flush=True)
            time.sleep(delay)


async def synchronize_service_clock():
    import aiohttp
    from edge_tts.constants import VOICE_LIST, VOICE_HEADERS
    from edge_tts.drm import DRM

    async with aiohttp.ClientSession(
        trust_env=True, timeout=aiohttp.ClientTimeout(total=15)
    ) as session:
        async with session.get(VOICE_LIST, headers=VOICE_HEADERS) as response:
            response.raise_for_status()
            server_date = response.headers.get("Date")
            if not server_date:
                raise RuntimeError("Microsoft did not return its server time; cannot verify the speech token clock.")
            server_timestamp = parsedate_to_datetime(server_date).timestamp()
            DRM.clock_skew_seconds = server_timestamp - time.time()
            return DRM.clock_skew_seconds


def use_alternate_endpoint(communicate):
    from edge_tts.constants import TRUSTED_CLIENT_TOKEN

    # This is Microsoft's alternate Edge endpoint, used by upstream edge-tts
    # 7.2.2. Its handshake requires the synthesize subprotocol header.
    communicate.WSS_URL = (
        "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1"
        f"?Ocp-Apim-Subscription-Key={TRUSTED_CLIENT_TOKEN}"
    )
    communicate.WSS_HEADERS = {
        **communicate.WSS_HEADERS,
        "Sec-WebSocket-Protocol": "synthesize",
    }


def installed_edge_version():
    override = os.environ.get("EDGE_TTS_BROWSER_VERSION", "").strip()
    if override:
        if not VERSION_PATTERN.fullmatch(override):
            raise ValueError("EDGE_TTS_BROWSER_VERSION must look like 155.0.4283.45")
        return override

    versions = []
    for variable in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"):
        base = os.environ.get(variable)
        if not base:
            continue
        application = Path(base) / "Microsoft" / "Edge" / "Application"
        try:
            for directory in application.iterdir():
                if VERSION_PATTERN.fullmatch(directory.name) and (directory / "msedge.dll").is_file():
                    versions.append(directory.name)
        except OSError:
            continue
    return max(versions, key=lambda value: tuple(map(int, value.split(".")))) if versions else None


def main():
    sys.path.insert(0, sys.argv.pop(1))
    import edge_tts.communicate as communicate

    version = installed_edge_version()
    if version:
        major = version.split(".")[0]
        # The upstream package imports these values at module load time. Update
        # the runtime values together without changing third-party package files.
        communicate.SEC_MS_GEC_VERSION = f"1-{version}"
        communicate.WSS_HEADERS = {
            **communicate.WSS_HEADERS,
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                f"(KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36 Edg/{major}.0.0.0"
            ),
        }
        print(f"Edge TTS browser compatibility: {version}", flush=True)
    else:
        print("Edge TTS browser compatibility: upstream defaults (Edge installation not found)", flush=True)

    def synthesize():
        correction = asyncio.run(synchronize_service_clock())
        print(f"Edge TTS token clock correction: {correction:+.0f} seconds (Microsoft server time)", flush=True)
        runpy.run_module("edge_tts", run_name="__main__")

    def recover_connection(error, attempt):
        if getattr(error, "status", None) == 403 and attempt == 1:
            use_alternate_endpoint(communicate)
            print("Switching speech connection to Microsoft's alternate Edge endpoint: api.msedgeservices.com", flush=True)

    try:
        run_with_retries(synthesize, on_retry=recover_connection)
    except Exception as error:
        if os.environ.get("EDGE_TTS_DEBUG") == "true":
            raise
        status = getattr(error, "status", None)
        detail = getattr(error, "message", None) or str(error)
        socket_error = getattr(error, "os_error", None)
        socket_code = getattr(socket_error, "winerror", None) or getattr(socket_error, "errno", None)
        print(
            f"{type(error).__name__}: {status if status is not None else ''} {detail}"
            + (f" (socket code {socket_code})" if socket_code else ""),
            file=sys.stderr,
        )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
