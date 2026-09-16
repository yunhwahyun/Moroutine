import { useQuery } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/usePermissions'
import { getRepository } from '@/repositories/factory'
import type { Wordbook } from '@/types'

// 여러 화면(HomePage/LearnPage/Quiz)이 "단어 하나가 어느 단어장 소속이고 그 단어장 언어가
// 뭔지"를 알아야 TTS 발음 언어를 정확히 고를 수 있어 공용으로 뺐다. WordbookListPage.tsx는
// 이미 자체적으로 ['wordbooks', tier] 쿼리(단어 수 등 통계까지 얹은 WordbookWithStats[])를
// 갖고 있어 그 캐시와 모양이 다르다 — 같은 키를 쓰면 캐시 충돌이 나므로 일부러 다른 키를 쓴다.
export function useWordbooks() {
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const repository = tier && tier !== 'admin' ? getRepository(tier) : null

  return useQuery<Wordbook[]>({
    queryKey: ['wordbooks_language_lookup', tier],
    queryFn: () => repository!.getWordbooks(),
    enabled: !!repository,
  })
}
