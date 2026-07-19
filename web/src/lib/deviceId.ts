const DEVICE_ID_KEY = 'moroutine_device_id'

// docs/MIGRATION_DESIGN.md §8 — device_migration_status는 기기별로 이전 완료 여부를 추적한다.
// 이 프로젝트엔 기존에 기기 식별자 개념이 전혀 없어, 브라우저(WebView 포함)당 1회 생성해 재사용한다.
export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}
