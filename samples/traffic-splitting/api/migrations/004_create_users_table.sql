CREATE TABLE users (
    id TEXT PRIMARY KEY,
    github_id INTEGER NOT NULL,
    login TEXT NOT NULL,
    name TEXT,
    email TEXT,
    avatar_url TEXT,
    created_at DATETIME NOT NULL,
    last_signin_at DATETIME NOT NULL
);

CREATE INDEX idx_users_github_id ON users(github_id);
CREATE INDEX idx_users_login ON users(login); 
