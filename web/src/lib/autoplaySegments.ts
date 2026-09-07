import type { Word } from '@/types'
import type { AutoPlaySegment } from '@/stores/autoplayStore'

// 단어 자체(+예문)는 원어, 뜻/설명은 한국어로 읽는다 — Quiz/AnswerReveal 등 기존 발음 듣기
// 기능들과 동일한 관례(word.term → 'en-US', word.description → 'ko-KR')를 그대로 따른다.
const TERM_LANG = 'en-US'
const KO_LANG = 'ko-KR'

// 자동재생이 한 단어당 실제로 읽는 순서: 단어 → 뜻 → 설명 → 예문.
export function buildAutoPlaySegments(word: Word): AutoPlaySegment[] {
  const segments: AutoPlaySegment[] = [{ text: word.term, lang: TERM_LANG }]
  if (word.definition) segments.push({ text: word.definition, lang: KO_LANG })
  if (word.description) segments.push({ text: word.description, lang: KO_LANG })
  if (word.example) segments.push({ text: word.example, lang: TERM_LANG })
  return segments
}

// 미니 플레이어에 보이는 캡션(표시 전용, 읽는 내용과는 별개)
export function buildAutoPlayCaption(word: Word): string {
  return word.example || word.definition
}
