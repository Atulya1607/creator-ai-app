"""CreatorAI iteration-2 tests: TTS voiceover, MP4 video, batch generation, custom niche.

Runs against the public preview URL. Requires demo user demo@creator.ai/password123.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://content-forge-ai-98.preview.emergentagent.com"
BASE = BASE.rstrip("/")

DEMO_EMAIL = "demo@creator.ai"
DEMO_PW = "password123"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def token(s):
    r = s.post(f"{BASE}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW})
    if r.status_code != 200:
        s.post(f"{BASE}/api/auth/signup", json={"email": DEMO_EMAIL, "password": DEMO_PW, "name": "Demo"})
        r = s.post(f"{BASE}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def content_id(s, h):
    """Fresh content to run TTS + video against."""
    payload = {"niche": "AI", "tone": "energetic", "duration": "15s", "language": "English"}
    r = s.post(f"{BASE}/api/content/generate", headers=h, json=payload, timeout=90)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------- Voiceover ----------
def test_voiceover_before_video_returns_400(s, h, content_id):
    # Video attempt BEFORE any voiceover for this fresh content -> 400
    r = s.post(f"{BASE}/api/content/{content_id}/video", headers=h, timeout=120)
    assert r.status_code == 400, f"expected 400 (no voiceover yet) got {r.status_code}: {r.text[:300]}"
    body = r.json()
    assert "voiceover" in (body.get("detail") or "").lower()


def test_voiceover_generate(s, h, content_id):
    r = s.post(f"{BASE}/api/content/{content_id}/voiceover", headers=h,
               json={"voice": "nova", "speed": 1.0}, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["id"] == content_id
    assert j["voice"] == "nova"
    assert j["audio_base64"] and len(j["audio_base64"]) > 500  # base64 mp3 bytes
    assert j["duration_hint"]


def test_media_mp3_served(s, h, content_id):
    r = s.get(f"{BASE}/api/media/{content_id}.mp3", timeout=30)
    assert r.status_code == 200, r.text
    ct = r.headers.get("content-type", "")
    assert "audio" in ct and "mpeg" in ct
    assert len(r.content) > 1000  # non-empty mp3


def test_content_flags_updated_after_voiceover(s, h, content_id):
    r = s.get(f"{BASE}/api/content/{content_id}", headers=h)
    assert r.status_code == 200
    j = r.json()
    assert j["voiceover_ready"] is True
    assert j["voiceover_voice"] == "nova"
    assert j["video_ready"] is False


# ---------- Video ----------
def test_video_generate_after_voiceover(s, h, content_id):
    r = s.post(f"{BASE}/api/content/{content_id}/video", headers=h, timeout=180)
    assert r.status_code == 200, r.text[:600]
    j = r.json()
    assert j["id"] == content_id
    assert j["video_url"] == f"/api/media/{content_id}.mp4"


def test_media_mp4_served(s, h, content_id):
    r = s.get(f"{BASE}/api/media/{content_id}.mp4", timeout=30)
    assert r.status_code == 200, r.text[:300]
    ct = r.headers.get("content-type", "")
    assert "video/mp4" in ct
    assert len(r.content) > 5000


def test_content_video_ready_flag(s, h, content_id):
    r = s.get(f"{BASE}/api/content/{content_id}", headers=h)
    assert r.status_code == 200
    assert r.json()["video_ready"] is True


# ---------- Batch ----------
def test_batch_generate_count_3(s, h):
    payload = {
        "seed_idea": "AI tools that save creators 10 hours a week",
        "niche": "AI",
        "tone": "energetic",
        "duration": "30s",
        "language": "English",
        "count": 3,
    }
    r = s.post(f"{BASE}/api/content/batch", headers=h, json=payload, timeout=120)
    assert r.status_code == 200, r.text[:600]
    items = r.json()
    assert isinstance(items, list) and len(items) == 3
    for it in items:
        assert it["id"] and it["script"] and isinstance(it["ideas"], list)
        assert 12 <= len(it["hashtags"]) <= 15
        assert all(t.startswith("#") for t in it["hashtags"])
        assert 1 <= it["viral_score"] <= 10
    # persistence check: last one is retrievable
    last = items[-1]["id"]
    g = s.get(f"{BASE}/api/content/{last}", headers=h)
    assert g.status_code == 200


# ---------- Media 404 ----------
def test_media_404(s):
    r = s.get(f"{BASE}/api/media/{uuid.uuid4().hex}.mp3")
    assert r.status_code == 404
