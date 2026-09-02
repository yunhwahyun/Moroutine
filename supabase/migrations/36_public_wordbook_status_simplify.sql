-- 36. 공용 단어장 상태값 단순화 — 초안/기본/게시/보관 4가지로 통합
-- docs/ADMIN_DESIGN.md §3, docs/DECISION_LOG.md 2026-09-02 참고
--
-- 배경: 기존 status('draft'|'published'|'hidden'|'archived') + 별도 is_sample 불리언 컬럼 조합을
-- status 하나로 통합한다. '숨김(hidden)'은 더 이상 쓰지 않고, is_sample=true였던 의미는
-- status='default'(기본)로 대체한다 — '기본'은 사용자에게는 '게시'와 동일하게 보이면서(§3-4 RLS),
-- 게스트에게도 최초 진입 시 자동 제공되는(SampleWordbookSeedGate) 단어장이다.
-- 단어(public_words) 단위 보관(status='archived')은 더 이상 관리자 화면에 노출하지 않지만,
-- 기존 데이터 보존을 위해 컬럼/RLS는 그대로 둔다(신규로 archived가 생기지 않을 뿐).

-- 1) 데이터 이관 — is_sample=true였던 행을 'default'로, 남은 'hidden'은 'draft'로 흡수.
UPDATE public_wordbooks SET status = 'default' WHERE is_sample = true;
UPDATE public_wordbooks SET status = 'draft' WHERE status = 'hidden';

-- 2) anon(게스트) 샘플 열람 RLS — is_sample 대신 status='default'만으로 판정(마이그레이션 33 정책 교체).
DROP POLICY IF EXISTS "public_wordbooks_select_anon_sample" ON public_wordbooks;
DROP POLICY IF EXISTS "public_words_select_anon_sample" ON public_words;

CREATE POLICY "public_wordbooks_select_anon_sample" ON public_wordbooks
  FOR SELECT TO anon USING (status = 'default');

CREATE POLICY "public_words_select_anon_sample" ON public_words
  FOR SELECT TO anon USING (
    status = 'active' AND EXISTS (
      SELECT 1 FROM public_wordbooks pw
      WHERE pw.id = public_words.wordbook_id AND pw.status = 'default'
    )
  );

-- 3) Pro/Premium/Master 열람 RLS — 'default'도 'published'와 동등하게 노출(마이그레이션 17 정책 교체).
DROP POLICY IF EXISTS "public_wordbooks_select" ON public_wordbooks;
DROP POLICY IF EXISTS "public_words_select" ON public_words;

CREATE POLICY "public_wordbooks_select" ON public_wordbooks
  FOR SELECT TO authenticated USING (
    (status IN ('published', 'default') AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'))
    OR is_admin(auth.uid())
  );

CREATE POLICY "public_words_select" ON public_words
  FOR SELECT TO authenticated USING (
    (status = 'active' AND EXISTS (
       SELECT 1 FROM public_wordbooks pw
       WHERE pw.id = public_words.wordbook_id AND pw.status IN ('published', 'default')
     ) AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'))
    OR is_admin(auth.uid())
  );

-- 4) is_sample 컬럼/인덱스 제거 — 의미가 status='default'로 완전히 흡수됨.
DROP INDEX IF EXISTS idx_public_wordbooks_is_sample;
ALTER TABLE public_wordbooks DROP COLUMN IF EXISTS is_sample;
