import { useEffect } from 'react'
import { registerBridgeListener } from '@/bridge'
import { supabase } from '@/lib/supabase'

export function useBridgeListener() {
  useEffect(() => {
    return registerBridgeListener(async (msg) => {
      if (msg.type === 'NOTIFICATION_RESULT') {
        const { id, nativeId, success } = msg.payload
        if (success && nativeId) {
          const { error } = await supabase
            .from('notifications')
            .update({ native_id: nativeId })
            .eq('id', id)
          if (error) console.error('[native_id update error]', error)
        }
      }
    })
  }, [])
}
