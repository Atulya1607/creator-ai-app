"""CreatorAI iteration-3 tests: AI thumbnail generation, media PNG serving,
video render using thumbnail background, thumbnail flags, style override, 404.

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
    """Fresh content to run thumbnail + voiceover + video against."""
    payload = {"niche": "AI", "tone": "energetic", "duration": "15s", "language": "English"}
    r = s.post(f"{BASE}/api/content/generate", headers=h, json=payload, timeout=90)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------- Thumbnail (default style) ----------
def test_thumbnail_generate_default(s, h, content_id):
    r = s.post(f"{BASE}/api/content/{content_id}/thumbnail", headers=h,
               json={}, timeout=120)
    assert r.status_code == 200, r.text[:600]
    j = r.json()
    assert j["id"] == content_id
    assert j["image_url"] == f"/api/media/{content_id}.png"
    assert isinstance(j.get("prompt_used"), str) and len(j["prompt_used"]) > 40


def test_media_png_served(s, content_id):
    r = s.get(f"{BASE}/api/media/{content_id}.png", timeout=30)
    assert r.status_code == 200, r.text[:200]
    ct = r.headers.get("content-type", "")
    assert "image/png" in ct
    assert len(r.content) > 5000  # non-empty PNG (real thumb ~2MB)


def test_content_thumbnail_flags_after_generate(s, h, content_id):
    r = s.get(f"{BASE}/api/content/{content_id}", headers=h)
    assert r.status_code == 200
    j = r.json()
    assert j.get("thumbnail_ready") is True
    # default style comes from the content tone (energetic here)
    assert isinstance(j.get("thumbnail_tone"), str) and j["thumbnail_tone"]


# ---------- Thumbnail (style override) ----------
def test_thumbnail_style_override_shocking(s, h, content_id):
    r = s.post(f"{BASE}/api/content/{content_id}/thumbnail", headers=h,
               json={"style": "shocking"}, timeout=120)
    assert r.status_code == 200, r.text[:600]
    j = r.json()
    assert "shocking" in (j.get("prompt_used") or "").lower()
    # verify tone was persisted
    g = s.get(f"{BASE}/api/content/{content_id}", headers=h)
    assert g.status_code == 200
    assert g.json().get("thumbnail_tone") == "shocking"


# ---------- Thumbnail 404 for missing content ----------
def test_thumbnail_missing_content_404(s, h):
    fake = uuid.uuid4().hex
    r = s.post(f"{BASE}/api/content/{fake}/thumbnail", headers=h, json={}, timeout=30)
    assert r.status_code == 404, r.text[:200]


# ---------- Video regression with thumbnail background ----------
def test_voiceover_then_video_with_thumbnail_bg(s, h, content_id):
    # 1. voiceover is required before video
    v = s.post(f"{BASE}/api/content/{content_id}/voiceover", headers=h,
               json={"voice": "nova", "speed": 1.0}, timeout=60)
    assert v.status_code == 200, v.text[:400]

    # 2. render MP4 — thumbnail already exists, so ffmpeg should use it as bg
    r = s.post(f"{BASE}/api/content/{content_id}/video", headers=h, timeout=180)
    assert r.status_code == 200, r.text[:800]
    j = r.json()
    assert j["video_url"] == f"/api/media/{content_id}.mp4"

    # 3. served MP4 non-empty
    m = s.get(f"{BASE}/api/media/{content_id}.mp4", timeout=30)
    assert m.status_code == 200
    assert "video/mp4" in m.headers.get("content-type", "")
    assert len(m.content) > 5000


# ---------- Media 404 (png) ----------
def test_media_png_404(s):
    r = s.get(f"{BASE}/api/media/{uuid.uuid4().hex}.png")
    assert r.status_code == 404
