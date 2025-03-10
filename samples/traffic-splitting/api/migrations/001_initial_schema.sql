CREATE TABLE apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    logger_url TEXT NOT NULL,
    api_key TEXT NOT NULL
);

CREATE TABLE requests (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    url TEXT NOT NULL,
    method TEXT NOT NULL,
    headers TEXT NOT NULL,
    body_length INTEGER NOT NULL,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);

CREATE INDEX idx_requests_app_id ON requests(app_id);
CREATE INDEX idx_requests_timestamp ON requests(timestamp); 
