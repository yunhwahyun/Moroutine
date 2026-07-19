import type { ServiceTier } from '@/types'
import type { DataRepository } from './types'
import { localDataRepository } from './local/LocalDataRepository'
import { remoteDataRepository } from './remote/RemoteDataRepository'

// docs/DATA_STORAGE_DESIGN.md §6-2 — 화면은 이 함수로만 Repository를 얻는다.
// Admin은 공용 콘텐츠 전용 AdminContentRepository를 별도로 사용하므로(docs/ADMIN_DESIGN.md, Phase 19~20에서 구현),
// 아직 존재하지 않는 이 시점에는 admin으로 getRepository()를 호출하지 않아야 한다.
export function getRepository(tier: ServiceTier): DataRepository {
  switch (tier) {
    case 'guest':
      return localDataRepository
    case 'pro':
    case 'premium':
    case 'master':
      return remoteDataRepository
    case 'admin':
      throw new Error('Admin은 AdminContentRepository를 별도로 사용한다 (docs/ADMIN_DESIGN.md)')
  }
}
