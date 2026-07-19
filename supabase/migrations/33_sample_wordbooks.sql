-- 33. public_wordbooks.is_sample — 게스트에게 기본 제공할 샘플 단어장 지정
-- Guest(비로그인)는 canUsePublicWordbooks=false로 공용 단어장 열람이 원천 차단되어 있으므로
-- (docs/PERMISSION_DESIGN.md §3), is_sample=true로 지정된 단어장만 예외적으로 anon(비로그인) role에
-- SELECT를 열어 게스트 최초 진입 시 로컬(IndexedDB)로 복사해 기본 제공한다.

ALTER TABLE public_wordbooks ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
CREATE INDEX idx_public_wordbooks_is_sample ON public_wordbooks(is_sample) WHERE is_sample = true;

CREATE POLICY "public_wordbooks_select_anon_sample" ON public_wordbooks
  FOR SELECT TO anon USING (status = 'published' AND is_sample = true);

CREATE POLICY "public_words_select_anon_sample" ON public_words
  FOR SELECT TO anon USING (
    status = 'active' AND EXISTS (
      SELECT 1 FROM public_wordbooks pw
      WHERE pw.id = public_words.wordbook_id AND pw.status = 'published' AND pw.is_sample = true
    )
  );

GRANT SELECT ON public.public_wordbooks TO anon;
GRANT SELECT ON public.public_words TO anon;
