import type { AutoPlaySegment } from '@/stores/autoplayStore'

// 책장은 그 책의 language(lang — sourceTTSLang()으로 변환한 BCP-47 코드, 호출부가
// book.language로 조회해서 넘긴다)로 제목/내용을 모두 읽는다 — 단어처럼 필드별로 언어가
// 갈리지 않아 autoplaySegments.ts(단어용)보다 단순하다. 개인 BookChapter/공용
// PublicBookChapter 둘 다 title/content 구조가 같아 구조적 타입으로 공유한다. 예전엔 이 값이
// 항상 'en-US' 고정이라 중국어/일본어 책장도 영어 음성으로 읽혔다(사용자 리포트,
// docs/DECISION_LOG.md 2026-09-16).
type ChapterLike = { title: string; content: string }

// 자동재생이 목차 하나당 실제로 읽는 순서: 제목 → 내용.
export function buildChapterAutoPlaySegments(chapter: ChapterLike, lang: string): AutoPlaySegment[] {
  return [
    { text: chapter.title, lang },
    { text: chapter.content, lang },
  ]
}

// 미니 플레이어에 보이는 캡션(표시 전용, 읽는 내용과는 별개)
export function buildChapterAutoPlayCaption(chapter: ChapterLike): string {
  return chapter.title
}
