# Authentication Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure database-backed Bearer authentication with login, current-user, logout, and reusable role checks.

**Architecture:** Passwords are hashed with Argon2 through `pwdlib`. Login issues a cryptographically random opaque token, stores only its SHA-256 digest in PostgreSQL, and returns the raw token once; every protected request resolves that session and reloads the current user and role from the database.

**Tech Stack:** Python 3.14, FastAPI 0.141.1, Pydantic, SQLAlchemy 2.0.52, Alembic 1.19.2, PostgreSQL, `pwdlib[argon2]` 0.3.1, `email-validator` 2.3.0, pytest 9.1.1

**Spec:** `docs/superpowers/specs/2026-09-11-authentication-design.md`

## Global Constraints

- Keep all managed endpoints under `/api/v1` and preserve the envelopes in `docs/API_CONVENTIONS.md`.
- Use JSON for login input and HTTP Bearer authentication for protected endpoints.
- Set `AUTH_TOKEN_TTL_MINUTES` to `60` by default and reject non-positive values.
- Generate tokens from exactly 32 random bytes and persist only lowercase SHA-256 hexadecimal digests.
- Load current user status and role state from the database on every authenticated request.
- Never serialize or log passwords, password hashes, raw session tokens, or token digests.
- Use `.venv\Scripts\python.exe` for every Python command in this Windows workspace.
- Never print or commit the Git-ignored `.env` file or its PostgreSQL credentials.
- Use the repository's synchronous SQLAlchemy session pattern; do not add refresh tokens, JWTs, account CRUD, or resource-specific object authorization in this slice.

## File Structure

| File                                                     | Responsibility                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `app/security.py`                                        | Pure password and token primitives; no HTTP or database access.           |
| `app/models.py`                                          | `AuthSession` persistence model and `User.auth_sessions` relationship.    |
| `migrations/versions/20260911_0003_add_auth_sessions.py` | Reversible PostgreSQL schema change.                                      |
| `app/schemas/auth.py`                                    | Strict login input and safe authentication response models.               |
| `app/services/auth.py`                                   | Credential checks and session issue, lookup, and revocation transactions. |
| `app/api/dependencies/auth.py`                           | Bearer parsing, current identity resolution, and reusable role checks.    |
| `app/api/errors.py`                                      | Consistent public API errors and request-validation envelopes.            |
| `app/api/v1/auth.py`                                     | Login, current-user, and logout HTTP routes.                              |
| `tests/test_security.py`                                 | Password and token primitive tests.                                       |
| `tests/test_models.py`                                   | Authentication-session constraints and metadata tests.                    |
| `tests/test_auth_service.py`                             | Service behavior without HTTP concerns.                                   |
| `tests/test_auth_api.py`                                 | Full authentication contract, failure, role, logout, and OpenAPI tests.   |

---

### Task 1: Security Primitives and Authentication Configuration

**Files:**

- Create: `app/security.py`
- Create: `tests/test_security.py`
- Modify: `app/config.py`
- Modify: `.env.example`
- Modify: `requirements.txt`

**Interfaces:**

- Consumes: `Settings` from `app.config`.
- Produces: `hash_password(password: str) -> str`, `verify_password(password: str, password_hash: str) -> bool`, `verify_dummy_password(password: str) -> None`, `generate_access_token() -> str`, and `digest_access_token(token: str) -> str`.

- [ ] **Step 1: Pin and install the two direct dependencies**

Add these exact lines to `requirements.txt` in alphabetical position:

```text
email-validator==2.3.0
pwdlib[argon2]==0.3.1
```

Run:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pip check
```

Expected: dependency installation exits `0`, followed by `No broken requirements found.`

- [ ] **Step 2: Write failing primitive and settings tests**

Create `tests/test_security.py`:

```python
from hashlib import sha256

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.security import (
    digest_access_token,
    generate_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_is_not_plaintext_and_verifies_correct_password() -> None:
    password_hash = hash_password("correct horse battery staple")

    assert password_hash != "correct horse battery staple"
    assert verify_password("correct horse battery staple", password_hash)
    assert not verify_password("wrong password", password_hash)


def test_access_tokens_are_random_and_digest_to_sha256_hex() -> None:
    first_token = generate_access_token()
    second_token = generate_access_token()

    assert first_token != second_token
    assert digest_access_token(first_token) == sha256(first_token.encode()).hexdigest()
    assert len(digest_access_token(first_token)) == 64


def test_auth_token_lifetime_defaults_to_sixty_minutes() -> None:
    settings = Settings(database_url="postgresql+psycopg://user:pass@localhost/test")

    assert settings.auth_token_ttl_minutes == 60


def test_auth_token_lifetime_must_be_positive() -> None:
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql+psycopg://user:pass@localhost/test",
            auth_token_ttl_minutes=0,
        )
```

- [ ] **Step 3: Run the tests to verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_security.py -q
```

Expected: collection fails because `app.security` does not exist.

- [ ] **Step 4: Add the minimum security and configuration implementation**

Create `app/security.py`:

```python
from hashlib import sha256
from secrets import token_urlsafe

from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

_password_hash = PasswordHash.recommended()
_dummy_hash = _password_hash.hash("dummy-password-used-only-for-timing")


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hash.verify(password, password_hash)
    except UnknownHashError:
        return False


def verify_dummy_password(password: str) -> None:
    _password_hash.verify(password, _dummy_hash)


def generate_access_token() -> str:
    return token_urlsafe(32)


def digest_access_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()
```

Update `app/config.py`:

```python
from pydantic import Field, SecretStr
```

Add this field to `Settings`:

```python
auth_token_ttl_minutes: int = Field(default=60, gt=0)
```

Add this safe value to `.env.example`:

```text
AUTH_TOKEN_TTL_MINUTES=60
```

- [ ] **Step 5: Run focused and regression checks**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_security.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check app\security.py app\config.py tests\test_security.py
.\.venv\Scripts\python.exe -m mypy app\security.py app\config.py tests\test_security.py
```

Expected: every command exits `0`.

- [ ] **Step 6: Commit the focused change locally**

```powershell
git add -- requirements.txt .env.example app/config.py app/security.py tests/test_security.py
git diff --cached --check
git commit -m "feat: add authentication security primitives"
```

### Task 2: Authentication Session Model and Migration

**Files:**

- Modify: `app/models.py`
- Modify: `tests/test_models.py`
- Create: `migrations/versions/20260911_0003_add_auth_sessions.py`

**Interfaces:**

- Consumes: `BigIntPrimaryKeyMixin`, `TimestampMixin`, and `User` from `app.models`.
- Produces: `AuthSession` with `user`, `token_hash`, `expires_at`, and `revoked_at`, plus `User.auth_sessions`.

- [ ] **Step 1: Write failing model tests**

Update the metadata test name and expectation in `tests/test_models.py`:

```python
def test_metadata_contains_the_domain_and_authentication_tables() -> None:
    assert set(Base.metadata.tables) == {
        "academic_terms",
        "auth_sessions",
        "course_offerings",
        "courses",
        "enrollments",
        "grades",
        "programs",
        "roles",
        "students",
        "users",
    }
```

Import `datetime`, `timedelta`, `timezone`, and `AuthSession`, then add:

```python
def test_auth_session_is_generated_and_linked_to_user(db_session: Session) -> None:
    auth_session = AuthSession(
        user_id=1,
        token_hash="a" * 64,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )

    db_session.add(auth_session)
    db_session.commit()

    assert auth_session.id > 0
    assert auth_session.user.id == 1


def test_auth_session_token_hash_is_unique(db_session: Session) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db_session.add_all(
        [
            AuthSession(user_id=1, token_hash="b" * 64, expires_at=expires_at),
            AuthSession(user_id=1, token_hash="b" * 64, expires_at=expires_at),
        ]
    )

    with pytest.raises(IntegrityError):
        db_session.commit()


@pytest.mark.parametrize(
    "token_hash",
    [
        pytest.param("A" * 64, id="uppercase"),
        pytest.param("g" * 64, id="non-hexadecimal"),
        pytest.param("a" * 63, id="wrong-length"),
    ],
)
def test_auth_session_rejects_invalid_token_hash(token_hash: str) -> None:
    with pytest.raises(ValueError):
        AuthSession(
            user_id=1,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc),
        )
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_models.py -q
```

Expected: collection fails because `AuthSession` is not defined.

- [ ] **Step 3: Add the SQLAlchemy model**

Add `Integer` to the SQLAlchemy imports and make the primary-key mixin portable for existing
SQLite tests while preserving PostgreSQL bigint output:

```python
class BigIntPrimaryKeyMixin:
    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        Identity(),
        primary_key=True,
    )
```

Add this relationship to `User`:

```python
auth_sessions: Mapped[list[AuthSession]] = relationship(
    back_populates="user",
    passive_deletes=True,
)
```

Import `re` and SQLAlchemy's `validates`, then add the model after `User`:

```python
class AuthSession(BigIntPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "auth_sessions"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="auth_sessions")

    @validates("token_hash")
    def validate_token_hash(self, _: str, token_hash: str) -> str:
        if re.fullmatch(r"[0-9a-f]{64}", token_hash) is None:
            raise ValueError("token_hash must be exactly 64 lowercase hexadecimal characters")
        return token_hash

    __table_args__ = (
        CheckConstraint("length(token_hash) = 64", name="ck_auth_sessions_token_hash_length"),
        CheckConstraint(
            "token_hash ~ '^[0-9a-f]{64}$'",
            name="ck_auth_sessions_token_hash_format",
        ).ddl_if(dialect="postgresql"),
        Index("uq_auth_sessions_token_hash", token_hash, unique=True),
    )
```

- [ ] **Step 4: Create the reversible migration**

Create `migrations/versions/20260911_0003_add_auth_sessions.py`:

```python
"""Add database-backed authentication sessions.

Revision ID: 20260911_0003
Revises: 20260909_0002
Create Date: 2026-09-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260911_0003"
down_revision: str | None = "20260909_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "auth_sessions",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "length(token_hash) = 64",
            name="ck_auth_sessions_token_hash_length",
        ),
        sa.CheckConstraint(
            "token_hash ~ '^[0-9a-f]{64}$'",
            name="ck_auth_sessions_token_hash_format",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_auth_sessions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_sessions")),
    )
    op.create_index(
        op.f("ix_auth_sessions_expires_at"),
        "auth_sessions",
        ["expires_at"],
    )
    op.create_index(
        op.f("ix_auth_sessions_user_id"),
        "auth_sessions",
        ["user_id"],
    )
    op.create_index(
        "uq_auth_sessions_token_hash",
        "auth_sessions",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table("auth_sessions")
```

- [ ] **Step 5: Run model and migration checks**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_models.py -q
.\.venv\Scripts\python.exe -m alembic upgrade head --sql
.\.venv\Scripts\python.exe -m alembic downgrade head:20260909_0002 --sql
.\.venv\Scripts\python.exe -m ruff check app\models.py tests\test_models.py migrations\versions\20260911_0003_add_auth_sessions.py
.\.venv\Scripts\python.exe -m mypy app\models.py tests\test_models.py
```

Expected: tests pass, both offline migration directions compile, and static checks exit `0`.

- [ ] **Step 6: Commit the model and migration locally**

```powershell
git add -- app/models.py tests/test_models.py migrations/versions/20260911_0003_add_auth_sessions.py
git diff --cached --check
git commit -m "feat: persist revocable authentication sessions"
```

### Task 3: Authentication Service

**Files:**

- Create: `app/services/__init__.py`
- Create: `app/services/auth.py`
- Create: `tests/test_auth_service.py`

**Interfaces:**

- Consumes: `User`, `UserStatus`, and `AuthSession` from `app.models`; token primitives from `app.security`; SQLAlchemy `Session`.
- Produces: `IssuedToken`, `AuthenticatedSession`, `authenticate_user`, `issue_auth_session`, `resolve_auth_session`, and `revoke_auth_session`.

- [ ] **Step 1: Write failing service tests**

Create `tests/test_auth_service.py`:

```python
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AuthSession, Role, User, UserStatus
from app.security import digest_access_token, hash_password
from app.services.auth import (
    authenticate_user,
    issue_auth_session,
    resolve_auth_session,
    revoke_auth_session,
)


@pytest.fixture
def db_session() -> Iterator[Session]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        session.add(Role(id=1, code="ADMINISTRATOR", name="Administrator"))
        session.add(
            User(
                id=1,
                role_id=1,
                name="Test Administrator",
                email="admin@example.test",
                password_hash=hash_password("valid-password"),
            )
        )
        session.commit()
        yield session
    engine.dispose()


def test_authenticate_user_accepts_normalized_email_and_correct_password(
    db_session: Session,
) -> None:
    user = authenticate_user(db_session, "  ADMIN@EXAMPLE.TEST ", "valid-password")

    assert user is not None
    assert user.email == "admin@example.test"


@pytest.mark.parametrize(
    "email,password",
    [
        ("missing@example.test", "valid-password"),
        ("admin@example.test", "wrong-password"),
    ],
)
def test_authenticate_user_rejects_invalid_credentials(
    db_session: Session,
    email: str,
    password: str,
) -> None:
    assert authenticate_user(db_session, email, password) is None


def test_issue_auth_session_stores_only_the_digest(db_session: Session) -> None:
    user = db_session.get(User, 1)
    assert user is not None

    issued = issue_auth_session(db_session, user, ttl_minutes=60)
    stored = db_session.scalar(select(AuthSession))

    assert stored is not None
    assert stored.token_hash == digest_access_token(issued.access_token)
    assert issued.access_token not in stored.token_hash
    stored_expires_at = stored.expires_at
    if stored_expires_at.tzinfo is None:
        stored_expires_at = stored_expires_at.replace(tzinfo=timezone.utc)
    assert issued.expires_at == stored_expires_at


@pytest.mark.parametrize("user_status", [UserStatus.INACTIVE, UserStatus.LOCKED])
def test_authenticate_user_rejects_unavailable_account(
    db_session: Session,
    user_status: UserStatus,
) -> None:
    user = db_session.get(User, 1)
    assert user is not None
    user.status = user_status
    db_session.commit()

    assert authenticate_user(db_session, user.email, "valid-password") is None


def test_authenticate_user_rejects_inactive_role(db_session: Session) -> None:
    role = db_session.get(Role, 1)
    assert role is not None
    role.is_active = False
    db_session.commit()

    assert authenticate_user(db_session, "admin@example.test", "valid-password") is None


def test_authenticate_user_rejects_unknown_role(db_session: Session) -> None:
    role = db_session.get(Role, 1)
    assert role is not None
    role.code = "UNKNOWN"
    db_session.commit()

    assert authenticate_user(db_session, "admin@example.test", "valid-password") is None


def test_resolve_auth_session_returns_current_database_identity(
    db_session: Session,
) -> None:
    user = db_session.get(User, 1)
    assert user is not None
    issued = issue_auth_session(db_session, user, ttl_minutes=60)

    authenticated = resolve_auth_session(db_session, issued.access_token)

    assert authenticated is not None
    assert authenticated.user.id == user.id
    assert authenticated.user.role.code == "ADMINISTRATOR"


def test_resolve_auth_session_rejects_revoked_session(db_session: Session) -> None:
    user = db_session.get(User, 1)
    assert user is not None
    issued = issue_auth_session(db_session, user, ttl_minutes=60)
    authenticated = resolve_auth_session(db_session, issued.access_token)
    assert authenticated is not None

    revoke_auth_session(db_session, authenticated.auth_session)

    assert resolve_auth_session(db_session, issued.access_token) is None


def test_resolve_auth_session_rejects_expired_session(db_session: Session) -> None:
    token = "expired-token"
    db_session.add(
        AuthSession(
            user_id=1,
            token_hash=digest_access_token(token),
            expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        )
    )
    db_session.commit()

    assert resolve_auth_session(db_session, token) is None
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_auth_service.py -q
```

Expected: collection fails because `app.services.auth` does not exist.

- [ ] **Step 3: Implement the service boundary**

Create an empty `app/services/__init__.py` and create `app/services/auth.py` with these public
types and signatures:

```python
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import AuthSession, User, UserStatus
from app.security import (
    digest_access_token,
    generate_access_token,
    verify_dummy_password,
    verify_password,
)

REQUIRED_ROLE_CODES = frozenset({"ADMINISTRATOR", "STAFF", "INSTRUCTOR", "STUDENT"})


@dataclass(frozen=True)
class IssuedToken:
    access_token: str
    expires_at: datetime


@dataclass(frozen=True)
class AuthenticatedSession:
    user: User
    auth_session: AuthSession


def _is_active_identity(user: User) -> bool:
    return (
        user.status == UserStatus.ACTIVE
        and user.role.is_active
        and user.role.code in REQUIRED_ROLE_CODES
    )


def authenticate_user(session: Session, email: str, password: str) -> User | None:
    normalized_email = email.strip().lower()
    user = session.scalar(
        select(User)
        .options(joinedload(User.role))
        .where(func.lower(User.email) == normalized_email)
    )
    if user is None:
        verify_dummy_password(password)
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user if _is_active_identity(user) else None


def issue_auth_session(session: Session, user: User, ttl_minutes: int) -> IssuedToken:
    now = datetime.now(timezone.utc)
    access_token = generate_access_token()
    expires_at = now + timedelta(minutes=ttl_minutes)
    session.add(
        AuthSession(
            user_id=user.id,
            token_hash=digest_access_token(access_token),
            expires_at=expires_at,
        )
    )
    session.commit()
    return IssuedToken(access_token=access_token, expires_at=expires_at)


def resolve_auth_session(
    session: Session,
    access_token: str,
    *,
    now: datetime | None = None,
) -> AuthenticatedSession | None:
    checked_at = now or datetime.now(timezone.utc)
    auth_session = session.scalar(
        select(AuthSession)
        .options(joinedload(AuthSession.user).joinedload(User.role))
        .where(
            AuthSession.token_hash == digest_access_token(access_token),
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > checked_at,
        )
    )
    if auth_session is None or not _is_active_identity(auth_session.user):
        return None
    return AuthenticatedSession(user=auth_session.user, auth_session=auth_session)


def revoke_auth_session(
    session: Session,
    auth_session: AuthSession,
    *,
    now: datetime | None = None,
) -> None:
    auth_session.revoked_at = now or datetime.now(timezone.utc)
    session.commit()
```

If SQLite returns naive datetimes after commit, normalize only at the test boundary or configure
the fixture consistently; do not remove timezone-aware PostgreSQL columns or UTC creation.

- [ ] **Step 4: Run service and regression checks**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_auth_service.py -q
.\.venv\Scripts\python.exe -m pytest tests\test_security.py tests\test_models.py tests\test_auth_service.py -q
.\.venv\Scripts\python.exe -m ruff check app\services app\security.py tests\test_auth_service.py
.\.venv\Scripts\python.exe -m mypy app\services app\security.py tests\test_auth_service.py
```

Expected: every command exits `0`.

- [ ] **Step 5: Commit the service locally**

```powershell
git add -- app/services/__init__.py app/services/auth.py tests/test_auth_service.py
git diff --cached --check
git commit -m "feat: add authentication session service"
```

### Task 4: Authentication HTTP Contract and Role Dependencies

**Files:**

- Create: `app/schemas/__init__.py`
- Create: `app/schemas/auth.py`
- Create: `app/api/dependencies/__init__.py`
- Create: `app/api/dependencies/auth.py`
- Create: `app/api/errors.py`
- Create: `app/api/v1/auth.py`
- Create: `tests/test_auth_api.py`
- Modify: `app/api/v1/router.py`
- Modify: `app/main.py`

**Interfaces:**

- Consumes: Task 3 service functions, `get_db_session`, `get_settings`, and FastAPI HTTP Bearer credentials.
- Produces: the three `/api/v1/auth` endpoints, `get_authenticated_session`, `get_current_user`, `require_roles(*role_codes)`, and registered error handlers.

- [ ] **Step 1: Write failing authentication API tests**

Create `tests/test_auth_api.py`:

```python
from collections.abc import AsyncIterator, Iterator
from datetime import datetime, timedelta, timezone

import pytest
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.dependencies.auth import require_roles
from app.api.errors import APIError
from app.database import Base, get_db_session
from app.main import app
from app.models import AuthSession, Role, User, UserStatus
from app.security import digest_access_token, hash_password


@pytest.fixture
def session_factory() -> Iterator[sessionmaker[Session]]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(engine)
    with factory() as session:
        session.add_all(
            [
                Role(id=1, code="ADMINISTRATOR", name="Administrator"),
                Role(id=2, code="STUDENT", name="Student"),
            ]
        )
        session.add_all(
            [
                User(
                    id=1,
                    role_id=1,
                    name="Test Administrator",
                    email="admin@example.test",
                    password_hash=hash_password("valid-password"),
                ),
                User(
                    id=2,
                    role_id=2,
                    name="Test Student",
                    email="student@example.test",
                    password_hash=hash_password("student-password"),
                ),
            ]
        )
        session.commit()

    def override_session() -> Iterator[Session]:
        with factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_session
    app.openapi_schema = None
    try:
        yield factory
    finally:
        app.dependency_overrides.clear()
        app.openapi_schema = None
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
async def client(
    session_factory: sessionmaker[Session],
) -> AsyncIterator[AsyncClient]:
    del session_factory
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as value:
        yield value


async def login(client: AsyncClient, email: str, password: str) -> str:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return str(response.json()["data"]["access_token"])


@pytest.mark.anyio
async def test_login_returns_bearer_token_for_valid_credentials(
    client: AsyncClient,
    session_factory: sessionmaker[Session],
) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": " ADMIN@EXAMPLE.TEST ", "password": "valid-password"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["message"] == "Login successful."
    assert body["data"]["token_type"] == "bearer"
    access_token = str(body["data"]["access_token"])
    with session_factory() as session:
        stored = session.scalar(select(AuthSession))
        assert stored is not None
        assert stored.token_hash == digest_access_token(access_token)
        assert access_token not in stored.token_hash


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("email", "password"),
    [
        ("missing@example.test", "valid-password"),
        ("admin@example.test", "wrong-password"),
    ],
)
async def test_login_uses_same_error_for_invalid_credentials(
    client: AsyncClient,
    email: str,
    password: str,
) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json() == {
        "success": False,
        "message": "Invalid email or password.",
        "errors": None,
    }


@pytest.mark.anyio
@pytest.mark.parametrize("user_status", [UserStatus.INACTIVE, UserStatus.LOCKED])
async def test_login_rejects_unavailable_account(
    client: AsyncClient,
    session_factory: sessionmaker[Session],
    user_status: UserStatus,
) -> None:
    with session_factory() as session:
        user = session.get(User, 1)
        assert user is not None
        user.status = user_status
        session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.test", "password": "valid-password"},
    )

    assert response.status_code == 401
    assert response.json()["message"] == "Invalid email or password."


@pytest.mark.anyio
async def test_login_rejects_inactive_role(
    client: AsyncClient,
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as session:
        role = session.get(Role, 1)
        assert role is not None
        role.is_active = False
        session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.test", "password": "valid-password"},
    )

    assert response.status_code == 401


@pytest.mark.anyio
async def test_login_validation_uses_shared_error_envelope(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "not-an-email", "password": "valid-password", "extra": True},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["message"] == "Validation failed."
    assert "email" in body["errors"]
    assert "extra" in body["errors"]


@pytest.mark.anyio
async def test_login_rejects_malformed_json(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        content=b'{"email":',
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 400
    assert response.json() == {
        "success": False,
        "message": "Malformed JSON.",
        "errors": None,
    }


@pytest.mark.anyio
@pytest.mark.parametrize(
    "authorization",
    [None, "Basic abc123", "Bearer unknown-token"],
)
async def test_me_rejects_invalid_authentication(
    client: AsyncClient,
    authorization: str | None,
) -> None:
    headers = {"Authorization": authorization} if authorization else None

    response = await client.get("/api/v1/auth/me", headers=headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["errors"] is None


@pytest.mark.anyio
async def test_me_returns_safe_current_user(client: AsyncClient) -> None:
    token = await login(client, "admin@example.test", "valid-password")

    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == {
        "id": 1,
        "name": "Test Administrator",
        "email": "admin@example.test",
        "status": "ACTIVE",
        "role": {"code": "ADMINISTRATOR", "name": "Administrator"},
    }
    assert "password_hash" not in response.text
    assert "token_hash" not in response.text


@pytest.mark.anyio
async def test_expired_token_is_rejected(
    client: AsyncClient,
    session_factory: sessionmaker[Session],
) -> None:
    token = await login(client, "admin@example.test", "valid-password")
    with session_factory() as session:
        stored = session.scalar(select(AuthSession))
        assert stored is not None
        stored.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        session.commit()

    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


@pytest.mark.anyio
async def test_logout_revokes_token(client: AsyncClient) -> None:
    token = await login(client, "admin@example.test", "valid-password")
    headers = {"Authorization": f"Bearer {token}"}

    logout = await client.post("/api/v1/auth/logout", headers=headers)
    reused = await client.get("/api/v1/auth/me", headers=headers)

    assert logout.status_code == 204
    assert logout.content == b""
    assert reused.status_code == 401


def test_require_roles_allows_matching_role_and_rejects_other_role(
    session_factory: sessionmaker[Session],
) -> None:
    administrator_only = require_roles("ADMINISTRATOR")
    with session_factory() as session:
        administrator = session.get(User, 1)
        student = session.get(User, 2)
        assert administrator is not None
        assert student is not None
        assert administrator_only(administrator) is administrator
        with pytest.raises(APIError) as exc_info:
            administrator_only(student)
    assert exc_info.value.status_code == 403


@pytest.mark.anyio
async def test_openapi_documents_authentication_contract(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")

    assert response.status_code == 200
    document = response.json()
    paths = document["paths"]
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/auth/me" in paths
    assert "/api/v1/auth/logout" in paths
    assert "HTTPBearer" in document["components"]["securitySchemes"]
    assert "401" in paths["/api/v1/auth/me"]["get"]["responses"]
    assert "422" in paths["/api/v1/auth/login"]["post"]["responses"]
```

- [ ] **Step 2: Run API tests to verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_auth_api.py -q
```

Expected: requests return `404` because the authentication router does not exist.

- [ ] **Step 3: Add strict public schemas**

Create an empty `app/schemas/__init__.py` and create `app/schemas/auth.py` with strict
`ConfigDict(extra="forbid")` request models and these public shapes:

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import UserStatus


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value


class TokenData(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime


class LoginResponse(BaseModel):
    success: Literal[True] = True
    message: str
    data: TokenData


class RoleSummary(BaseModel):
    code: str
    name: str


class CurrentUserData(BaseModel):
    id: int
    name: str
    email: EmailStr
    status: UserStatus
    role: RoleSummary


class CurrentUserResponse(BaseModel):
    success: Literal[True] = True
    message: str
    data: CurrentUserData


class ErrorResponse(BaseModel):
    success: Literal[False] = False
    message: str
    errors: dict[str, list[str]] | None = None
```

- [ ] **Step 4: Add shared API error handling**

Create `app/api/errors.py` with:

```python
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class APIError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        errors: dict[str, list[str]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self.message = message
        self.errors = errors
        self.headers = headers


async def api_error_handler(_request: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "message": exc.message, "errors": exc.errors},
        headers=exc.headers,
    )


def _field_name(location: tuple[str | int, ...]) -> str:
    parts = [str(part) for part in location if part not in {"body", "query", "path"}]
    return ".".join(parts) or "request"


async def validation_error_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    malformed_json = any(error["type"] == "json_invalid" for error in exc.errors())
    if malformed_json:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "Malformed JSON.", "errors": None},
        )

    errors: dict[str, list[str]] = {}
    for error in exc.errors():
        field = _field_name(tuple(error["loc"]))
        errors.setdefault(field, []).append(str(error["msg"]))
    return JSONResponse(
        status_code=422,
        content={"success": False, "message": "Validation failed.", "errors": errors},
    )


def register_error_handlers(application: FastAPI) -> None:
    application.add_exception_handler(APIError, api_error_handler)  # type: ignore[arg-type]
    application.add_exception_handler(
        RequestValidationError,
        validation_error_handler,  # type: ignore[arg-type]
    )
```

Remove an individual `type: ignore` if the installed FastAPI annotations accept the handler;
retain only ignores proven necessary by the required strict mypy command.

Call `register_error_handlers(application)` in `create_app()` before including the API router.

- [ ] **Step 5: Add Bearer and role dependencies**

Create an empty `app/api/dependencies/__init__.py` and create
`app/api/dependencies/auth.py`:

```python
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.errors import APIError
from app.database import get_db_session
from app.models import User
from app.services.auth import AuthenticatedSession, resolve_auth_session

bearer_scheme = HTTPBearer(auto_error=False)


def get_authenticated_session(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[Session, Depends(get_db_session)],
) -> AuthenticatedSession:
    authenticated = (
        resolve_auth_session(session, credentials.credentials)
        if credentials is not None and credentials.scheme.lower() == "bearer"
        else None
    )
    if authenticated is None:
        raise APIError(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid authentication credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return authenticated


def get_current_user(
    authenticated: Annotated[AuthenticatedSession, Depends(get_authenticated_session)],
) -> User:
    return authenticated.user


def require_roles(*role_codes: str) -> Callable[..., User]:
    allowed = frozenset(role_codes)

    def dependency(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role.code not in allowed:
            raise APIError(
                status.HTTP_403_FORBIDDEN, "You do not have permission to perform this action."
            )
        return current_user

    return dependency
```

Format the long `APIError` expression with Ruff before committing.

- [ ] **Step 6: Add and register the authentication router**

Create `app/api/v1/auth.py` using `APIRouter(prefix="/auth", tags=["Authentication"])`.
Implement:

```python
@router.post(
    "/login",
    response_model=LoginResponse,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def login(
    payload: LoginRequest,
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> LoginResponse:
    user = authenticate_user(session, str(payload.email), payload.password)
    if user is None:
        raise APIError(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    issued = issue_auth_session(session, user, settings.auth_token_ttl_minutes)
    return LoginResponse(
        message="Login successful.",
        data=TokenData(access_token=issued.access_token, expires_at=issued.expires_at),
    )


@router.get(
    "/me",
    response_model=CurrentUserResponse,
    responses={401: {"model": ErrorResponse}},
)
def get_me(current_user: Annotated[User, Depends(get_current_user)]) -> CurrentUserResponse:
    return CurrentUserResponse(
        message="Current user retrieved successfully.",
        data=CurrentUserData(
            id=current_user.id,
            name=current_user.name,
            email=current_user.email,
            status=current_user.status,
            role=RoleSummary(code=current_user.role.code, name=current_user.role.name),
        ),
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={401: {"model": ErrorResponse}},
)
def logout(
    authenticated: Annotated[AuthenticatedSession, Depends(get_authenticated_session)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    revoke_auth_session(session, authenticated.auth_session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

Add all imports explicitly. Include the router in `app/api/v1/router.py` before the health
router:

```python
from app.api.v1.auth import router as auth_router

router.include_router(auth_router)
```

- [ ] **Step 7: Run API tests and correct only observed contract defects**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_auth_api.py -q
```

Expected: all authentication API, authorization dependency, validation, and OpenAPI cases pass.

- [ ] **Step 8: Run focused static and regression checks**

Run:

```powershell
.\.venv\Scripts\python.exe -m ruff format app tests
.\.venv\Scripts\python.exe -m ruff check app tests
.\.venv\Scripts\python.exe -m mypy app tests
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: every command exits `0`; no existing health or integrity test regresses.

- [ ] **Step 9: Commit the HTTP contract locally**

```powershell
git add -- app/schemas app/api/dependencies app/api/errors.py app/api/v1/auth.py app/api/v1/router.py app/main.py tests/test_auth_api.py
git diff --cached --check
git commit -m "feat: expose authentication API"
```

### Task 5: PostgreSQL Verification and Living Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/IMPLEMENTATION_DECISIONS.md`
- Modify: `docs/DATA_MODEL.md`
- Modify: `docs/DEVELOPMENT_PLAN.md`
- Review: `docs/API_CONVENTIONS.md`
- Review: `docs/AUTHORIZATION_RULES.md`

**Interfaces:**

- Consumes: the completed authentication routes, configuration, model, migration, tests, and generated OpenAPI.
- Produces: verified setup/use instructions and durable documentation of the authentication decision and remaining authorization scope.

- [ ] **Step 1: Apply and inspect the migration against the configured PostgreSQL database**

Run without printing `.env`:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
```

Expected: upgrade exits `0`, and current revision is `20260911_0003 (head)`.

- [ ] **Step 2: Confirm generated OpenAPI and the authentication contract**

Run the focused OpenAPI test:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_auth_api.py -k openapi -q
```

Expected: the test proves `/api/v1/auth/login`, `/api/v1/auth/me`, and
`/api/v1/auth/logout` are documented with the HTTP Bearer security scheme and declared error
responses.

- [ ] **Step 3: Update durable project documentation**

Make these exact truth updates:

- In `docs/IMPLEMENTATION_DECISIONS.md`, add Decision 005 recording Argon2 password hashing,
  60-minute opaque database-backed sessions, SHA-256 token-digest storage, immediate logout,
  current database identity checks, and the absence of a signing secret.
- In `docs/DATA_MODEL.md`, add `auth_sessions` to the entity table and ERD, document its
  many-to-one relationship with users, and change references from nine tables to nine domain
  tables plus one authentication table.
- In `docs/DEVELOPMENT_PLAN.md`, state that the authentication foundation is implemented while
  domain-route role and object-level enforcement remains part of Phases 3 and 4. Do not mark
  all Phase 2 authorization complete before those routes and tests exist.
- In `README.md`, add `AUTH_TOKEN_TTL_MINUTES=60`, document JSON login, Bearer use,
  `/auth/me`, and logout, and retain only commands verified during this task.
- Review `docs/API_CONVENTIONS.md` and `docs/AUTHORIZATION_RULES.md`; edit only if the
  implemented observable behavior differs from their accepted wording.

- [ ] **Step 4: Run the complete repository quality gate**

Run exactly:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app tests
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m pip check
```

Expected: every command exits `0`, all tests pass, formatting is unchanged, the database is at
`20260911_0003 (head)`, and dependencies are consistent.

- [ ] **Step 5: Review the complete authentication diff for sensitive output and scope**

Run:

```powershell
git diff --check
git status --short
rg -n "password_hash|token_hash|access_token" app tests docs README.md
```

Inspect every match and confirm production response schemas contain only `access_token` on the
successful login response, never `password_hash` or `token_hash`. Confirm `.env` is absent from
`git status` and no refresh-token, JWT, account CRUD, or domain-resource code entered the diff.

- [ ] **Step 6: Commit verified documentation locally**

```powershell
git add -- README.md docs/IMPLEMENTATION_DECISIONS.md docs/DATA_MODEL.md docs/DEVELOPMENT_PLAN.md docs/API_CONVENTIONS.md docs/AUTHORIZATION_RULES.md
git diff --cached --check
git commit -m "docs: document authentication foundation"
```

Stage `docs/API_CONVENTIONS.md` or `docs/AUTHORIZATION_RULES.md` only if Step 3 actually changed
them. Do not stage `.env`.

## Completion Checklist

- [ ] All new production behavior was preceded by a failing focused test.
- [ ] Login, current-user, logout, token revocation, role checks, and error envelopes match the spec.
- [ ] PostgreSQL is at migration `20260911_0003` without exposing its credentials.
- [ ] The complete pytest, Ruff, formatting, mypy, Alembic, and dependency checks pass freshly.
- [ ] Documentation distinguishes completed authentication from authorization still awaiting domain routes.
- [ ] No sensitive credential, hash, database exception, or stack trace appears in public responses or tracked files.
