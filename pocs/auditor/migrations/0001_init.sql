CREATE TABLE decision_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  phase TEXT,
  did TEXT NOT NULL,
  reasoned TEXT NOT NULL,
  out_of_scope TEXT,
  tools_called TEXT,
  duration_ms INTEGER,
  cost_usd REAL,
  model_main TEXT,
  expected_reasoning_ref TEXT,
  outcome TEXT,
  outcome_source TEXT,
  objective_tier TEXT NOT NULL,
  judgment_outcome TEXT NOT NULL,
  has_out_of_scope INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_decision_log_window ON decision_log(agent_id, ts);
CREATE INDEX idx_decision_log_bucket ON decision_log(judgment_outcome, objective_tier, has_out_of_scope);

CREATE TABLE audit_run (
  agent_id TEXT NOT NULL,
  last_processed_ts INTEGER NOT NULL,
  PRIMARY KEY (agent_id)
);

CREATE TABLE decision_log_rejected (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  reason TEXT NOT NULL,
  rejected_by_layer INTEGER NOT NULL
);
