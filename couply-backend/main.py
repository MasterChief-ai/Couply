"""Couply v1 FastAPI Backend for Render + Supabase PostgreSQL."""
from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import httpx
import jwt
import psycopg
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, EmailStr

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
OTP_FROM_EMAIL = os.getenv("OTP_FROM_EMAIL", "Couply <noreply@couply.app>")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

ph = PasswordHasher()
app = FastAPI(title="Couply v1 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn():
    return psycopg.connect(DATABASE_URL, autocommit=True)


def hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(user_id: str, session_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": user_id,
            "session_id": session_id,
            "email": email,
            "iat": now,
            "exp": now + timedelta(minutes=15),
        },
        JWT_SECRET,
        algorithm="HS256",
    )


async def dispatch_otp_email(email: str, code: str) -> None:
    if not RESEND_API_KEY:
        return
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={
                "from": OTP_FROM_EMAIL,
                "to": [email],
                "subject": "Your Couply 6-digit code",
                "html": f"<p>Your Couply verification code is <strong>{code}</strong>. Expires in 10 minutes.</p>",
            },
        )


def require_session(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT last_active_at, expires_at, revoked FROM sessions WHERE id = %s",
            (payload["session_id"],),
        )
        row = cur.fetchone()
        if not row or row[2]:
            raise HTTPException(status_code=401, detail="Session revoked")
        now = datetime.now(timezone.utc)
        if (now - row[0]) > timedelta(days=30) or row[1] <= now:
            cur.execute("UPDATE sessions SET revoked = TRUE WHERE id = %s", (payload["session_id"],))
            raise HTTPException(status_code=401, detail="Session expired due to 30 days inactivity")
    return payload


class SignupBody(BaseModel):
    full_name: str
    username: str
    country: str
    email: EmailStr
    password: str
    confirm_password: str
    gender_theme: Literal["female", "male"]
    accepted_terms: bool


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class VerifyOtpBody(BaseModel):
    email: EmailStr
    code: str


class GoogleAuthBody(BaseModel):
    id_token: str
    gender_theme: Literal["female", "male"] = "female"


@app.post("/api/auth/signup")
async def signup(body: SignupBody):
    if body.password != body.confirm_password or not body.accepted_terms:
        raise HTTPException(status_code=400, detail="Passwords must match and Terms must be accepted")
    email = body.email.lower()
    pw_hash = ph.hash(body.password)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, is_verified FROM users WHERE email = %s OR username = %s", (email, body.username))
        existing = cur.fetchone()
        if existing and existing[1]:
            raise HTTPException(status_code=409, detail="Account already exists")
        if existing and not existing[1]:
            cur.execute("DELETE FROM users WHERE id = %s", (existing[0],))

        cur.execute(
            """INSERT INTO users (full_name, username, email, country, password_hash, gender_theme, is_verified)
               VALUES (%s, %s, %s, %s, %s, %s, FALSE)""",
            (body.full_name, body.username, email, body.country, pw_hash, body.gender_theme),
        )

        code = f"{secrets.randbelow(1_000_000):06d}"
        cur.execute(
            """INSERT INTO otp_codes (email, code_hash, purpose, expires_at)
               VALUES (%s, %s, 'signup', %s)""",
            (email, ph.hash(code), datetime.now(timezone.utc) + timedelta(minutes=10)),
        )
    await dispatch_otp_email(email, code)
    return {"message": "OTP sent", "email": email}


@app.post("/api/auth/verify-otp")
def verify_otp(body: VerifyOtpBody):
    email = body.email.lower()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT id, code_hash, attempts, expires_at FROM otp_codes
               WHERE email = %s AND used = FALSE ORDER BY created_at DESC LIMIT 1""",
            (email,),
        )
        row = cur.fetchone()
        if not row or row[3] <= datetime.now(timezone.utc) or row[2] >= 3:
            raise HTTPException(status_code=400, detail="OTP invalid or expired")
        try:
            ph.verify(row[1], body.code)
        except VerifyMismatchError as exc:
            attempts = row[2] + 1
            cur.execute("UPDATE otp_codes SET attempts = %s, used = %s WHERE id = %s", (attempts, attempts >= 3, row[0]))
            raise HTTPException(status_code=400, detail="Incorrect code") from exc

        cur.execute("UPDATE otp_codes SET used = TRUE WHERE id = %s", (row[0],))
        cur.execute("UPDATE users SET is_verified = TRUE, last_seen_at = NOW() WHERE email = %s RETURNING id", (email,))
        user_id = str(cur.fetchone()[0])

        refresh_raw = secrets.token_urlsafe(32)
        cur.execute(
            """INSERT INTO sessions (user_id, refresh_token_hash, expires_at)
               VALUES (%s, %s, %s) RETURNING id""",
            (user_id, hash_refresh(refresh_raw), datetime.now(timezone.utc) + timedelta(days=30)),
        )
        session_id = str(cur.fetchone()[0])

    return {
        "accessToken": create_access_token(user_id, session_id, email),
        "refreshToken": refresh_raw,
    }


@app.post("/api/auth/google")
def google_signin(body: GoogleAuthBody):
    info = google_id_token.verify_oauth2_token(
        body.id_token, google_requests.Request(), GOOGLE_CLIENT_ID
    )
    email = info["email"].lower()
    sub = info["sub"]
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE google_sub = %s OR email = %s", (sub, email))
        row = cur.fetchone()
        if row:
            user_id = str(row[0])
            cur.execute("UPDATE users SET google_sub = %s, is_verified = TRUE WHERE id = %s", (sub, user_id))
        else:
            cur.execute(
                """INSERT INTO users (full_name, username, email, country, google_sub, gender_theme, is_verified)
                   VALUES (%s, %s, %s, 'Unknown', %s, %s, TRUE) RETURNING id""",
                (info.get("name", email.split("@")[0]), email.split("@")[0], email, sub, body.gender_theme),
            )
            user_id = str(cur.fetchone()[0])
        refresh_raw = secrets.token_urlsafe(32)
        cur.execute(
            "INSERT INTO sessions (user_id, refresh_token_hash, expires_at) VALUES (%s, %s, %s) RETURNING id",
            (user_id, hash_refresh(refresh_raw), datetime.now(timezone.utc) + timedelta(days=30)),
        )
        session_id = str(cur.fetchone()[0])
    return {"accessToken": create_access_token(user_id, session_id, email), "refreshToken": refresh_raw}


@app.post("/api/telemetry/heartbeat")
def heartbeat(session=Depends(require_session)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE users SET last_seen_at = NOW() WHERE id = %s", (session["sub"],))
        cur.execute("UPDATE sessions SET last_active_at = NOW() WHERE id = %s", (session["session_id"],))
    return {"ok": True}


@app.get("/api/telemetry/stats")
def stats(session=Depends(require_session)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM users WHERE is_verified = TRUE AND last_seen_at >= NOW() - INTERVAL '2 minutes'")
        online = cur.fetchone()[0]
        cur.execute(
            "SELECT COUNT(DISTINCT user_id) FROM sessions WHERE revoked = FALSE AND last_active_at >= NOW() - INTERVAL '30 days'"
        )
        active_30d = cur.fetchone()[0]
    return {"currentlyOnline": online, "totalActiveUsers": active_30d}
