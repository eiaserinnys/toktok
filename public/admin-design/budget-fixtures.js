// Fictional isolated usage; model shape/data derived from A28e12caf. Not a product fallback.
export const budgetFixture={
 "windows": {
  "day": "2026-10-03",
  "month": "2026-10",
  "next_day_at": "2026-10-04T00:00:00.000Z",
  "next_month_at": "2026-11-01T00:00:00.000Z"
 },
 "usage": [
  {
   "kind": "admission_requests",
   "unit": "count",
   "day": {
    "reserved": 1,
    "limit": 100000
   },
   "month": {
    "reserved": 2,
    "limit": 3000000
   }
  },
  {
   "kind": "response_bytes",
   "unit": "bytes",
   "day": {
    "reserved": 2,
    "limit": 3221225472
   },
   "month": {
    "reserved": 4,
    "limit": 68719476736
   }
  },
  {
   "kind": "private_creates",
   "unit": "count",
   "day": {
    "reserved": 3,
    "limit": 100
   },
   "month": {
    "reserved": 6,
    "limit": 2000
   }
  },
  {
   "kind": "active_room_seconds",
   "unit": "seconds",
   "day": {
    "reserved": 4,
    "limit": 144000
   },
   "month": {
    "reserved": 8,
    "limit": 4320000
   }
  },
  {
   "kind": "persistent_write_bytes",
   "unit": "bytes",
   "day": {
    "reserved": 5,
    "limit": 16777216
   },
   "month": {
    "reserved": 10,
    "limit": 268435456
   }
  },
  {
   "kind": "email_attempts",
   "unit": "count",
   "day": {
    "reserved": 6,
    "limit": 1000
   },
   "month": {
    "reserved": 12,
    "limit": 10000
   }
  }
 ],
 "estimate": {
  "day_micro_usd": 1000,
  "month_micro_usd": 25002000,
  "warning_reached": false,
  "cutoff_exceeded": false
 },
 "thresholds": {
  "target_usd": 100,
  "warning_usd": 40,
  "cutoff_usd": 60
 },
 "model": {
  "version": "CF-reference-v1",
  "currency": "USD",
  "micro_usd_per_usd": 1000000,
  "scope": "cloudflare_reference_not_node_operating_cost",
  "actual_invoice": false,
  "included_usage": 0,
  "fixed_month_micro_usd": 25000000,
  "reservation_base_micro_usd": 14,
  "email_pricing": "planned_one_cent_per_attempt",
  "rates": {
   "admission_request_micro_usd": 3,
   "response_bytes_per_micro_usd": 65536,
   "active_room_second_micro_usd": 2,
   "persistent_write_bytes_per_micro_usd": 16,
   "email_attempt_micro_usd": 10000
  }
 }
};
