import pytest
from fastapi.testclient import TestClient
from backend.config import settings
from backend.security.rate_limiter import limiter

@pytest.fixture(autouse=True)
def reset_rate_limiter_buckets():
    """Reset rate limiter buckets before every test."""
    limiter.clear()

# Inject X-API-Passkey default header into TestClient so existing test suites continue passing
_original_testclient_init = TestClient.__init__

def _patched_testclient_init(self, app, *args, **kwargs):
    headers = kwargs.get('headers')
    if headers is None:
        headers = {}
    else:
        headers = dict(headers)
    # Only set default passkey if test did not explicitly provide one
    if 'X-API-Passkey' not in headers and 'x-api-passkey' not in headers:
        headers['X-API-Passkey'] = getattr(settings, 'API_MASTER_PASSKEY', 'Mom')
    kwargs['headers'] = headers
    _original_testclient_init(self, app, *args, **kwargs)

TestClient.__init__ = _patched_testclient_init
