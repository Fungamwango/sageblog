-- SageBlog D1 Schema

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    slug        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO categories (name, slug, description) VALUES
    ('Technology',  'technology',  'AI, software, hardware, and emerging tech'),
    ('Science',     'science',     'Research, discoveries, and natural world'),
    ('Business',    'business',    'Startups, finance, and entrepreneurship'),
    ('Health',      'health',      'Wellness, medicine, and mental health'),
    ('Culture',     'culture',     'Arts, entertainment, society, and trends'),
    ('Environment', 'environment', 'Climate, sustainability, and ecology');

CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    slug       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT NOT NULL,
    slug           TEXT NOT NULL UNIQUE,
    excerpt        TEXT NOT NULL,
    content        TEXT NOT NULL,
    category_id    INTEGER NOT NULL REFERENCES categories(id),
    author_id      INTEGER REFERENCES users(id),
    status         TEXT NOT NULL DEFAULT 'published',
    ai_generated   INTEGER NOT NULL DEFAULT 1,
    meta_title     TEXT,
    meta_desc      TEXT,
    featured_image TEXT,
    read_time      INTEGER DEFAULT 5,
    view_count     INTEGER NOT NULL DEFAULT 0,
    like_count     INTEGER NOT NULL DEFAULT 0,
    comment_count  INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    published_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_slug        ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_category    ON posts(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_status      ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_published   ON posts(published_at DESC);

CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag_id);

CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'approved',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

CREATE TABLE IF NOT EXISTS likes (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);

CREATE TABLE IF NOT EXISTS ai_generation_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id      INTEGER REFERENCES posts(id),
    category_id  INTEGER REFERENCES categories(id),
    prompt_used  TEXT,
    model_used   TEXT,
    tokens_used  INTEGER,
    status       TEXT NOT NULL DEFAULT 'success',
    error_msg    TEXT,
    triggered_by TEXT NOT NULL DEFAULT 'cron',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
