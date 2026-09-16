import type { Word } from '@/types'
import type { AutoPlaySegment } from '@/stores/autoplayStore'

// 뜻은 항상 한국어 번역이라 한국어로 읽는다. 단어/예문은 그 단어가 속한 단어장의 언어
// (termLang — sourceTTSLang()으로 변환한 BCP-47 코드, 호출부가 word.wordbook_id로 조회해서
// 넘긴다)로 통일해서 같은 목소리로 읽는다. 예전엔 이 값이 항상 'en-US' 고정이라 중국어/일본어
// 단어장도 영어 음성으로 읽혔다(사용자 리포트, docs/DECISION_LOG.md 2026-09-16).
const KO_LANG = 'ko-KR'

// 자동재생이 한 단어당 실제로 읽는 순서: 단어 → 뜻 → 예문.
export function buildAutoPlaySegments(word: Word, termLang: string): AutoPlaySegment[] {
  const segments: AutoPlaySegment[] = [{ text: word.term, lang: termLang }]
  if (word.definition) segments.push({ text: word.definition, lang: KO_LANG })
  if (word.example) segments.push({ text: word.example, lang: termLang })
  return segments
}

// 미니 플레이어에 보이는 캡션(표시 전용, 읽는 내용과는 별개)
export function buildAutoPlayCaption(word: Word): string {
  return word.example || word.definition
}
