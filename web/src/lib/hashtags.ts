// docs/DECISION_LOG.md 2026-09-15 — 개인 단어장/책장 해시태그 정규화 + 필터 칩 정렬 공용 로직.
// 단어장(WordbookListPage)/책장(BookshelfListPage) 양쪽에서 동일하게 사용한다.

export const HASHTAG_MAX_LENGTH = 20
export const HASHTAG_MAX_COUNT = 5

// "중1, 아이엘츠, 회화" → ["중1", "아이엘츠", "회화"]. 빈 값/중복 제거, 개수·길이 제한.
export function parseHashtagsInput(raw: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of raw.split(',')) {
    const tag = part.trim().replace(/^#+/, '').slice(0, HASHTAG_MAX_LENGTH)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
    if (result.length >= HASHTAG_MAX_COUNT) break
  }
  return result
}

// 목록에 등장한 해시태그를 빈도 내림차순(동률이면 가나다순)으로 모은 필터 칩 옵션.
// hashtags 컬럼 추가 이전 데이터(Guest IndexedDB에 남아있던 레코드 등)는 이 필드 자체가 없을 수
// 있어(?? [])로 방어 — 없으면 "not iterable" 예외로 화면 전체가 하얗게 죽는다(실기기에서 발견,
// docs/DECISION_LOG.md 2026-09-15). Repository 계층(LocalDataRepository.ts)에서도 이미
// 채워주지만, 이 함수는 공용 유틸이라 호출부를 다 신뢰하지 않고 한 번 더 방어한다.
export function collectHashtagFilterOptions(items: { hashtags?: string[] }[]): string[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const tag of item.hashtags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .map(([tag]) => tag)
}

// 선택된 태그를 전부(AND) 가진 항목만 통과.
export function matchesHashtagFilter(itemHashtags: string[] | undefined, selectedTags: Set<string>): boolean {
  if (selectedTags.size === 0) return true
  const tags = itemHashtags ?? []
  return [...selectedTags].every((tag) => tags.includes(tag))
}
