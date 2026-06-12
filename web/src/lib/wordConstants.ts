import type { WordStatus } from '@/types'

export const STATUS_LABEL: Record<WordStatus, string> = {
  unseen: '미학습',
  learning: '학습 중',
  reviewing: '복습',
  mastered: '완료',
}

export const STATUS_COLOR: Record<WordStatus, string> = {
  unseen: 'bg-gray-100 text-gray-500',
  learning: 'bg-blue-50 text-blue-500',
  reviewing: 'bg-orange-50 text-orange-500',
  mastered: 'bg-green-50 text-green-500',
}
