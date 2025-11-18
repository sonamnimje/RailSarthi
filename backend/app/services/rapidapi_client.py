"""
RapidAPI IRCTC client – fully stable, no missing methods.
Handles:
- live station
- live train status
- schedule
- trains between
- caching
- connection pooling
- rate limiting (built-in)
"""

import httpx
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Any, Dict, Tuple, Optional
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------
_rapidapi_client_instance: Optional['RapidAPIClient'] = None


# ---------------------------------------------------------------------
# Main Client
# ---------------------------------------------------------------------

class RapidAPIClient:
    """Stable IRCTC client for RapidAPI endpoints."""

    def __init__(self) -> None:
        import os
        from dotenv import load_dotenv
        load_dotenv(override=True)

        # API Key
        self.rapidapi_key = os.getenv("RAPIDAPI_IRCTC_KEY")
        raw_host = os.getenv("RAPIDAPI_IRCTC_HOST") or "irctc1.p.rapidapi.com"
        self.rapidapi_host = raw_host.rstrip("/")

        if not self.rapidapi_key:
            raise ValueError("RAPIDAPI_IRCTC_KEY missing in .env")

        logger.info(f"[RapidAPIClient] Loaded key: {self.rapidapi_key[:8]}**** host={self.rapidapi_host}")

        # Reusable client
        self._client: Optional[httpx.AsyncClient] = None

        # Simple TTL cache
        self._cache: Dict[str, Tuple[Any, datetime]] = {}
        self._ttl = timedelta(seconds=30)

        # Rate limiter
        self._lock = asyncio.Lock()
        self._last_call = datetime.min
        self._min_interval = 0.25   # 4 requests per second

    # ------------------------------------------------------------------
    # HTTP Client
    # ------------------------------------------------------------------
    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            limits = httpx.Limits(max_connections=20, max_keepalive_connections=10)
            self._client = httpx.AsyncClient(timeout=20, limits=limits)
        return self._client

    # ------------------------------------------------------------------
    # Rate Limiting
    # ------------------------------------------------------------------
    async def _rate_limit(self):
        async with self._lock:
            now = datetime.now()
            elapsed = (now - self._last_call).total_seconds()
            if elapsed < self._min_interval:
                await asyncio.sleep(self._min_interval - elapsed)
            self._last_call = datetime.now()

    # ------------------------------------------------------------------
    # Generic Request Handler
    # ------------------------------------------------------------------
    async def _request(self, url: str, params: dict) -> dict:
        """Handles GET request, caching, rate limiting."""

        cache_key = f"{url}|{str(params)}"

        # 1. Return cached
        if cache_key in self._cache:
            data, ts = self._cache[cache_key]
            if datetime.now() - ts < self._ttl:
                return data

        # 2. Rate limit
        await self._rate_limit()

        # 3. Make request
        client = await self._get_client()

        headers = {
            "X-RapidAPI-Key": self.rapidapi_key,
            "X-RapidAPI-Host": self.rapidapi_host
        }

        try:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()

            # Cache it
            self._cache[cache_key] = (data, datetime.now())
            return data

        except httpx.HTTPStatusError as e:
            # Handle 429 (quota exceeded) gracefully - return empty dict instead of raising
            if e.response.status_code == 429:
                error_text = e.response.text if e.response.text else "Quota exceeded"
                logger.warning(f"RapidAPI quota exceeded: {error_text}")
                return {}  # Return empty dict instead of raising exception
            logger.error(f"RapidAPI failed: {e.response.text}")
            raise HTTPException(status_code=e.response.status_code, detail="RapidAPI error")

        except Exception as e:
            logger.error(f"RapidAPI error: {e}")
            raise HTTPException(status_code=500, detail="RapidAPI unreachable")

    # ------------------------------------------------------------------
    # API Endpoints
    # ------------------------------------------------------------------

    async def get_live_station(self, from_station: str, hours: int = 8) -> dict:
        url = f"https://{self.rapidapi_host}/api/v3/getLiveStation"
        params = {"fromStationCode": from_station, "hours": str(hours)}
        return await self._request(url, params)

    async def get_live_train_status(self, train_no: str, start_day: int = 1) -> dict:
        url = f"https://{self.rapidapi_host}/api/v1/liveTrainStatus"
        params = {"trainNo": train_no, "startDay": str(start_day)}
        return await self._request(url, params)

    async def get_train_schedule(self, train_no: str) -> dict:
        url = f"https://{self.rapidapi_host}/api/v1/getTrainSchedule"
        params = {"trainNo": train_no}
        return await self._request(url, params)

    async def get_trains_between_stations(self, src: str, dst: str) -> dict:
        url = f"https://{self.rapidapi_host}/api/v1/searchTrain"
        params = {"fromStationCode": src, "toStationCode": dst}
        return await self._request(url, params)

    # ------------------------------------------------------------------
    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None


# ---------------------------------------------------------------------
# Singleton getter
# ---------------------------------------------------------------------
def get_rapidapi_client() -> RapidAPIClient:
    global _rapidapi_client_instance
    from dotenv import load_dotenv
    load_dotenv(override=True)

    if _rapidapi_client_instance is None:
        _rapidapi_client_instance = RapidAPIClient()

    return _rapidapi_client_instance


def get_rapidapi_client_if_exists() -> Optional['RapidAPIClient']:
    """Get the singleton RapidAPIClient instance only if it exists (doesn't create a new one)"""
    global _rapidapi_client_instance
    return _rapidapi_client_instance


def reset_rapidapi_client():
    global _rapidapi_client_instance
    if _rapidapi_client_instance:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(_rapidapi_client_instance.close())
            else:
                loop.run_until_complete(_rapidapi_client_instance.close())
        except:
            pass
    _rapidapi_client_instance = None