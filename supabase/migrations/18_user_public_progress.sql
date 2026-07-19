-- 18. user_public_wordbook_enrollments / user_public_word_progress — 공용 단어장 개인화 상태
-- docs/ADMIN_DESIGN.md §3-3, §3-4 참고 (public_wordbooks_words 이후에만 생성 가능)
-- 공용 단어 원본은 절대 수정하지 않고, 사용자별 학습 상태만 별도 테이블에 저장한다(원본 참조 방식).

CREATE TABLE user_public_wordbook_enrollments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wordbook_id  uuid NOT NULL REFERENCES public_wordbooks(id) ON DELETE CASCADE,
  enrolled_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_enrollments_unique ON user_public_wordbook_enrollments(user_id, wordbook_id);

CREATE TABLE user_public_word_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_word_id  uuid NOT NULL REFERENCES public_words(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'unseen',
  review_step     int  NOT NULL DEFAULT 0,
  first_passed_at timestamptz,
  next_review_at  timestamptz,
  wrong_count     int  NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_public_word_progress_unique ON user_public_word_progress(user_id, public_word_id);
CREATE INDEX idx_public_word_progress_review ON user_public_word_progress(user_id, next_review_at) WHERE status = 'reviewing';

ALTER TABLE user_public_wordbook_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_public_word_progress ENABLE ROW LEVEL SECURITY;

-- 본인 것만, Pro/Premium/Master만 (Guest는 애초에 authenticated가 아니므로 자동 차단)
CREATE POLICY "enrollments_all" ON user_public_wordbook_enrollments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'))
  WITH CHECK (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'));

CREATE POLICY "public_word_progress_all" ON user_public_word_progress
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'))
  WITH CHECK (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_public_wordbook_enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_public_word_progress TO authenticated;
