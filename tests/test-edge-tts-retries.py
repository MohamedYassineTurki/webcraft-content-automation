import importlib.util
import asyncio
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, Mock, patch

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / ".tts-runtime" / "packages"))
import aiohttp
from aiohttp.client_reqrep import ConnectionKey

spec = importlib.util.spec_from_file_location("tts_runner", root / "src" / "run-edge-tts.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class AudioRecoveryTests(unittest.TestCase):
    def blocked_connection(self):
        key = ConnectionKey("speech.platform.bing.com", 443, True, True, None, None, None)
        return aiohttp.ClientConnectorError(key, PermissionError(13, "Access is denied"))

    def test_temporary_block_recovers_in_same_operation(self):
        operation = Mock(side_effect=[self.blocked_connection(), None])
        with patch.object(runner.time, "sleep") as sleep:
            runner.run_with_retries(operation)
        self.assertEqual(operation.call_count, 2)
        sleep.assert_called_once_with(20)

    def test_persistent_block_stops_after_three_attempts(self):
        operation = Mock(side_effect=self.blocked_connection())
        with patch.object(runner.time, "sleep") as sleep:
            with self.assertRaises(aiohttp.ClientConnectorError):
                runner.run_with_retries(operation)
        self.assertEqual(operation.call_count, 3)
        self.assertEqual(sleep.call_count, 2)

    def test_configuration_error_does_not_retry(self):
        operation = Mock(side_effect=ValueError("Invalid voice setting"))
        with patch.object(runner.time, "sleep") as sleep:
            with self.assertRaises(ValueError):
                runner.run_with_retries(operation)
        self.assertEqual(operation.call_count, 1)
        sleep.assert_not_called()

    def test_microsoft_rejection_keeps_short_delay(self):
        rejection = aiohttp.ClientResponseError(None, (), status=403, message="Forbidden")
        operation = Mock(side_effect=[rejection, None])
        with patch.object(runner.time, "sleep") as sleep:
            runner.run_with_retries(operation)
        sleep.assert_called_once_with(5)

    def test_microsoft_rejection_switches_endpoint_before_retry(self):
        rejection = aiohttp.ClientResponseError(None, (), status=403, message="Forbidden")
        operation = Mock(side_effect=[rejection, None])
        recovery = Mock()
        with patch.object(runner.time, "sleep"):
            runner.run_with_retries(operation, on_retry=recovery)
        recovery.assert_called_once_with(rejection, 1)

    def test_alternate_endpoint_sets_required_subprotocol(self):
        communicate = Mock(WSS_HEADERS={"User-Agent": "test"})
        runner.use_alternate_endpoint(communicate)
        self.assertTrue(communicate.WSS_URL.startswith("wss://api.msedgeservices.com/"))
        self.assertEqual(communicate.WSS_HEADERS["Sec-WebSocket-Protocol"], "synthesize")
        self.assertEqual(communicate.WSS_HEADERS["User-Agent"], "test")

    def test_server_clock_correction_replaces_previous_skew(self):
        from edge_tts.drm import DRM

        response = Mock(headers={"Date": "Thu, 01 Jan 1970 01:00:00 GMT"})
        response_context = MagicMock()
        response_context.__aenter__ = AsyncMock(return_value=response)
        session = Mock()
        session.get.return_value = response_context
        session_context = MagicMock()
        session_context.__aenter__ = AsyncMock(return_value=session)
        original_skew = DRM.clock_skew_seconds
        try:
            DRM.clock_skew_seconds = 600
            with patch.object(aiohttp, "ClientSession", return_value=session_context), patch.object(runner.time, "time", return_value=0):
                correction = asyncio.run(runner.synchronize_service_clock())
            self.assertEqual(correction, 3600)
            self.assertEqual(DRM.clock_skew_seconds, 3600)
        finally:
            DRM.clock_skew_seconds = original_skew


if __name__ == "__main__":
    unittest.main()
