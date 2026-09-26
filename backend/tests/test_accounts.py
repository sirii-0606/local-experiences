"""Accounts, sessions, roles, profile, admin (v2 website, P1)."""

import pytest
from fastapi.testclient import TestClient

from app import accounts
from app.main import app

PW = "correct horse 42"


@pytest.fixture(autouse=True)
def clean_throttle(monkeypatch):
    accounts._failures.clear()
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)


def login(c: TestClient, email: str, password: str) -> int:
    return c.post("/auth/login", json={"email": email, "password": password}).status_code


def client() -> TestClient:
    return TestClient(app, headers={"X-Requested-With": "le"})


def signup(email="asha@example.com", name="Asha") -> TestClient:
    c = client()
    r = c.post("/auth/register", json={"email": email, "password": PW, "display_name": name})
    assert r.status_code == 201, r.text
    return c


def test_password_hashing_round_trip():
    h = accounts.hash_password(PW)
    assert h.startswith("scrypt$") and PW not in h
    assert accounts.verify_password(PW, h) and not accounts.verify_password("nope", h)
    assert accounts.hash_password(PW) != h  # salted


def test_register_signs_in_and_me_works():
    c = signup("Asha@Example.com ")
    me = c.get("/auth/me").json()
    assert me["email"] == "asha@example.com" and me["role"] == "traveler" and not me["onboarded"]
    cookie = c.cookies.get("le_session")
    assert cookie and len(cookie) > 30


def test_duplicate_and_bad_input():
    signup()
    c = client()
    assert (
        c.post(
            "/auth/register",
            json={"email": "asha@example.com", "password": PW, "display_name": "X"},
        ).status_code
        == 409
    )
    assert (
        c.post(
            "/auth/register", json={"email": "not-an-email", "password": PW, "display_name": "X"}
        ).status_code
        == 422
    )
    assert (
        c.post(
            "/auth/register",
            json={"email": "b@example.com", "password": "short", "display_name": "X"},
        ).status_code
        == 422
    )


def test_login_logout_and_wrong_password():
    signup()
    c = client()
    assert login(c, "asha@example.com", "wrong") == 401
    assert login(c, "nobody@example.com", PW) == 401
    assert login(c, "asha@example.com", PW) == 200
    assert c.get("/auth/me").status_code == 200
    assert c.post("/auth/logout").status_code == 204
    assert c.get("/auth/me").status_code == 401


def test_login_throttle():
    signup()
    c = client()
    for _ in range(5):
        assert login(c, "asha@example.com", "x") == 401
    r = c.post("/auth/login", json={"email": "asha@example.com", "password": PW})
    assert r.status_code == 429 and "try again" in r.json()["detail"]


def test_expired_and_forged_sessions_are_rejected():
    c = signup()
    token = c.cookies.get("le_session")
    accounts.expire_session_for_test(token)
    assert c.get("/auth/me").status_code == 401
    forged = client()
    forged.cookies.set("le_session", "forged-token")
    assert forged.get("/auth/me").status_code == 401


def test_csrf_header_required_for_writes():
    bare = TestClient(app)  # no X-Requested-With
    r = bare.post(
        "/auth/register", json={"email": "c@example.com", "password": PW, "display_name": "C"}
    )
    assert r.status_code == 403


def test_profile_round_trip_and_validation():
    c = signup()
    blank = c.get("/me/profile").json()
    assert blank["display_name"] == "Asha" and blank["interests"] == []
    prof = blank | {
        "age": 34,
        "interests": ["craft", "local-food"],
        "dislikes": ["nightlife"],
        "accessibility": ["step_free"],
        "diet": "vegetarian",
        "transport": ["walk", "bus"],
        "companions": [{"name": "Ravi", "age": 8, "interests": ["kids"]}],
    }
    assert c.put("/me/profile", json=prof).status_code == 200
    assert c.get("/me/profile").json()["companions"][0]["name"] == "Ravi"
    assert c.get("/auth/me").json()["onboarded"]
    assert c.put("/me/profile", json=prof | {"interests": ["not-a-tag"]}).status_code == 422
    assert client().get("/me/profile").status_code == 401  # someone else, not signed in


def test_password_change_signs_out_other_devices():
    laptop = signup()
    phone = client()
    phone.post("/auth/login", json={"email": "asha@example.com", "password": PW})
    assert (
        laptop.put(
            "/me/password", json={"current_password": "wrong", "new_password": "new password 1"}
        ).status_code
        == 403
    )
    assert (
        laptop.put(
            "/me/password", json={"current_password": PW, "new_password": "new password 1"}
        ).status_code
        == 204
    )
    assert laptop.get("/auth/me").status_code == 200
    assert phone.get("/auth/me").status_code == 401
    assert (
        client()
        .post("/auth/login", json={"email": "asha@example.com", "password": "new password 1"})
        .status_code
        == 200
    )


def test_export_has_my_data_but_no_secrets_and_delete_wipes_it():
    c = signup()
    c.put("/me/profile", json={"display_name": "Asha", "accessibility": ["wheelchair"]})
    data = c.get("/me/export").json()
    assert data["profile"]["accessibility"] == ["wheelchair"]
    assert "password" not in str(data) and "scrypt" not in str(data)
    assert c.request("DELETE", "/me", json={"password": "wrong"}).status_code == 403
    assert c.request("DELETE", "/me", json={"password": PW}).status_code == 204
    assert accounts.get_by_email("asha@example.com") is None
    assert login(client(), "asha@example.com", PW) == 401


def admin_client(monkeypatch) -> TestClient:
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin pass 123")
    c = client()
    r = c.post("/auth/login", json={"email": "admin@example.com", "password": "admin pass 123"})
    assert r.status_code == 200 and r.json()["role"] == "admin", r.text
    return c


def test_roles_guard_admin_endpoints(monkeypatch):
    traveler = signup()
    assert traveler.get("/admin/users").status_code == 403
    assert client().get("/admin/users").status_code == 401
    admin = admin_client(monkeypatch)
    assert admin.get("/admin/users").status_code == 200


def test_admin_sees_account_facts_never_profile_data(monkeypatch):
    c = signup()
    c.put(
        "/me/profile",
        json={"display_name": "Asha", "age": 34, "accessibility": ["wheelchair"], "diet": "jain"},
    )
    rows = admin_client(monkeypatch).get("/admin/users").json()
    asha = next(r for r in rows if r["email"] == "asha@example.com")
    assert set(asha) == {"id", "email", "role", "display_name", "disabled", "created", "last_login"}
    assert "wheelchair" not in str(rows) and "jain" not in str(rows)


def test_admin_disables_promotes_and_resets(monkeypatch):
    user = signup()
    admin = admin_client(monkeypatch)
    uid = user.get("/auth/me").json()["id"]
    assert admin.patch(f"/admin/users/{uid}", json={"disabled": True}).json()["disabled"]
    assert user.get("/auth/me").status_code == 401  # sessions revoked
    assert login(client(), "asha@example.com", PW) == 403
    admin.patch(
        f"/admin/users/{uid}",
        json={"disabled": False, "role": "provider", "temp_password": "temporary 999"},
    )
    c = client()
    assert (
        c.post(
            "/auth/login", json={"email": "asha@example.com", "password": "temporary 999"}
        ).json()["role"]
        == "provider"
    )
    stats = admin.get("/admin/stats").json()
    assert stats["users"] == 2 and stats["admins"] == 1 and stats["providers"] == 1


def test_last_admin_is_protected(monkeypatch):
    admin = admin_client(monkeypatch)
    me = admin.get("/auth/me").json()["id"]
    assert admin.patch(f"/admin/users/{me}", json={"role": "traveler"}).status_code == 409
    assert admin.patch(f"/admin/users/{me}", json={"disabled": True}).status_code == 409
    assert admin.request("DELETE", "/me", json={"password": "admin pass 123"}).status_code == 409
