import type { AutoPlaySegment } from '@/stores/autoplayStore'

// 책장은 언어 설정과 무관하게 제목/내용 모두 항상 영어 원음으로 듣는다 — 단어처럼 필드별로
// 언어가 갈리지 않아 autoplaySegments.ts(단어용)보다 단순하다. 개인 BookChapter/공용
// PublicBookChapter 둘 다 title/content 구조가 같아 구조적 타입으로 공유한다.
const CHAPTER_LANG = 'en-US'

type ChapterLike = { title: string; content: string }

// 자동재생이 목차 하나당 실제로 읽는 순서: 제목 → 내용.
export function buildChapterAutoPlaySegments(chapter: ChapterLike): AutoPlaySegment[] {
  return [
    { text: chapter.title, lang: CHAPTER_LANG },
    { text: chapter.content, lang: CHAPTER_LANG },
  ]
}

// 미니 플레이어에 보이는 캡션(표시 전용, 읽는 내용과는 별개)
export function buildChapterAutoPlayCaption(chapter: ChapterLike): string {
  return chapter.title
}
