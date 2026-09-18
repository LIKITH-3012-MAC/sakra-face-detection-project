import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.config import settings
from backend.services.auth_service import auth_service
from backend.security.rate_limiter import limiter

# Explicit raw client with NO default headers to test unauthenticated / missing passkey requests
raw_client = TestClient(app, headers={'X-API-Passkey': ''})

@pytest.fixture(autouse=True)
def clean_limiter():
    limiter.clear()

def get_admin_token() -> str:
    return auth_service.create_token({
        'id': 1,
        'email': 'admin@sakra.test',
        'full_name': 'Admin User',
        'role': 'admin'
    })

def get_student_token() -> str:
    return auth_service.create_token({
        'id': 100,
        'email': 'student@sakra.test',
        'full_name': 'Student User',
        'role': 'user',
        'student_id': 'STD-001',
        'roll_number': 'ROLL-001'
    })


def test_missing_passkey_is_rejected_on_all_route_categories():
    """Verify that requests without X-API-Passkey are rejected with 401 Unauthorized."""
    protected_endpoints = [
        ('GET', '/api/students'),
        ('GET', '/api/attendance/today'),
        ('GET', '/api/attendance/dashboard-stats'),
        ('GET', '/api/camera/live-status'),
        ('GET', '/api/camera/status'),
        ('GET', '/api/reports/daily'),
        ('GET', '/api/recognition/status'),
        ('GET', '/api/training/status'),
        ('GET', '/api/admin/overview'),
        ('POST', '/api/auth/login'),
        ('POST', '/api/auth/register-request-otp'),
    ]

    for method, path in protected_endpoints:
        limiter.clear()  # Reset brute force bucket between independent route checks
        if method == 'GET':
            resp = raw_client.get(path, headers={'X-API-Passkey': ''})
        else:
            resp = raw_client.post(path, headers={'X-API-Passkey': ''}, json={})

        assert resp.status_code == 401, f'{method} {path} should return 401 on missing passkey, got {resp.status_code}'
        assert resp.json() == {'detail': 'Unauthorized'}, f'Detail leaked in {method} {path}: {resp.json()}'


def test_wrong_passkey_is_rejected():
    """Verify that incorrect or case-mismatched passkeys are rejected with generic 401."""
    invalid_keys = ['wrong', 'mom', 'MOM', 'Mommy', 'Dad', '123456', ' Mom', 'Mom ']

    for key in invalid_keys:
        limiter.clear()
        resp = raw_client.get('/api/students', headers={'X-API-Passkey': key})
        assert resp.status_code == 401, f'Key {repr(key)} expected 401, got {resp.status_code}'
        assert resp.json() == {'detail': 'Unauthorized'}


def test_correct_passkey_proceeds_to_next_layer():
    """Verify that correct passkey proceeds past passkey middleware to route handler."""
    resp = raw_client.get('/api/recognition/status', headers={'X-API-Passkey': 'Mom'})
    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is True
    assert 'model_loaded' in data['data']


def test_correct_passkey_plus_unauthenticated_user():
    """Passkey possession does NOT replace JWT authentication."""
    resp = raw_client.get('/api/auth/me', headers={'X-API-Passkey': 'Mom'})
    assert resp.status_code == 401
    assert 'Authentication required' in resp.json()['detail']

    resp = raw_client.get('/api/students', headers={'X-API-Passkey': 'Mom'})
    assert resp.status_code == 401
    assert 'Authentication required' in resp.json()['detail']


def test_correct_passkey_plus_student_rbac():
    """Student with valid passkey can access student endpoints but NOT admin endpoints."""
    student_token = get_student_token()
    headers = {
        'X-API-Passkey': 'Mom',
        'Authorization': f'Bearer {student_token}'
    }

    # Student accessing admin overview should be 403 Forbidden
    admin_resp = raw_client.get('/api/admin/overview', headers=headers)
    assert admin_resp.status_code == 403
    assert 'Administrator' in admin_resp.json()['detail']


def test_correct_passkey_plus_admin_rbac():
    """Admin with valid passkey can access admin endpoints."""
    admin_token = get_admin_token()
    headers = {
        'X-API-Passkey': 'Mom',
        'Authorization': f'Bearer {admin_token}'
    }

    resp = raw_client.get('/api/admin/overview', headers=headers)
    assert resp.status_code == 200
    assert resp.json()['success'] is True


def test_nonexistent_and_manipulated_routes_require_passkey():
    """Attacker cannot bypass passkey via path traversal or nonexistent endpoints."""
    manipulated_paths = [
        '/api/nonexistent_route_test',
        '/api//students',
        '/api/students/../students',
        '/api/something/random'
    ]

    for p in manipulated_paths:
        limiter.clear()
        resp = raw_client.get(p, headers={'X-API-Passkey': ''})
        assert resp.status_code == 401, f'Path {p} bypassed passkey middleware with code {resp.status_code}'


def test_cors_options_preflight_passes_without_passkey():
    """CORS preflight OPTIONS requests must succeed without credentials."""
    resp = raw_client.options(
        '/api/students',
        headers={
            'Origin': 'http://localhost:5173',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'X-API-Passkey,Content-Type'
        }
    )
    assert resp.status_code == 200
    assert 'X-API-Passkey' in resp.headers.get('access-control-allow-headers', '')


def test_health_and_root_infrastructure_endpoints_excluded():
    """Infrastructure probes must not require X-API-Passkey."""
    health_resp = raw_client.get('/api/health', headers={'X-API-Passkey': ''})
    assert health_resp.status_code == 200
    assert health_resp.json()['success'] is True

    root_resp = raw_client.get('/', headers={'X-API-Passkey': ''})
    assert root_resp.status_code == 200


def test_rate_limiting_brute_force_invalid_passkeys():
    """Repeated failed passkey attempts trigger 429 Too Many Requests."""
    limiter.clear()
    # Send 10 failed attempts
    for i in range(10):
        r = raw_client.get('/api/students', headers={'X-API-Passkey': 'BadPassword'})
        assert r.status_code == 401, f'Attempt {i+1} should be 401, got {r.status_code}'

    # 11th attempt must be 429 Too Many Requests
    blocked_r = raw_client.get('/api/students', headers={'X-API-Passkey': 'BadPassword'})
    assert blocked_r.status_code == 429
    assert 'Too many invalid passkey attempts' in blocked_r.json()['detail']
    assert 'Retry-After' in blocked_r.headers
