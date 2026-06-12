-- 3. wordbooks
CREATE TABLE wordbooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  language    text,         -- 'en-ko' | 'ja-ko' | 'zh-ko' 등
  word_count  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wordbooks_user ON wordbooks(user_id);

ALTER TABLE wordbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wordbooks_select" ON wordbooks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wordbooks_insert" ON wordbooks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wordbooks_update" ON wordbooks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wordbooks_delete" ON wordbooks FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordbooks TO authenticated;
