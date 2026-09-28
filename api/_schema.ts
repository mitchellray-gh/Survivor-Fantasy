// Schema DDL as an array of statements. We bundle this into the function
// rather than shipping a .sql file so we don't need includeFiles in
// vercel.json. Statements are split so we can execute them one-at-a-time
// with the @vercel/postgres tagged template client, which doesn't accept
// multi-statement strings.
//
// Keep this in sync with api/_schema.sql (that file is the human-readable
// canonical version).

export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS managers (
     name          TEXT PRIMARY KEY,
     display_name  TEXT,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  `CREATE TABLE IF NOT EXISTS players (
     id            INTEGER PRIMARY KEY,
     name          TEXT NOT NULL,
     age           INTEGER,
     hometown      TEXT,
     residence     TEXT,
     occupation    TEXT,
     about_me      TEXT,
     photo         TEXT,
     manager_name  TEXT REFERENCES managers(name) ON UPDATE CASCADE ON DELETE SET NULL,
     status        TEXT NOT NULL DEFAULT 'active'
       CHECK (status IN ('active','voted_out','medevac','quit','winner')),
     updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  `CREATE INDEX IF NOT EXISTS idx_players_manager ON players(manager_name)`,

  `CREATE TABLE IF NOT EXISTS episodes (
     number     INTEGER PRIMARY KEY,
     title      TEXT,
     aired_on   DATE,
     notes      TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS scoring_categories (
     id          TEXT PRIMARY KEY,
     "group"     TEXT NOT NULL,
     label       TEXT NOT NULL,
     points      INTEGER NOT NULL,
     sort_order  INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS episode_events (
     player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
     episode      INTEGER NOT NULL,
     category_id  TEXT NOT NULL REFERENCES scoring_categories(id) ON DELETE CASCADE,
     count        INTEGER NOT NULL DEFAULT 0,
     updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (player_id, episode, category_id)
   )`,

  `CREATE INDEX IF NOT EXISTS idx_events_player  ON episode_events(player_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_episode ON episode_events(episode)`,

  `CREATE TABLE IF NOT EXISTS score_overrides (
     player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
     episode     INTEGER NOT NULL,
     delta       INTEGER NOT NULL,
     reason      TEXT,
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (player_id, episode)
   )`,

  `CREATE TABLE IF NOT EXISTS predictions (
     manager           TEXT    NOT NULL REFERENCES managers(name) ON UPDATE CASCADE ON DELETE CASCADE,
     episode           INTEGER NOT NULL,
     category_id       TEXT    NOT NULL REFERENCES scoring_categories(id) ON DELETE CASCADE,
     target_player_id  INTEGER REFERENCES players(id) ON DELETE SET NULL,
     locked            BOOLEAN NOT NULL DEFAULT FALSE,
     created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (manager, episode, category_id)
   )`,

  `CREATE TABLE IF NOT EXISTS meta (
     key    TEXT PRIMARY KEY,
     value  TEXT NOT NULL
   )`,

  `INSERT INTO meta(key, value) VALUES ('schema_version', '1')
     ON CONFLICT (key) DO NOTHING`,
]
