from dataclasses import dataclass
from datetime import datetime
from typing import Any

class JobValidationError(ValueError): pass

def _text(value: Any, name: str, *, allow_empty=False) -> str:
    if not isinstance(value, str) or (not allow_empty and not value.strip()): raise JobValidationError(f"{name} must be a non-empty string")
    return value
def _integer(value: Any, name: str, minimum=0) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum: raise JobValidationError(f"{name} must be an integer >= {minimum}")
    return value
def _strings(value: Any, name: str) -> tuple[str, ...]:
    if not isinstance(value, list): raise JobValidationError(f"{name} must be an array")
    return tuple(_text(x, name) for x in value)

@dataclass(frozen=True)
class ReceiptItem:
    quantity: int; name: str; variant: str; removed_ingredients: tuple[str,...]; added_extras: tuple[str,...]; sauces: tuple[str,...]
    @classmethod
    def from_dict(cls, data: dict) -> "ReceiptItem":
        if not isinstance(data, dict): raise JobValidationError("item must be an object")
        return cls(_integer(data.get("quantity"), "quantity", 1), _text(data.get("name"), "name"), _text(data.get("variant", ""), "variant", allow_empty=True), _strings(data.get("removed_ingredients"), "removed_ingredients"), _strings(data.get("added_extras"), "added_extras"), _strings(data.get("sauces"), "sauces"))

@dataclass(frozen=True)
class KitchenSummary:
    total_medallions: int; tybo_count: int; cheddar_count: int; roquefort_count: int
    @classmethod
    def from_dict(cls, data: dict) -> "KitchenSummary":
        if not isinstance(data, dict): raise JobValidationError("summary must be an object")
        return cls(*(_integer(data.get(k), k) for k in ("total_medallions", "tybo_count", "cheddar_count", "roquefort_count")))

@dataclass(frozen=True)
class OrderReceipt:
    number: int; time: str; items: tuple[ReceiptItem,...]; summary: KitchenSummary
    @classmethod
    def from_dict(cls, data: dict) -> "OrderReceipt":
        if not isinstance(data, dict): raise JobValidationError("order must be an object")
        items = data.get("items")
        if not isinstance(items, list) or not items: raise JobValidationError("order.items must be a non-empty array")
        return cls(_integer(data.get("number"), "order.number", 1), _text(data.get("time"), "order.time"), tuple(ReceiptItem.from_dict(x) for x in items), KitchenSummary.from_dict(data.get("summary")))
    def canonical_payload(self) -> dict:
        return {"number": self.number, "time": self.time, "items": [{"quantity": i.quantity, "name": i.name, "variant": i.variant, "removed_ingredients": list(i.removed_ingredients), "added_extras": list(i.added_extras), "sauces": list(i.sauces)} for i in self.items], "summary": self.summary.__dict__}

@dataclass(frozen=True)
class PrintJob:
    job_id: str; claim_token: str; lease_expires_at: str; schema_version: int; order: OrderReceipt
    @classmethod
    def from_dict(cls, data: dict) -> "PrintJob":
        if not isinstance(data, dict): raise JobValidationError("job must be an object")
        schema = _integer(data.get("schema_version"), "schema_version", 1)
        if schema != 1: raise JobValidationError("Unsupported job schema_version")
        lease = _text(data.get("lease_expires_at"), "lease_expires_at")
        try: datetime.fromisoformat(lease.replace("Z", "+00:00"))
        except ValueError as e: raise JobValidationError("lease_expires_at must be ISO-8601") from e
        return cls(_text(data.get("job_id"), "job_id"), _text(data.get("claim_token"), "claim_token"), lease, schema, OrderReceipt.from_dict(data.get("order")))
    def hash_payload(self) -> dict: return {"schema_version": self.schema_version, "order": self.order.canonical_payload()}

