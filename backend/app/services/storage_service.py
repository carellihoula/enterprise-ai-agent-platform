"""Object storage abstraction supporting local disk and S3-compatible buckets (MinIO / AWS S3)."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Protocol

from app.core.config import get_settings
from app.core.errors import DomainError

logger = logging.getLogger(__name__)


class StorageBackend(Protocol):
    """Protocol defining binary object storage operations for attachments."""

    def put_bytes(self, key: str, data: bytes, content_type: str) -> str:
        """Stores raw bytes under the given object key.

        Args:
            key (str): Logical object key (e.g., ``attachments/<uuid>.png``).
            data (bytes): Raw binary payload to persist.
            content_type (str): Validated MIME type of the payload.

        Returns:
            str: Stored object key.
        """
        ...

    def get_bytes(self, key: str) -> bytes | None:
        """Retrieves raw bytes for a stored object key.

        Args:
            key (str): Logical object key.

        Returns:
            bytes | None: Object payload bytes, or ``None`` if the object does not exist.
        """
        ...

    def delete(self, key: str) -> None:
        """Deletes a stored object if it exists.

        Args:
            key (str): Logical object key to remove.
        """
        ...

    def generate_presigned_url(self, key: str, expires_in: int = 900) -> str | None:
        """Generates a temporary download URL when supported by the backend.

        Args:
            key (str): Logical object key.
            expires_in (int, optional): URL validity duration in seconds. Defaults to 900.

        Returns:
            str | None: Presigned URL string, or ``None`` if unsupported.
        """
        ...


def get_upload_dir() -> Path:
    """Returns and ensures the local directory used to store binary chat attachments.

    Returns:
        Path: Absolute path to the local attachments upload directory.
    """
    override = os.environ.get("CHAT_UPLOADS_DIR")
    upload_dir = Path(override) if override else Path(__file__).resolve().parents[2] / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


class LocalStorageBackend:
    """Filesystem-backed storage implementation for local development without MinIO."""

    def __init__(self, base_dir: Path | None = None) -> None:
        """Initializes local disk storage rooted at ``base_dir``.

        Args:
            base_dir (Path | None, optional): Optional override directory. Defaults to None.
        """
        self._base_dir = base_dir or get_upload_dir()

    def _resolve_path(self, key: str) -> Path:
        """Resolves an object key safely within the upload directory.

        Args:
            key (str): Logical object key or legacy filename.

        Returns:
            Path: Resolved filesystem path inside ``self._base_dir``.
        """
        # [Security] Strip directory traversal segments while supporting both legacy flat names and prefixed keys
        safe_name = Path(key).name
        return self._base_dir / safe_name

    def put_bytes(self, key: str, data: bytes, content_type: str) -> str:
        """Writes binary bytes to local disk.

        Args:
            key (str): Logical object key.
            data (bytes): Raw binary payload.
            content_type (str): MIME type (unused on local disk, kept for interface parity).

        Returns:
            str: Stored object key.
        """
        self._base_dir.mkdir(parents=True, exist_ok=True)
        target = self._resolve_path(key)
        target.write_bytes(data)
        return key

    def get_bytes(self, key: str) -> bytes | None:
        """Reads binary bytes from local disk.

        Args:
            key (str): Logical object key.

        Returns:
            bytes | None: File bytes, or ``None`` if the file is missing.
        """
        target = self._resolve_path(key)
        if not target.is_file():
            return None
        return target.read_bytes()

    def delete(self, key: str) -> None:
        """Removes a binary file from local disk if present.

        Args:
            key (str): Logical object key.
        """
        target = self._resolve_path(key)
        if target.is_file():
            target.unlink(missing_ok=True)

    def generate_presigned_url(self, key: str, expires_in: int = 900) -> str | None:
        """Returns ``None`` because local disk storage has no presigned URL mechanism.

        Args:
            key (str): Logical object key.
            expires_in (int, optional): Ignored. Defaults to 900.

        Returns:
            str | None: Always ``None``.
        """
        return None


class S3StorageBackend:
    """S3-compatible object storage backend supporting MinIO locally and AWS S3 in production."""

    def __init__(
        self,
        bucket_name: str,
        endpoint_url: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        region_name: str = "us-east-1",
        use_ssl: bool = False,
        client: Any | None = None,
    ) -> None:
        """Initializes an S3-compatible storage client.

        Args:
            bucket_name (str): Target S3/MinIO bucket name.
            endpoint_url (str | None, optional): Custom endpoint URL for MinIO/R2.
                Leave ``None`` for standard AWS S3. Defaults to None.
            access_key_id (str | None, optional): S3 access key ID. Defaults to None.
            secret_access_key (str | None, optional): S3 secret access key. Defaults to None.
            region_name (str, optional): AWS/MinIO region. Defaults to "us-east-1".
            use_ssl (bool, optional): Whether to use HTTPS. Defaults to False.
            client (Any | None, optional): Optional pre-configured boto3 client (for testing).
                Defaults to None.

        Raises:
            DomainError: If ``boto3`` is not installed when constructing a live client.
        """
        self._bucket_name = bucket_name
        self._bucket_verified = False

        if client is not None:
            self._client = client
            return

        try:
            import boto3
            from botocore.config import Config
        except ImportError as exc:
            raise DomainError(
                "S3 storage backend requires 'boto3'. Run 'uv sync' to install dependencies.",
                status_code=500,
            ) from exc

        # [Compatibility] Enforce SigV4 and path-style addressing when using a custom endpoint like MinIO
        boto_config = Config(
            signature_version="s3v4",
            s3={"addressing_style": "path" if endpoint_url else "auto"},
        )
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url or None,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name=region_name,
            use_ssl=use_ssl,
            config=boto_config,
        )

    def _ensure_bucket(self) -> None:
        """Checks that the configured bucket exists and creates it if missing.

        Raises:
            DomainError: If the S3/MinIO service is unreachable or denies access.
        """
        if self._bucket_verified:
            return

        try:
            self._client.head_bucket(Bucket=self._bucket_name)
            self._bucket_verified = True
        except Exception as exc:
            error_code = self._extract_error_code(exc)
            if error_code in {"404", "NoSuchBucket", "NotFound"}:
                try:
                    self._client.create_bucket(Bucket=self._bucket_name)
                    self._bucket_verified = True
                    logger.info(f"[Storage] Created S3 bucket '{self._bucket_name}'.")
                    return
                except Exception as create_exc:
                    raise DomainError(
                        f"Failed to create S3 bucket '{self._bucket_name}': {create_exc}",
                        status_code=502,
                    ) from create_exc
            raise DomainError(
                f"Failed to access S3 bucket '{self._bucket_name}': {exc}",
                status_code=502,
            ) from exc

    @staticmethod
    def _extract_error_code(exc: Exception) -> str:
        """Extracts the S3 error code string from a botocore ClientError or similar exception.

        Args:
            exc (Exception): Exception raised by the boto3 client.

        Returns:
            str: S3 error code or HTTP status code string, or empty string if unavailable.
        """
        response = getattr(exc, "response", None)
        if isinstance(response, dict):
            code = response.get("Error", {}).get("Code")
            if code:
                return str(code)
            status_code = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status_code:
                return str(status_code)
        return ""

    def put_bytes(self, key: str, data: bytes, content_type: str) -> str:
        """Uploads binary bytes to the S3/MinIO bucket.

        Args:
            key (str): Logical object key.
            data (bytes): Raw binary payload.
            content_type (str): MIME type stored as object metadata.

        Returns:
            str: Stored object key.

        Raises:
            DomainError: If the upload fails.
        """
        self._ensure_bucket()
        try:
            self._client.put_object(
                Bucket=self._bucket_name,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
            return key
        except Exception as exc:
            raise DomainError(f"Failed to upload attachment to S3: {exc}", status_code=502) from exc

    def get_bytes(self, key: str) -> bytes | None:
        """Downloads binary bytes from the S3/MinIO bucket.

        Args:
            key (str): Logical object key.

        Returns:
            bytes | None: Object payload bytes, or ``None`` if not found.

        Raises:
            DomainError: If S3 returns an unexpected error other than Not Found.
        """
        try:
            response = self._client.get_object(Bucket=self._bucket_name, Key=key)
            body = response["Body"]
            return bytes(body.read())
        except Exception as exc:
            if self._extract_error_code(exc) in {"NoSuchKey", "404", "NotFound", "NoSuchBucket"}:
                return None
            raise DomainError(
                f"Failed to download attachment from S3: {exc}", status_code=502
            ) from exc

    def delete(self, key: str) -> None:
        """Deletes an object from the S3/MinIO bucket.

        Args:
            key (str): Logical object key to remove.
        """
        try:
            self._client.delete_object(Bucket=self._bucket_name, Key=key)
        except Exception as exc:
            logger.warning(f"[Storage] Failed to delete S3 object '{key}': {exc}")

    def generate_presigned_url(self, key: str, expires_in: int = 900) -> str | None:
        """Generates a temporary presigned GET URL for the stored object.

        Args:
            key (str): Logical object key.
            expires_in (int, optional): URL expiration in seconds. Defaults to 900.

        Returns:
            str | None: Presigned URL string, or ``None`` if generation fails.
        """
        try:
            url: str = self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket_name, "Key": key},
                ExpiresIn=expires_in,
            )
            return url
        except Exception as exc:
            logger.warning(f"[Storage] Failed to presign S3 object '{key}': {exc}")
            return None


def get_storage_backend() -> StorageBackend:
    """Selects and instantiates the configured attachment storage backend.

    Returns:
        StorageBackend: ``S3StorageBackend`` when ``STORAGE_BACKEND=s3`` (and no
            test ``CHAT_UPLOADS_DIR`` override is active), otherwise ``LocalStorageBackend``.
    """
    # [Testing] Honor explicit local upload directory overrides used by isolated unit tests
    if os.environ.get("CHAT_UPLOADS_DIR"):
        return LocalStorageBackend()

    backend = os.environ.get("STORAGE_BACKEND")
    settings = get_settings()
    selected = (backend or settings.storage_backend).strip().lower()

    if selected == "s3":
        endpoint_url = os.environ.get("S3_ENDPOINT_URL") or settings.s3_endpoint_url
        access_key = os.environ.get("S3_ACCESS_KEY_ID") or (
            settings.s3_access_key_id.get_secret_value() if settings.s3_access_key_id else None
        )
        secret_key = os.environ.get("S3_SECRET_ACCESS_KEY") or (
            settings.s3_secret_access_key.get_secret_value()
            if settings.s3_secret_access_key
            else None
        )
        bucket_name = os.environ.get("S3_BUCKET_NAME") or settings.s3_bucket_name
        region_name = os.environ.get("S3_REGION") or settings.s3_region
        use_ssl_env = os.environ.get("S3_USE_SSL")
        use_ssl = (
            use_ssl_env.strip().lower() in {"1", "true", "yes"}
            if use_ssl_env is not None
            else settings.s3_use_ssl
        )
        return S3StorageBackend(
            bucket_name=bucket_name,
            endpoint_url=endpoint_url,
            access_key_id=access_key,
            secret_access_key=secret_key,
            region_name=region_name,
            use_ssl=use_ssl,
        )

    return LocalStorageBackend()
