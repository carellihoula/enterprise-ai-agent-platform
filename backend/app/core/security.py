"""Security and cryptographic utility module for secret management.

This module provides symmetric encryption, decryption, and masking utilities for API keys
and sensitive provider credentials using Fernet AES-128-CBC with SHA256 key derivation.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


def get_fernet_cipher() -> Fernet:
    """Instantiates a Fernet cryptographic cipher derived from the application SECRET_KEY.

    Returns:
        Fernet: Configured Fernet symmetric encryption cipher instance.
    """
    settings = get_settings()
    # [Key Derivation] Derive a uniform 32-byte urlsafe base64 key from arbitrary secret_key string
    secret_bytes = settings.secret_key.get_secret_value().encode("utf-8")
    key_hash = hashlib.sha256(secret_bytes).digest()
    urlsafe_key = base64.urlsafe_b64encode(key_hash)
    return Fernet(urlsafe_key)


def encrypt_api_key(plain_key: str) -> str:
    """Encrypts a plaintext API key string into a safe encrypted ciphertext token.

    Args:
        plain_key (str): The plaintext API key to encrypt.

    Returns:
        str: Encrypted ciphertext token string.
    """
    if not plain_key:
        return ""
    cipher = get_fernet_cipher()
    # [Encryption] Encrypt UTF-8 encoded secret into Fernet token
    encrypted_bytes = cipher.encrypt(plain_key.strip().encode("utf-8"))
    return encrypted_bytes.decode("utf-8")


def decrypt_api_key(cipher_token: str | None) -> str | None:
    """Decrypts a previously encrypted API key ciphertext token into plaintext.

    Args:
        cipher_token (str | None): The encrypted token to decrypt.

    Returns:
        str | None: Decrypted plaintext API key string, or None if invalid or absent.
    """
    if not cipher_token:
        return None
    try:
        cipher = get_fernet_cipher()
        # [Decryption] Decrypt Fernet token and decode UTF-8 bytes back to plaintext string
        decrypted_bytes = cipher.decrypt(cipher_token.encode("utf-8"))
        return decrypted_bytes.decode("utf-8")
    except (InvalidToken, ValueError):
        # [Fallback] Handle corrupted or outdated tokens gracefully
        return None


def mask_api_key(plain_key: str | None) -> str | None:
    """Generates a safe visual representation of an API key for frontend display.

    Args:
        plain_key (str | None): The plaintext API key.

    Returns:
        str | None: Masked API key string (e.g., 'sk-proj...1a2b'), or None.
    """
    if not plain_key:
        return None

    stripped = plain_key.strip()
    if len(stripped) <= 8:
        # [Masking] For very short keys, mask completely with fixed length
        return "••••••••"

    prefix_len = 6
    suffix_len = 4
    if len(stripped) <= (prefix_len + suffix_len):
        return f"{stripped[:3]}...{stripped[-2:]}"

    return f"{stripped[:prefix_len]}...{stripped[-suffix_len:]}"
