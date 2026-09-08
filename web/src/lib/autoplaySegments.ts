import type { Word } from '@/types'
import type { AutoPlaySegment } from '@/stores/autoplayStore'

// 뜻은 항상 한국어 번역이라 한국어로 읽는다. 단어/예문은 원어로 통일해서 같은 목소리로 읽는다.
const TERM_LANG = 'en-US'
const KO_LANG = 'ko-KR'

// 자동재생이 한 단어당 실제로 읽는 순서: 단어 → 뜻 → 예문.
export function buildAutoPlaySegments(word: Word): AutoPlaySegment[] {
  const segments: AutoPlaySegment[] = [{ text: word.term, lang: TERM_LANG }]
  if (word.definition) segments.push({ text: word.definition, lang: KO_LANG })
  if (word.example) segments.push({ text: word.example, lang: TERM_LANG })
  return segments
}

// 미니 플레이어에 보이는 캡션(표시 전용, 읽는 내용과는 별개)
export function buildAutoPlayCaption(word: Word): string {
  return word.example || word.definition
}
