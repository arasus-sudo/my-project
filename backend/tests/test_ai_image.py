"""Backend tests for AI image generation endpoint and regression on core flows."""
import os
import base64
import pytest
import requests

def _read_frontend_env():
    tests_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(tests_dir, "..", "..", "frontend", ".env")
    with open(env_path) as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env().rstrip("/")
EMAIL = "test@test.com"
PASSWORD = "TempPw@98765"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in response: {list(data.keys())}"
    return tok


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- AI Image endpoint ---

def test_ai_image_missing_token():
    r = requests.post(f"{BASE_URL}/api/carousel/ai-image",
                      json={"prompt": "test", "provider": "nano-banana"}, timeout=30)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


def test_ai_image_empty_prompt(auth_headers):
    r = requests.post(f"{BASE_URL}/api/carousel/ai-image",
                      json={"prompt": "", "provider": "nano-banana"},
                      headers=auth_headers, timeout=30)
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"


def test_ai_image_nano_banana_generates(auth_headers):
    r = requests.post(f"{BASE_URL}/api/carousel/ai-image",
                      json={"prompt": "A minimal geometric abstract background in teal and orange",
                            "provider": "nano-banana", "aspect": "portrait", "size": "1080x1350"},
                      headers=auth_headers, timeout=120)
    assert r.status_code == 200, f"nano-banana failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert data.get("provider") == "nano-banana"
    b64 = data.get("image_base64")
    assert b64 and len(b64) > 1000, "image_base64 too small"
    # validate decodable
    raw = base64.b64decode(b64[:2000] + "==")
    assert raw, "base64 not decodable"
    assert "image/" in data.get("mime_type", "")
    print(f"nano-banana image size (b64 chars): {len(b64)}, mime: {data.get('mime_type')}")


def test_ai_image_gpt_image_1_generates(auth_headers):
    r = requests.post(f"{BASE_URL}/api/carousel/ai-image",
                      json={"prompt": "A minimal geometric abstract background in teal and orange",
                            "provider": "gpt-image-1", "aspect": "portrait"},
                      headers=auth_headers, timeout=200)
    assert r.status_code == 200, f"gpt-image-1 failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert data.get("provider") == "gpt-image-1"
    assert data.get("mime_type") == "image/png"
    b64 = data.get("image_base64")
    assert b64 and len(b64) > 1000
    print(f"gpt-image-1 image size (b64 chars): {len(b64)}")


# --- Regression on core endpoints ---

@pytest.mark.parametrize("path", [
    "/api/dashboard",
    "/api/campaigns",
    "/api/leads",
    "/api/inbox",
    "/api/deals",
    "/api/carousel",
])
def test_core_endpoints_ok(auth_headers, path):
    r = requests.get(f"{BASE_URL}{path}", headers=auth_headers, timeout=30)
    assert r.status_code in (200, 204), f"{path} -> {r.status_code} {r.text[:200]}"
