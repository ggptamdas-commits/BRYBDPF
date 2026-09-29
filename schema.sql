-- BRYBDPF Database Schema (Cloudflare D1)
-- Smart Blood Donation & Millisecond Donor Platform

CREATE TABLE IF NOT EXISTS donors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  blood_group TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  district TEXT NOT NULL,
  area TEXT NOT NULL,
  thana TEXT NOT NULL DEFAULT '',
  current_address TEXT NOT NULL DEFAULT '',
  age INTEGER NOT NULL,
  gender TEXT NOT NULL,
  last_donation_date TEXT,
  total_donations INTEGER DEFAULT 0,
  is_available INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  agreed_future_donation INTEGER DEFAULT 1,
  agreed_data_save INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  next_available_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_donors_bg ON donors(blood_group);
CREATE INDEX IF NOT EXISTS idx_donors_dist ON donors(district);
CREATE INDEX IF NOT EXISTS idx_donors_avail ON donors(is_available);
CREATE INDEX IF NOT EXISTS idx_donors_query ON donors(blood_group, district, is_available);
CREATE INDEX IF NOT EXISTS idx_donors_bg_active ON donors(blood_group, is_available, is_active);

CREATE TABLE IF NOT EXISTS blood_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_name TEXT NOT NULL,
  blood_group TEXT NOT NULL,
  units INTEGER DEFAULT 1,
  hospital_name TEXT NOT NULL,
  district TEXT NOT NULL,
  thana TEXT,
  location TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  urgency TEXT DEFAULT 'Urgent',
  needed_by TEXT NOT NULL,
  note TEXT,
  hemoglobin TEXT,
  hemoglobin_unknown INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'Pending',
  agreed_future_donation INTEGER DEFAULT 1,
  agreed_data_save INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  requester_name TEXT,
  requester_blood_group TEXT
);

CREATE INDEX IF NOT EXISTS idx_req_phone ON blood_requests(contact_phone, created_at);
CREATE INDEX IF NOT EXISTS idx_req_status ON blood_requests(status);

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_rate_limit (
  ip_key TEXT PRIMARY KEY,
  attempt_count INTEGER DEFAULT 0,
  last_attempt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  email TEXT,
  attempted_at TEXT DEFAULT (datetime('now')),
  success INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts(ip, attempted_at);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  ip TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_admin_states (
  admin_uid TEXT PRIMARY KEY,
  state TEXT,
  data TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Telegram admin operations: one active owner per request and an append-only audit trail.
CREATE TABLE IF NOT EXISTS telegram_request_claims (
  request_id INTEGER PRIMARY KEY,
  admin_uid TEXT NOT NULL,
  claimed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS telegram_admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tg_audit_created ON telegram_admin_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_tg_audit_entity ON telegram_admin_audit(entity_type, entity_id);
