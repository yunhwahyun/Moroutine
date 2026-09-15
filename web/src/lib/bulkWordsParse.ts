// 단어 일괄등록 공용 파서 — 개인 단어장(WordbookDetailPage.tsx)/공용 단어장 관리자
// (AdminWordbookDetailPage.tsx) 양쪽에서 동일하게 사용한다.
//
// 파일 확장자로 구분자를 정한다: .csv → 쉼표, 그 외(.tsv/.txt)는 기존과 동일하게 탭.
// 각 행은 term/definition/example(선택) 3컬럼. 따옴표(")로 감싼 필드 안의 구분자·줄바꿈·
// 이스케이프된 큰따옴표("")도 표준 CSV 규칙대로 처리한다 — definition/example에 쉼표나
// 줄바꿈이 들어있는 실제 CSV 내보내기 파일도 그대로 붙여넣을 수 있게 하기 위함.

export type ParsedWord = { term: string; definition: string; example: string }
export type ParsedWordsResult = { parsed: ParsedWord[]; errorCount: number }

function delimiterForFilename(filename: string): string {
  return filename.toLowerCase().endsWith('.csv') ? ',' : '\t'
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    // CRLF/단독 CR 정규화 — 따옴표로 감싼 필드 안에서도 적용해야 한다. 그렇지 않으면 Windows
    // 줄바꿈으로 내보낸 CSV의 여러 줄짜리 필드(따옴표 안에 실제 줄바꿈 포함) 안에 '\r'이 그대로
    // 남아 정의/예문에 눈에 안 보이는 문자가 섞여 들어간다.
    if (ch === '\r') {
      i++
      continue
    }
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  row.push(field)
  rows.push(row)
  return rows
}

// docs/DESIGN.md §13 — 오류 행(단어/뜻 중 하나라도 비어있는 줄)을 별도로 세어 미리보기에 노출한다.
// 3번째 컬럼은 예문(example)이다. 완전히 빈 줄은 오류로 세지 않고 건너뛴다.
export function parseWordsFile(filename: string, content: string): ParsedWordsResult {
  const delimiter = delimiterForFilename(filename)
  const rows = parseDelimitedRows(content, delimiter)
  const parsed: ParsedWord[] = []
  let errorCount = 0
  for (const cols of rows) {
    if (cols.every((c) => c.trim().length === 0)) continue
    const term = (cols[0] ?? '').trim()
    const definition = (cols[1] ?? '').trim().replace(/\\n/g, '\n')
    const example = (cols[2] ?? '').trim().replace(/\\n/g, '\n')
    if (term && definition) parsed.push({ term, definition, example })
    else errorCount++
  }
  return { parsed, errorCount }
}
