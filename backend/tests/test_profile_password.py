"""Tests for /auth/change-password and /auth/profile (iteration 5)."""
import os
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
ORIG_PW = "TempPw@98765"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": ORIG_PW}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---- change-password ----
def test_change_password_wrong_current(headers):
    r = requests.post(f"{BASE_URL}/api/auth/change-password",
                      json={"current_password": "WRONG_PW_xyz", "new_password": "Whatever@123"},
                      headers=headers, timeout=15)
    assert r.status_code == 401, r.text


def test_change_password_success_and_restore(headers):
    new_pw = "ChangeMe@123"
    # change
    r = requests.post(f"{BASE_URL}/api/auth/change-password",
                      json={"current_password": ORIG_PW, "new_password": new_pw},
                      headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    # login with new
    r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": new_pw}, timeout=15)
    assert r2.status_code == 200, r2.text
    new_token = r2.json()["token"]

    # restore back to ORIG_PW
    r3 = requests.post(f"{BASE_URL}/api/auth/change-password",
                      json={"current_password": new_pw, "new_password": ORIG_PW},
                      headers={"Authorization": f"Bearer {new_token}", "Content-Type": "application/json"},
                      timeout=15)
    assert r3.status_code == 200, r3.text
    # confirm restore
    r4 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": ORIG_PW}, timeout=15)
    assert r4.status_code == 200


# ---- profile ----
def test_update_profile_and_me(headers):
    payload = {"name": "Demo User", "headline": "Founder @ Innoira", "avatar_url": "data:image/png;base64,iVBORw0KGgo="}
    r = requests.put(f"{BASE_URL}/api/auth/profile", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["headline"] == "Founder @ Innoira"
    assert u["avatar_url"].startswith("data:image/png;base64,")

    r2 = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=15)
    assert r2.status_code == 200
    me = r2.json()["user"]
    assert me["headline"] == "Founder @ Innoira"
    assert me["avatar_url"].startswith("data:image/png;base64,")


def test_update_profile_avatar_too_large(headers):
    big = "data:image/png;base64," + ("A" * 6_100_000)
    r = requests.put(f"{BASE_URL}/api/auth/profile", json={"avatar_url": big}, headers=headers, timeout=30)
    assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text[:200]}"
