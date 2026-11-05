import base64
import json


def is_publishable_key(value: str) -> bool:
    """Key-type guard only; identity still requires verified JWTs and database RLS."""
    if value.startswith("sb_publishable_"):
        return True
    if value.count(".") == 2:
        try:
            encoded = value.split(".")[1]
            payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
            return isinstance(payload, dict) and payload.get("role") == "anon"
        except (ValueError, TypeError, UnicodeDecodeError):
            return False
    return False
