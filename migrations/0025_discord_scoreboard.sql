CREATE TABLE IF NOT EXISTS discord_scoreboard (
  purpose text PRIMARY KEY,
  webhook_id text NOT NULL,
  message_id text,
  state text NOT NULL CHECK (state IN ('sending', 'sent', 'delivery_unknown', 'missing')),
  content text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
