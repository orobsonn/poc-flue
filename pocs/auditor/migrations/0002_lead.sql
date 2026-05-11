CREATE TABLE lead (
  id TEXT PRIMARY KEY,
  segmento TEXT,
  faturamento_band TEXT,
  time_vendas TEXT,
  ferramentas TEXT,
  sinal TEXT,
  fundador_tecnico INTEGER,
  menciona_dor INTEGER,
  contexto_livre_sanitized TEXT
);

ALTER TABLE decision_log ADD COLUMN lead_id TEXT REFERENCES lead(id);
CREATE INDEX idx_decision_log_lead ON decision_log(lead_id);
