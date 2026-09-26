"""Tests for User Account History & Dynamic Context Retention."""
from app import accounts


def test_user_history_recording():
    user = accounts.create("history_test@example.com", "password123", "History User")
    uid = user["id"]

    accounts.add_user_history(uid, "feedback", {
        "learned_delta": {"heritage": 0.4, "local-food": 0.2}
    })
    accounts.add_user_history(uid, "stop_deleted", {
        "experience_id": "exp-test-1",
        "title": "Test Fort",
    })

    history = accounts.get_user_history(uid)
    assert len(history) == 2

    context = accounts.get_user_context_summary(uid)
    assert context["learned"].get("heritage") == 0.4
    assert "exp-test-1" in context["rejected"]


def test_account_deletion_cleans_history():
    user = accounts.create("del_history@example.com", "password123", "Del User")
    uid = user["id"]

    accounts.add_user_history(uid, "chat", {"query": "Find forts"})
    accounts.save_oauth_tokens(uid, "google", "access", "refresh", "2026-12-31", "scopes")

    assert len(accounts.get_user_history(uid)) == 1
    assert accounts.get_oauth_tokens(uid) is not None

    accounts.delete(uid)

    assert len(accounts.get_user_history(uid)) == 0
    assert accounts.get_oauth_tokens(uid) is None
