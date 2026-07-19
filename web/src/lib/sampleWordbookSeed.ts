import { getSampleWordbooks, getPublicWords } from '@/lib/publicWordbooks'
import { localDataRepository } from '@/repositories/local/LocalDataRepository'
import { localDB } from '@/repositories/local/schema'

const SEEDED_META_KEY = 'sample_wordbooks_seeded'

// Admin이 is_sample=true로 지정한 공용 단어장을 게스트의 로컬(IndexedDB)에 복사해 기본 제공한다.
// 기기당 1회만 실행 — meta 플래그로 재실행을 막는다(사용자가 이후 삭제해도 다시 채워 넣지 않음).
// 네트워크 실패 시에는 플래그를 세우지 않아 다음 앱 진입 때 재시도한다.
export async function seedSampleWordbooksForGuest(): Promise<void> {
  const already = await localDB.meta.get(SEEDED_META_KEY)
  if (already) return

  const sampleWordbooks = await getSampleWordbooks()

  for (const sw of sampleWordbooks) {
    const words = await getPublicWords(sw.id)
    if (words.length === 0) continue

    const wordbook = await localDataRepository.createWordbook({
      name: sw.title,
      description: sw.description,
      language: sw.language,
    })
    for (const w of words) {
      await localDataRepository.createWord({
        wordbookId: wordbook.id,
        term: w.term,
        definition: w.definition,
        description: w.description,
        example: w.example,
      })
    }
  }

  await localDB.meta.put({ key: SEEDED_META_KEY, value: true })
}
