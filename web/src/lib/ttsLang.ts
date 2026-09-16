// Wordbook/Book.language 값('en-ko'|'ja-ko'|'zh-ko'|''|null — "원어-한국어" 언어쌍 표기)을
// 실제 TTS 엔진에 넘길 BCP-47 언어 코드로 바꾼다. 지금까지 단어/책장 발음 재생(개별 "발음 듣기"
// 버튼, 자동재생)이 이 매핑 없이 항상 'en-US'로 고정돼 있어서, 중국어/일본어 단어장·책장도
// 영어 음성으로 읽으려다 발음이 안 되거나 이상하게 들리는 문제가 있었다(사용자 리포트,
// docs/DECISION_LOG.md 2026-09-16).
const SOURCE_LANG: Record<string, string> = {
  'en-ko': 'en-US',
  'ja-ko': 'ja-JP',
  'zh-ko': 'zh-CN',
}

export function sourceTTSLang(language: string | null | undefined): string {
  return (language && SOURCE_LANG[language]) || 'en-US'
}

// 화면에 보여줄 한글 라벨(HomePage.tsx "오늘의 복습" 언어별 분기, Quiz.tsx 단어 카드 라벨 등).
const SOURCE_LABEL: Record<string, string> = {
  'en-ko': '영어',
  'ja-ko': '일본어',
  'zh-ko': '중국어',
}

export function sourceLangLabel(language: string | null | undefined): string {
  return (language && SOURCE_LABEL[language]) || '기타'
}
