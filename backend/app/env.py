"""Environment variable loader. Reads .env from the project root, backend folder, or cwd."""
from __future__ import annotations

import os
from pathlib import Path


def load_dotenv_custom(paths: list[Path] | None = None) -> None:
    if paths is None:
        here = Path(__file__).resolve().parent
        paths = [
            here.parents[1] / ".env",  # repo root / .env
            here.parent / ".env",  # backend / .env
            Path.cwd() / ".env",  # cwd / .env
        ]
    for p in paths:
        if p.is_file():
            try:
                for line in p.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip()
                        if (v.startswith('"') and v.endswith('"')) or (
                            v.startswith("'") and v.endswith("'")
                        ):
                            v = v[1:-1]
                        if k and k not in os.environ:
                            os.environ[k] = v
            except Exception:
                pass


# Auto-load on import
load_dotenv_custom()
