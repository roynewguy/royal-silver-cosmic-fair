-- Distinct free-channel delivery fence (PT day). Does not create a second picks ledger.
CREATE TABLE IF NOT EXISTS free_pick_delivery (
  pt_day text PRIMARY KEY,
  pick_id integer NOT NULL REFERENCES picks(id),
  message_id text,
  state text NOT NULL CHECK (state IN ('sending', 'sent', 'delivery_unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
