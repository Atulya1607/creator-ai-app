"""CreatorAI backend – FastAPI + MongoDB + Emergent LLM."""
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
import os
import re
import json
import uuid
import asyncio
import logging
import bcrypt
import jwt
import base64
import subprocess

# --- env ---
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
JWT_ALGO = "HS256"
JWT_EXP_DAYS = 30

# --- media dir (persisted between requests) ---
MEDIA_DIR = Path("/tmp/creatorai_media")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
FONT_PATH = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"

# --- db ---
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# --- app ---
app = FastAPI(title="CreatorAI")
api = APIRouter(prefix="/api")
security = HTTPBearer()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("creatorai")


# ---------------- Models ----------------
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class OnboardingIn(BaseModel):
    niche: str
    goals: List[str] = []


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    niche: Optional[str] = None
    goals: List[str] = []
    onboarded: bool = False
    created_at: datetime


class AuthOut(BaseModel):
    token: str
    user: UserOut


class GenerateIn(BaseModel):
    niche: str
    target_audience: str = "Gen-Z creators"
    tone: str = "energetic"
    duration: str = "30s"  # 15s / 30s / 60s
    language: str = "English"
    topic: Optional[str] = None  # optional seed idea


class GeneratedContent(BaseModel):
    id: str
    ideas: List[str]
    script: str
    voiceover_text: str
    thumbnail_idea: str
    caption: str
    hashtags: List[str]
    viral_score: int
    viral_reasoning: str
    niche: str
    duration: str
    language: str
    tone: str
    created_at: datetime
    saved: bool = False
    scheduled_at: Optional[datetime] = None
    voiceover_ready: bool = False
    voiceover_voice: Optional[str] = None
    video_ready: bool = False


class ScheduleIn(BaseModel):
    content_id: str
    scheduled_at: datetime


# ---------------- helpers ----------------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_pw(pw: str, pw_hash: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), pw_hash.encode("utf-8"))
    except Exception:
        return False


def make_token(uid: str) -> str:
    payload = {
        "sub": uid,
        "iat": datetime.now(tz=timezone.utc),
        "exp": datetime.now(tz=timezone.utc) + timedelta(days=JWT_EXP_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def user_to_out(u: dict) -> UserOut:
    return UserOut(
        id=u["id"],
        email=u["email"],
        name=u["name"],
        niche=u.get("niche"),
        goals=u.get("goals", []),
        onboarded=bool(u.get("onboarded", False)),
        created_at=u["created_at"],
    )


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        uid = payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------------- LLM ----------------
CONTENT_SYS = """You are an expert social media strategist and viral short-form video creator.
Given the user's niche, tone, audience, duration, and language, produce highly engaging,
retention-optimized content for Instagram Reels / YouTube Shorts.

You MUST reply with a SINGLE valid JSON object (no markdown, no code fences) with this exact schema:

{
  "ideas": ["idea 1", "idea 2", "idea 3"],
  "script": "HOOK: ...\\n\\nBODY: ...\\n\\nCTA: ...",
  "voiceover_text": "voiceover ready-to-record text with natural pauses",
  "thumbnail_idea": "one paragraph describing thumbnail visual, colors, and bold on-screen text",
  "caption": "instagram / youtube caption with 1–3 emojis and a hook line",
  "hashtags": ["#tag1", "#tag2", ...],
  "viral_score": 8,
  "viral_reasoning": "why this scores well"
}

Rules:
- ideas: exactly 3 short trending hooks.
- hashtags: 12–15 items, each starting with #, mix niche + broad.
- viral_score: integer 1–10.
- Do not include any text outside the JSON.
"""


async def generate_ai_content(payload: GenerateIn) -> dict:
    """Call GPT via emergentintegrations. Falls back to a static template on error."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage  # local import

    user_msg = f"""Generate a viral short-form video content package.

Niche: {payload.niche}
Target audience: {payload.target_audience}
Tone: {payload.tone}
Duration: {payload.duration}
Language: {payload.language}
{f"Topic seed: {payload.topic}" if payload.topic else ""}

Return ONLY the JSON object per the schema."""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"gen-{uuid.uuid4()}",
        system_message=CONTENT_SYS,
    ).with_model("openai", "gpt-5.4")

    raw = await chat.send_message(UserMessage(text=user_msg))
    text = raw if isinstance(raw, str) else str(raw)

    # strip code fences if any
    text = text.strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        text = m.group(0)
    data = json.loads(text)

    # normalize hashtags
    tags = data.get("hashtags", [])
    tags = [t if t.startswith("#") else f"#{t.lstrip('#')}" for t in tags if t]
    data["hashtags"] = tags[:15] if len(tags) >= 12 else tags + [f"#viral{i}" for i in range(12 - len(tags))]

    # clamp viral score
    try:
        data["viral_score"] = max(1, min(10, int(data.get("viral_score", 7))))
    except Exception:
        data["viral_score"] = 7

    for k in ["ideas", "script", "voiceover_text", "thumbnail_idea", "caption", "viral_reasoning"]:
        data.setdefault(k, "")
    if not isinstance(data.get("ideas"), list) or not data["ideas"]:
        data["ideas"] = ["Idea 1", "Idea 2", "Idea 3"]
    return data


# ---------------- Auth routes ----------------
@api.get("/")
async def root():
    return {"message": "CreatorAI API"}


@api.post("/auth/signup", response_model=AuthOut)
async def signup(body: SignupIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": body.email.lower(),
        "name": body.name.strip(),
        "password_hash": hash_pw(body.password),
        "niche": None,
        "goals": [],
        "onboarded": False,
        "created_at": datetime.now(tz=timezone.utc),
    }
    await db.users.insert_one(doc)
    return AuthOut(token=make_token(uid), user=user_to_out(doc))


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not check_pw(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return AuthOut(token=make_token(u["id"]), user=user_to_out(u))


@api.get("/auth/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return user_to_out(user)


@api.post("/auth/onboarding", response_model=UserOut)
async def onboarding(body: OnboardingIn, user=Depends(get_current_user)):
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"niche": body.niche, "goals": body.goals, "onboarded": True}},
    )
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return user_to_out(u)


# ---------------- Content routes ----------------
@api.post("/content/generate", response_model=GeneratedContent)
async def generate_content(body: GenerateIn, user=Depends(get_current_user)):
    try:
        data = await generate_ai_content(body)
    except Exception as e:
        log.exception("LLM generation failed")
        raise HTTPException(status_code=502, detail=f"AI generation failed: {e}")

    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "user_id": user["id"],
        "ideas": data["ideas"],
        "script": data["script"],
        "voiceover_text": data["voiceover_text"],
        "thumbnail_idea": data["thumbnail_idea"],
        "caption": data["caption"],
        "hashtags": data["hashtags"],
        "viral_score": data["viral_score"],
        "viral_reasoning": data["viral_reasoning"],
        "niche": body.niche,
        "duration": body.duration,
        "language": body.language,
        "tone": body.tone,
        "created_at": datetime.now(tz=timezone.utc),
        "saved": True,  # auto-save every generation
        "scheduled_at": None,
    }
    await db.contents.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return GeneratedContent(**doc)


@api.get("/content/list", response_model=List[GeneratedContent])
async def list_content(user=Depends(get_current_user)):
    cursor = db.contents.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(100)
    items = await cursor.to_list(length=100)
    return [GeneratedContent(**x) for x in items]


@api.get("/content/{content_id}", response_model=GeneratedContent)
async def get_content(content_id: str, user=Depends(get_current_user)):
    doc = await db.contents.find_one({"id": content_id, "user_id": user["id"]}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Content not found")
    return GeneratedContent(**doc)


@api.delete("/content/{content_id}")
async def delete_content(content_id: str, user=Depends(get_current_user)):
    res = await db.contents.delete_one({"id": content_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------------- TTS ----------------
class VoiceoverIn(BaseModel):
    voice: str = "nova"  # alloy / ash / coral / echo / fable / nova / onyx / sage / shimmer
    speed: float = 1.0


class VoiceoverOut(BaseModel):
    id: str
    audio_base64: str
    voice: str
    duration_hint: str


@api.post("/content/{content_id}/voiceover", response_model=VoiceoverOut)
async def generate_voiceover(
    content_id: str, body: VoiceoverIn, user=Depends(get_current_user)
):
    doc = await db.contents.find_one({"id": content_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Content not found")

    from emergentintegrations.llm.openai.text_to_speech import OpenAITextToSpeech

    text = (doc.get("voiceover_text") or doc.get("script") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No voiceover text")
    text = text[:4000]

    tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
    try:
        audio_bytes = await tts.generate_speech(
            text=text, model="tts-1", voice=body.voice, speed=body.speed, response_format="mp3"
        )
    except Exception as e:
        log.exception("TTS failed")
        raise HTTPException(status_code=502, detail=f"TTS failed: {e}")

    # persist mp3 to media dir
    audio_path = MEDIA_DIR / f"{content_id}.mp3"
    audio_path.write_bytes(audio_bytes)

    await db.contents.update_one(
        {"id": content_id},
        {"$set": {"voiceover_voice": body.voice, "voiceover_ready": True}},
    )

    return VoiceoverOut(
        id=content_id,
        audio_base64=base64.b64encode(audio_bytes).decode("utf-8"),
        voice=body.voice,
        duration_hint=doc.get("duration", "30s"),
    )


# ---------------- Video export (FFmpeg) ----------------
class VideoOut(BaseModel):
    id: str
    video_url: str


def _wrap_text(text: str, width: int = 26) -> str:
    """Simple word-wrap for drawtext overlay."""
    import textwrap
    lines: List[str] = []
    for para in text.split("\n"):
        if not para.strip():
            lines.append("")
            continue
        lines.extend(textwrap.wrap(para, width=width) or [""])
    return "\n".join(lines[:16])  # cap ~16 lines


def _escape_drawtext(t: str) -> str:
    """Escape special chars for ffmpeg drawtext filter."""
    return (
        t.replace("\\", "\\\\")
        .replace(":", r"\:")
        .replace("'", r"\\'")
        .replace("%", r"\%")
    )


@api.post("/content/{content_id}/video", response_model=VideoOut)
async def generate_video(content_id: str, user=Depends(get_current_user)):
    doc = await db.contents.find_one({"id": content_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Content not found")

    audio_path = MEDIA_DIR / f"{content_id}.mp3"
    if not audio_path.exists():
        raise HTTPException(
            status_code=400, detail="Generate voiceover first (POST /voiceover)."
        )

    video_path = MEDIA_DIR / f"{content_id}.mp4"
    txt_body_path = MEDIA_DIR / f"{content_id}_body.txt"
    txt_footer_path = MEDIA_DIR / f"{content_id}_footer.txt"
    txt_tag_path = MEDIA_DIR / f"{content_id}_tag.txt"

    # Duration from mp3
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path),
            ],
            capture_output=True, text=True, timeout=15,
        )
        dur = max(3.0, min(90.0, float(r.stdout.strip() or "20")))
    except Exception:
        dur = 20.0

    # Build overlay text: hook + first ~200 chars of body
    caption = (doc.get("caption") or "").strip()
    idea = (doc.get("ideas") or ["Viral Drop"])[0]

    txt_body_path.write_text(_wrap_text(idea or caption[:120], width=22), encoding="utf-8")
    txt_footer_path.write_text(_wrap_text(caption[:100], width=28), encoding="utf-8")
    txt_tag_path.write_text(f"#{(doc.get('niche') or 'AI').replace(' ', '')}", encoding="utf-8")

    vf = (
        f"drawtext=fontfile={FONT_PATH}:textfile={txt_body_path}:"
        f"fontcolor=0xCCFF00:fontsize=72:x=(w-tw)/2:y=(h-th)/2-120:"
        f"box=1:boxcolor=0x0A0A0A@0.4:boxborderw=24:line_spacing=10,"
        f"drawtext=fontfile={FONT_PATH}:textfile={txt_footer_path}:"
        f"fontcolor=white:fontsize=36:x=(w-tw)/2:y=h-th-160:"
        f"box=1:boxcolor=0x161616@0.6:boxborderw=16:line_spacing=6,"
        f"drawtext=fontfile={FONT_PATH}:textfile={txt_tag_path}:"
        f"fontcolor=0xCCFF00:fontsize=42:x=(w-tw)/2:y=180"
    )

    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c=0x0A0A0A:s=1080x1920:d={dur}:r=24",
        "-i", str(audio_path),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-shortest",
        str(video_path),
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        if proc.returncode != 0:
            log.error("ffmpeg failed: %s", (stderr or b"").decode(errors="ignore")[-2000:])
            raise HTTPException(status_code=500, detail="Video render failed")
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Video render timeout")

    await db.contents.update_one(
        {"id": content_id}, {"$set": {"video_ready": True}}
    )
    # url is served via /api/media/{content_id}.mp4
    return VideoOut(id=content_id, video_url=f"/api/media/{content_id}.mp4")


@api.get("/media/{filename}")
async def media(filename: str):
    p = MEDIA_DIR / filename
    if not p.exists():
        raise HTTPException(status_code=404, detail="Not found")
    ct = "audio/mpeg" if filename.endswith(".mp3") else (
        "video/mp4" if filename.endswith(".mp4") else "application/octet-stream"
    )
    return FileResponse(str(p), media_type=ct)


# ---------------- Batch: 10 from 1 idea ----------------
class BatchIn(BaseModel):
    seed_idea: str
    niche: str
    tone: str = "energetic"
    duration: str = "30s"
    language: str = "English"
    count: int = 10


BATCH_SYS = """You are a viral short-form video content strategist.
Given ONE seed idea, produce N distinct video variations, each as a shippable JSON object.
Reply with a SINGLE JSON object: {"variations": [ { ...one video... }, ... ]}.

Each variation has this schema (no markdown, no code fences):
{
  "ideas": ["idea 1", "idea 2", "idea 3"],
  "script": "HOOK: ...\\n\\nBODY: ...\\n\\nCTA: ...",
  "voiceover_text": "voiceover ready-to-record text with natural pauses",
  "thumbnail_idea": "one paragraph describing thumbnail visual",
  "caption": "instagram / youtube caption with 1–3 emojis",
  "hashtags": ["#tag1", "#tag2", ...],   // 12–15 hashtags
  "viral_score": 8,
  "viral_reasoning": "why this scores well"
}

The variations MUST differ meaningfully (angle, hook, format: e.g. list, contrarian, story, POV, myth-buster, tutorial, before/after, etc.).
"""


async def generate_batch_ai(payload: BatchIn) -> List[dict]:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    count = max(2, min(10, payload.count))

    user_msg = f"""Seed idea: {payload.seed_idea}
Niche: {payload.niche}
Tone: {payload.tone}
Duration: {payload.duration}
Language: {payload.language}
Number of variations: {count}

Return ONLY the JSON object with a "variations" array of length {count}."""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"batch-{uuid.uuid4()}",
        system_message=BATCH_SYS,
    ).with_model("openai", "gpt-5.4")

    raw = await chat.send_message(UserMessage(text=user_msg))
    text = raw if isinstance(raw, str) else str(raw)
    text = text.strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        text = m.group(0)
    parsed = json.loads(text)
    variations = parsed.get("variations", [])
    if not isinstance(variations, list) or not variations:
        raise ValueError("No variations returned")
    return variations[:count]


@api.post("/content/batch", response_model=List[GeneratedContent])
async def batch_generate(body: BatchIn, user=Depends(get_current_user)):
    try:
        variations = await generate_batch_ai(body)
    except Exception as e:
        log.exception("Batch generation failed")
        raise HTTPException(status_code=502, detail=f"Batch failed: {e}")

    now = datetime.now(tz=timezone.utc)
    stored: List[dict] = []
    for v in variations:
        cid = str(uuid.uuid4())
        tags = v.get("hashtags", []) or []
        tags = [t if t.startswith("#") else f"#{t.lstrip('#')}" for t in tags if t]
        try:
            score = max(1, min(10, int(v.get("viral_score", 7))))
        except Exception:
            score = 7
        doc = {
            "id": cid,
            "user_id": user["id"],
            "ideas": v.get("ideas") or [body.seed_idea],
            "script": v.get("script", ""),
            "voiceover_text": v.get("voiceover_text", ""),
            "thumbnail_idea": v.get("thumbnail_idea", ""),
            "caption": v.get("caption", ""),
            "hashtags": tags[:15] if len(tags) >= 12 else tags + [f"#viral{i}" for i in range(12 - len(tags))],
            "viral_score": score,
            "viral_reasoning": v.get("viral_reasoning", ""),
            "niche": body.niche,
            "duration": body.duration,
            "language": body.language,
            "tone": body.tone,
            "created_at": now,
            "saved": True,
            "scheduled_at": None,
        }
        stored.append(doc)

    if stored:
        await db.contents.insert_many(stored)

    # strip mongo/user fields for response
    out = []
    for d in stored:
        d.pop("_id", None)
        d.pop("user_id", None)
        out.append(GeneratedContent(**d))
    return out


# ---------------- Schedule ----------------
@api.post("/schedule", response_model=GeneratedContent)
async def schedule(body: ScheduleIn, user=Depends(get_current_user)):
    doc = await db.contents.find_one({"id": body.content_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Content not found")
    await db.contents.update_one(
        {"id": body.content_id},
        {"$set": {"scheduled_at": body.scheduled_at}},
    )
    updated = await db.contents.find_one({"id": body.content_id}, {"_id": 0, "user_id": 0})
    return GeneratedContent(**updated)


@api.get("/schedule/list", response_model=List[GeneratedContent])
async def schedule_list(user=Depends(get_current_user)):
    cursor = db.contents.find(
        {"user_id": user["id"], "scheduled_at": {"$ne": None}},
        {"_id": 0, "user_id": 0},
    ).sort("scheduled_at", 1)
    items = await cursor.to_list(length=200)
    return [GeneratedContent(**x) for x in items]


# ---------------- Streak / Stats ----------------
class StatsOut(BaseModel):
    total_generated: int
    total_scheduled: int
    current_streak: int
    best_streak: int
    week_counts: List[int]  # last 7 days including today


@api.get("/stats", response_model=StatsOut)
async def stats(user=Depends(get_current_user)):
    now = datetime.now(tz=timezone.utc)

    total = await db.contents.count_documents({"user_id": user["id"]})
    scheduled = await db.contents.count_documents(
        {"user_id": user["id"], "scheduled_at": {"$ne": None}}
    )

    # gather distinct days user created content (UTC date)
    docs = await db.contents.find(
        {"user_id": user["id"]}, {"created_at": 1, "_id": 0}
    ).to_list(length=5000)

    day_set = set()
    for d in docs:
        ca = d["created_at"]
        if isinstance(ca, datetime):
            if ca.tzinfo is None:
                ca = ca.replace(tzinfo=timezone.utc)
            day_set.add(ca.astimezone(timezone.utc).date())

    # streaks
    today = now.date()
    cur = 0
    d = today
    while d in day_set:
        cur += 1
        d = d - timedelta(days=1)

    # best streak
    sorted_days = sorted(day_set)
    best = 0
    run = 0
    prev: Optional[date] = None
    for dy in sorted_days:
        if prev is None or (dy - prev).days == 1:
            run += 1
        else:
            run = 1
        best = max(best, run)
        prev = dy

    # last 7 days counts
    week_counts = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date()
        c = sum(1 for x in docs if _to_utc_date(x["created_at"]) == day)
        week_counts.append(c)

    return StatsOut(
        total_generated=total,
        total_scheduled=scheduled,
        current_streak=cur,
        best_streak=best,
        week_counts=week_counts,
    )


def _to_utc_date(dt) -> date:
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).date()
    return date.today()


# ---------------- app wire ----------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    client.close()
