import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

env_path = backend_dir / ".env"
if env_path.is_file():
    load_dotenv(env_path)


@pytest.fixture(scope="session", autouse=True)
def reseed_after_tests():
    yield
    try:
        from scripts.seed_dev import main

        main()
    except Exception:
        pass
