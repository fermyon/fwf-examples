CREATE TABLE responses (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  status_code INTEGER NOT NULL,
  headers TEXT NOT NULL,
  body_length INTEGER NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
);

CREATE INDEX idx_responses_app_id ON responses(app_id);
CREATE INDEX idx_responses_request_id ON responses(request_id);
CREATE INDEX idx_responses_timestamp ON responses(timestamp); 
