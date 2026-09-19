import time
import logging
import threading
import functools
import inspect
from typing import Dict, List, Optional, Any, Callable
from fastapi import HTTPException, Request, status

from backend.config import settings
from backend.utils.network import get_client_ip

logger = logging.getLogger("smart_attendance.rate_limiter")


def _parse_rate_limit(rate_str: Any) -> tuple[int, int]:
    """
    Parse a rate limit string like '20/minute', '5/second', '100/hour', '10/min',
    or integer into (max_requests, window_seconds).
    """
    if isinstance(rate_str, (int, float)):
        return int(rate_str), 60
    if not isinstance(rate_str, str):
        return 60, 60

    rate_str = rate_str.strip().lower()
    if "/" not in rate_str:
        try:
            return int(rate_str), 60
        except ValueError:
            return 60, 60

    count_str, period_str = rate_str.split("/", 1)
    try:
        max_requests = int(count_str.strip())
    except ValueError:
        max_requests = 60

    period_str = period_str.strip()
    if period_str in ("s", "sec", "second", "seconds"):
        window_seconds = 1
    elif period_str in ("m", "min", "minute", "minutes"):
        window_seconds = 60
    elif period_str in ("h", "hr", "hour", "hours"):
        window_seconds = 3600
    elif period_str in ("d", "day", "days"):
        window_seconds = 86400
    else:
        window_seconds = 60

    return max_requests, window_seconds


def _find_request(args: tuple, kwargs: dict) -> Optional[Any]:
    for arg in args:
        if isinstance(arg, Request) or hasattr(arg, "client") or hasattr(arg, "headers"):
            return arg
    for v in kwargs.values():
        if isinstance(v, Request) or hasattr(v, "client") or hasattr(v, "headers"):
            return v
    return None


class SlidingWindowRateLimiter:
    """
    Thread-safe in-memory sliding window rate limiter.
    Maintains timestamp buckets per key and cleans expired timestamps on-the-fly.
    """
    def __init__(self):
        self._buckets: Dict[str, List[float]] = {}
        self._lock = threading.Lock()

    def is_allowed(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> tuple[bool, int, int]:
        """
        Check if request is allowed under rate limits.
        Returns: (allowed: bool, remaining: int, retry_after_seconds: int)
        """
        if not getattr(settings, "RATE_LIMIT_ENABLED", True):
            return True, max_requests, 0

        now = time.time()
        window_start = now - window_seconds

        with self._lock:
            # Retrieve or initialize timestamps for this key
            timestamps = self._buckets.get(key, [])
            # Evict entries outside the sliding window
            timestamps = [ts for ts in timestamps if ts > window_start]

            if len(timestamps) >= max_requests:
                earliest = timestamps[0]
                retry_after = max(1, int(earliest + window_seconds - now))
                self._buckets[key] = timestamps
                return False, 0, retry_after

            # Record this valid request
            timestamps.append(now)
            self._buckets[key] = timestamps
            remaining = max(0, max_requests - len(timestamps))
            return True, remaining, 0

    def is_blocked(self, key: str, max_requests: int, window_seconds: int) -> tuple[bool, int]:
        """Check if key has already exceeded limit without recording a new request."""
        if not getattr(settings, "RATE_LIMIT_ENABLED", True):
            return False, 0
        now = time.time()
        window_start = now - window_seconds
        with self._lock:
            timestamps = self._buckets.get(key, [])
            timestamps = [ts for ts in timestamps if ts > window_start]
            self._buckets[key] = timestamps
            if len(timestamps) >= max_requests:
                earliest = timestamps[0]
                retry_after = max(1, int(earliest + window_seconds - now))
                return True, retry_after
            return False, 0

    def clear(self):
        """Clear all rate limit buckets (useful for test isolation)."""
        with self._lock:
            self._buckets.clear()

    def limit(self, limit_value: Any = "60/minute", key_func: Optional[Callable] = None, **decorator_kwargs):
        """
        Route decorator providing slowapi-compatible rate limiting:
        @limiter.limit(settings.RATE_LIMIT_INQUIRY)
        or
        @limiter.limit("20/minute")
        """
        max_requests, window_seconds = _parse_rate_limit(limit_value)

        def decorator(func: Callable):
            if inspect.iscoroutinefunction(func):
                @functools.wraps(func)
                async def async_wrapper(*args, **kwargs):
                    req = _find_request(args, kwargs)
                    if req is not None:
                        client_key = key_func(req) if key_func and callable(key_func) else get_client_ip(req)
                        rate_key = f"{func.__name__}:{client_key}"
                        allowed, remaining, retry_after = self.is_allowed(rate_key, max_requests, window_seconds)
                        if not allowed:
                            raise HTTPException(
                                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                                detail=f"Too many requests. Please slow down and try again in {retry_after} seconds.",
                                headers={
                                    "Retry-After": str(retry_after),
                                    "X-RateLimit-Limit": str(max_requests),
                                    "X-RateLimit-Remaining": "0"
                                }
                            )
                    return await func(*args, **kwargs)
                return async_wrapper
            else:
                @functools.wraps(func)
                def sync_wrapper(*args, **kwargs):
                    req = _find_request(args, kwargs)
                    if req is not None:
                        client_key = key_func(req) if key_func and callable(key_func) else get_client_ip(req)
                        rate_key = f"{func.__name__}:{client_key}"
                        allowed, remaining, retry_after = self.is_allowed(rate_key, max_requests, window_seconds)
                        if not allowed:
                            raise HTTPException(
                                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                                detail=f"Too many requests. Please slow down and try again in {retry_after} seconds.",
                                headers={
                                    "Retry-After": str(retry_after),
                                    "X-RateLimit-Limit": str(max_requests),
                                    "X-RateLimit-Remaining": "0"
                                }
                            )
                    return func(*args, **kwargs)
                return sync_wrapper
        return decorator


# Global limiter engine
limiter = SlidingWindowRateLimiter()


class RateLimitDependency:
    """
    FastAPI dependency that enforces rate limits for a specific route.
    Tracks limits using client IP and optional payload identifier (e.g. email).
    """
    def __init__(
        self,
        max_requests: int,
        window_seconds: int,
        prefix: str = "rate",
        extract_account_key: bool = False
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.prefix = prefix
        self.extract_account_key = extract_account_key

    async def __call__(self, request: Request):
        client_ip = get_client_ip(request)
        account_id = ""

        if self.extract_account_key and request.method in ("POST", "PUT"):
            try:
                # Peek at body to extract email or student_id if provided
                body = await request.body()
                if body:
                    import json
                    parsed = json.loads(body.decode("utf-8"))
                    account_id = (parsed.get("email") or parsed.get("student_id") or "").strip().lower()
            except Exception:
                pass

        rate_key = f"{self.prefix}:{client_ip}:{account_id}" if account_id else f"{self.prefix}:{client_ip}"
        allowed, remaining, retry_after = limiter.is_allowed(
            rate_key, self.max_requests, self.window_seconds
        )

        if not allowed:
            logger.warning(
                f"Rate limit exceeded on {request.url.path} for key={rate_key}. Retry-After: {retry_after}s"
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Please slow down and try again in {retry_after} seconds.",
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(self.max_requests),
                    "X-RateLimit-Remaining": "0"
                }
            )


# Predefined rate limiters for critical application routes
login_limiter = RateLimitDependency(max_requests=5, window_seconds=60, prefix="login", extract_account_key=True)
otp_request_limiter = RateLimitDependency(max_requests=3, window_seconds=300, prefix="otp_req", extract_account_key=True)
otp_verify_limiter = RateLimitDependency(max_requests=5, window_seconds=180, prefix="otp_ver", extract_account_key=True)
face_cv_limiter = RateLimitDependency(max_requests=120, window_seconds=60, prefix="face_cv")
admin_invite_limiter = RateLimitDependency(max_requests=10, window_seconds=3600, prefix="admin_invite")
inquiry_limiter = RateLimitDependency(max_requests=20, window_seconds=60, prefix="inquiry")
