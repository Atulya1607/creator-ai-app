"""CreatorAI backend integration tests."""
import os
import uuid
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE = "https://content-forge-ai-98.preview.emergentagent.com"

DEMO_EMAIL = "demo@creator.ai"
DEMO_PW = "password123"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def demo_token(s):
    # ensure demo user exists
    r = s.post(f"{BASE}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW})
    if r.status_code != 200:
        s.post(f"{BASE}/api/auth/signup", json={"email": DEMO_EMAIL, "password": DEMO_PW, "name": "Demo"})
        r = s.post(f"{BASE}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def h(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


# ---------------- AUTH ----------------
def test_root(s):
    r = s.get(f"{BASE}/api/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_signup_and_login(s):
    email = f"test_{uuid.uuid4().hex[:8]}@test.ai"
    r = s.post(f"{BASE}/api/auth/signup", json={"email": email, "password": "pw12345", "name": "T"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert "token" in j and j["user"]["email"] == email
    # duplicate
    r2 = s.post(f"{BASE}/api/auth/signup", json={"email": email, "password": "pw12345", "name": "T"})
    assert r2.status_code == 400
    # login
    r3 = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": "pw12345"})
    assert r3.status_code == 200
    # wrong pw
    r4 = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": "wrong"})
    assert r4.status_code == 401


def test_me_protected(s, h):
    r = s.get(f"{BASE}/api/auth/me", headers=h)
    assert r.status_code == 200
    assert r.json()["email"] == DEMO_EMAIL
    # no auth
    r2 = s.get(f"{BASE}/api/auth/me")
    assert r2.status_code in (401, 403)


def test_onboarding(s, h):
    r = s.post(f"{BASE}/api/auth/onboarding", headers=h, json={"niche": "AI", "goals": ["Go viral", "Post daily"]})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["niche"] == "AI"
    assert j["onboarded"] is True
    assert "Go viral" in j["goals"]


# ---------------- CONTENT ----------------
@pytest.fixture(scope="session")
def generated_content(s, h):
    payload = {"niche": "AI", "tone": "energetic", "duration": "30s", "language": "English"}
    r = s.post(f"{BASE}/api/content/generate", headers=h, json=payload, timeout=90)
    assert r.status_code == 200, f"generate failed: {r.status_code} {r.text[:400]}"
    return r.json()


def test_content_generate_schema(generated_content):
    c = generated_content
    assert isinstance(c["ideas"], list) and len(c["ideas"]) == 3
    assert c["script"] and c["voiceover_text"] and c["thumbnail_idea"] and c["caption"]
    assert isinstance(c["hashtags"], list) and 12 <= len(c["hashtags"]) <= 15
    assert all(t.startswith("#") for t in c["hashtags"])
    assert isinstance(c["viral_score"], int) and 1 <= c["viral_score"] <= 10
    assert c["viral_reasoning"]


def test_content_list_and_get(s, h, generated_content):
    cid = generated_content["id"]
    r = s.get(f"{BASE}/api/content/list", headers=h)
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert cid in ids
    r2 = s.get(f"{BASE}/api/content/{cid}", headers=h)
    assert r2.status_code == 200
    assert r2.json()["id"] == cid


def test_schedule_then_verify(s, h, generated_content):
    cid = generated_content["id"]
    dt = (datetime.now(tz=timezone.utc) + timedelta(days=1)).isoformat()
    r = s.post(f"{BASE}/api/schedule", headers=h, json={"content_id": cid, "scheduled_at": dt})
    assert r.status_code == 200, r.text
    assert r.json()["scheduled_at"] is not None
    # schedule list
    r2 = s.get(f"{BASE}/api/schedule/list", headers=h)
    assert r2.status_code == 200
    ids = [x["id"] for x in r2.json()]
    assert cid in ids


def test_stats(s, h):
    r = s.get(f"{BASE}/api/stats", headers=h)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ["total_generated", "total_scheduled", "current_streak", "best_streak", "week_counts"]:
        assert k in j
    assert len(j["week_counts"]) == 7
    assert all(isinstance(x, int) for x in j["week_counts"])


def test_delete_content(s, h):
    # generate a throwaway content to delete
    r = s.post(f"{BASE}/api/content/generate", headers=h,
               json={"niche": "AI", "tone": "energetic", "duration": "15s", "language": "English"},
               timeout=90)
    assert r.status_code == 200
    cid = r.json()["id"]
    d = s.delete(f"{BASE}/api/content/{cid}", headers=h)
    assert d.status_code == 200
    # verify deletion
    g = s.get(f"{BASE}/api/content/{cid}", headers=h)
    assert g.status_code == 404
