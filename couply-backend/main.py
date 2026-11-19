"""Couply v1 FastAPI Backend for Render + Supabase PostgreSQL."""
from __future__ import annotations

import hashlib
import html
import os
import re
import secrets
import smtplib
from email.mime.text import MIMEText
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
OTP_FROM_EMAIL = os.getenv("OTP_FROM_EMAIL", "Couply <onboarding@resend.dev>")
GMAIL_SMTP_USER = os.getenv("GMAIL_SMTP_USER", "")
GMAIL_SMTP_APP_PASSWORD = os.getenv("GMAIL_SMTP_APP_PASSWORD", "").replace(" ", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

ph = PasswordHasher()
app = FastAPI(title="Couply v1 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
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


async def dispatch_otp_email(email: str, code: str, purpose: str = "signup") -> None:
    if not RESEND_API_KEY:
        return
    safe_email = html.escape(email)
    safe_code = html.escape(code)
    if purpose == "login":
        subject = "Confirm your Couply sign-in"
        heading = "Confirm it's you<br/>trying to sign in to Couply"
        body = (
            f"Someone just entered your password to step back into Couply as {safe_email}. "
            "Enter this 6-digit code within 10 minutes to continue."
        )
        ignore = "If you're not trying to log in right now, you can safely ignore this email."
    else:
        subject = "Confirm your email address for Couply"
        heading = "Confirm your email address<br/>to begin your story on Couply"
        body = (
            f"Real intimacy begins long after the five-star Friday dinner bill is paid. "
            f"Confirm {safe_email} with this 6-digit code within 10 minutes."
        )
        ignore = "If you didn't request this, you can safely ignore this email."

    html_body = (
        f"<div style='font-family:sans-serif;padding:32px 24px;max-width:540px;color:#1A1113;background:#fff;'>"
        f"<h1 style='font-size:24px;margin:0 0 16px;'>{heading}</h1>"
        f"<p style='font-size:15px;line-height:1.6;'>{body}</p>"
        f"<div style='font-size:30px;font-weight:700;letter-spacing:6px;margin:20px 0;'>{safe_code}</div>"
        f"<p style='font-size:13px;color:#666;'>Expires in 10 minutes. {ignore}</p></div>"
    )

    if GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD and (not RESEND_API_KEY or "onboarding@resend.dev" in OTP_FROM_EMAIL):
        msg = MIMEText(html_body, "html")
        msg["Subject"] = subject
        msg["From"] = f"Couply <{GMAIL_SMTP_USER}>"
        msg["To"] = email
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=8) as server:
            server.login(GMAIL_SMTP_USER, GMAIL_SMTP_APP_PASSWORD)
            server.sendmail(GMAIL_SMTP_USER, [email], msg.as_string())
        return

    if not RESEND_API_KEY:
        return

    async with httpx.AsyncClient(timeout=8.0) as client:
        await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={
                "from": OTP_FROM_EMAIL,
                "to": [email],
                "subject": subject,
                "html": html_body,
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
    country: Optional[str] = ""
    date_of_birth: Optional[str] = None
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
    if (
        len(body.password) < 8
        or not re.search(r"[A-Z]", body.password)
        or not re.search(r"[a-z]", body.password)
        or not re.search(r"[0-9]", body.password)
        or not re.search(r"[^A-Za-z0-9\s]", body.password)
    ):
        raise HTTPException(
            status_code=400,
            detail="Password needs 8+ characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character",
        )
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
            """INSERT INTO users (full_name, username, email, country, date_of_birth, password_hash, gender_theme, is_verified)
               VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE)""",
            (body.full_name, body.username, email, body.country, body.date_of_birth, pw_hash, body.gender_theme),
        )

        code = f"{secrets.randbelow(1_000_000):06d}"
        cur.execute(
            """INSERT INTO otp_codes (email, code_hash, purpose, expires_at)
               VALUES (%s, %s, 'signup', %s)""",
            (email, ph.hash(code), datetime.now(timezone.utc) + timedelta(minutes=10)),
        )
    await dispatch_otp_email(email, code)
    return {"message": "OTP sent", "email": email}


@app.post("/api/auth/login")
async def login(body: LoginBody):
    email = body.email.lower()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, password_hash, is_verified FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="USER_NOT_FOUND")
        if not row[1]:
            raise HTTPException(status_code=400, detail="GOOGLE_ONLY_ACCOUNT")
        try:
            ph.verify(row[1], body.password)
        except VerifyMismatchError as exc:
            raise HTTPException(status_code=401, detail="Incorrect password") from exc

        code = f"{secrets.randbelow(1_000_000):06d}"
        cur.execute(
            """INSERT INTO otp_codes (email, code_hash, purpose, expires_at)
               VALUES (%s, %s, 'login', %s)""",
            (email, ph.hash(code), datetime.now(timezone.utc) + timedelta(minutes=10)),
        )
    await dispatch_otp_email(email, code, "login")
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
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="GOOGLE_CLIENT_ID not configured")
    info = google_id_token.verify_oauth2_token(
        body.id_token, google_requests.Request(), GOOGLE_CLIENT_ID
    )
    if not info.get("email_verified"):
        raise HTTPException(status_code=401, detail="Verified Google email required")
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
