ALTER TABLE apps ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_apps_user_id ON apps(user_id); 
