"""Install local dependencies by copying files so Windows ACLs are inherited."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
destination = Path(os.environ.get("EDGE_TTS_PYTHON_PACKAGES") or root / ".tts-runtime" / "packages").resolve()
with tempfile.TemporaryDirectory(prefix="webcraft-tts-") as temporary:
    staging = Path(temporary) / "packages"
    subprocess.run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--no-compile", "--only-binary=:all:", "--target", str(staging), "-r", str(root / "requirements.txt")], check=True)
    shutil.copytree(staging, destination, dirs_exist_ok=True)
subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0,sys.argv[1]); import edge_tts,edge_tts.__main__,aiohttp; print('Edge TTS installation verified')", str(destination)], check=True)
