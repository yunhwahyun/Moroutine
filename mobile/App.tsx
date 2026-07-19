import { useRef, useEffect } from 'react'
import { StyleSheet, View, Platform } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native'
import WebView, { WebViewMessageEvent } from 'react-native-webview'
import * as Notifications from 'expo-notifications'
import * as Speech from 'expo-speech'
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition'
import Purchases from 'react-native-purchases'
import Constants from 'expo-constants'
import type { BridgeOutbound, BridgeInbound } from './src/types/bridge'

function getWebAppUrl(): string {
  if (!__DEV__) return 'https://moroutine.vercel.app'

  if (Platform.OS === 'android') return 'http://10.0.2.2:5173'

  // iOS 실기기: Expo Metro 번들러 host에서 Mac IP 추출 → Vite 포트로 연결
  const hostUri = Constants.expoConfig?.hostUri ?? ''
  const host = hostUri.split(':')[0]
  if (host && host !== 'localhost') return `http://${host}:5173`

  // iOS 시뮬레이터
  return 'http://localhost:5173'
}

const WEB_APP_URL = getWebAppUrl()

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export default function App() {
  const webViewRef = useRef<WebView>(null)
  const pendingQueue = useRef<BridgeInbound[]>([])
  const isWebReady = useRef(false)
  const sttSubs = useRef<{ remove: () => void }[]>([])

  useEffect(() => {
    Notifications.requestPermissionsAsync()

    // RevenueCat 초기화. 실계정 준비 전이라 EXPO_PUBLIC_REVENUECAT_API_KEY_* 미설정 시 스킵한다.
    const apiKey = Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS
      : process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID
    if (apiKey) {
      Purchases.configure({ apiKey })
    } else {
      console.warn('[RevenueCat] API key not set — skipping configure (scaffolding stage)')
    }
  }, [])

  function sendToWeb(msg: BridgeInbound) {
    if (!isWebReady.current) {
      pendingQueue.current.push(msg)
      return
    }
    webViewRef.current?.injectJavaScript(
      `window.onBridgeMessage && window.onBridgeMessage(${JSON.stringify(msg)}); true;`
    )
  }

  async function handleWebMessage(event: WebViewMessageEvent) {
    let msg: BridgeOutbound
    try {
      msg = JSON.parse(event.nativeEvent.data)
    } catch {
      return
    }

    if (msg.type === 'WEB_READY') {
      isWebReady.current = true
      const queued = pendingQueue.current
      pendingQueue.current = []
      queued.forEach((m) => sendToWeb(m))
      // 앱 버전 전송
      const version = Constants.expoConfig?.version ?? '1.0.0'
      sendToWeb({ type: 'APP_VERSION', payload: { version } })
      return
    }

    switch (msg.type) {
      case 'SCHEDULE_NOTIFICATION': {
        const { id, title, body, fireAt } = msg.payload
        try {
          const nativeId = await Notifications.scheduleNotificationAsync({
            content: { title, body, sound: true },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(fireAt),
            },
          })
          sendToWeb({ type: 'NOTIFICATION_RESULT', payload: { id, nativeId, success: true } })
        } catch (error) {
          sendToWeb({
            type: 'NOTIFICATION_RESULT',
            payload: { id, nativeId: '', success: false, error: String(error) },
          })
        }
        break
      }

      case 'CANCEL_NOTIFICATION':
        try {
          await Notifications.cancelScheduledNotificationAsync(msg.payload.id)
        } catch {
          // 이미 발송된 알림은 취소 불필요, 에러 무시
        }
        break

      case 'REQUEST_PERMISSION': {
        const { granted } = await Notifications.requestPermissionsAsync()
        sendToWeb({ type: 'PERMISSION_RESULT', payload: { permission: 'notifications', granted } })
        break
      }

      case 'SPEAK_TEXT': {
        const { text, lang } = msg.payload
        Speech.speak(text, { language: lang })
        break
      }

      case 'STOP_SPEECH':
        Speech.stop()
        break

      case 'START_STT': {
        const { lang } = msg.payload
        sttSubs.current.forEach((s) => s.remove())
        sttSubs.current = []

        const resultSub = ExpoSpeechRecognitionModule.addListener('result', (event: { results: { transcript: string }[]; isFinal: boolean }) => {
          const transcript = event.results[0]?.transcript ?? ''
          sendToWeb({ type: 'STT_RESULT', payload: { transcript, final: event.isFinal } })
          if (event.isFinal) {
            sttSubs.current.forEach((s) => s.remove())
            sttSubs.current = []
          }
        })
        const errorSub = ExpoSpeechRecognitionModule.addListener('error', () => {
          sendToWeb({ type: 'STT_RESULT', payload: { transcript: '', final: true } })
          sttSubs.current.forEach((s) => s.remove())
          sttSubs.current = []
        })
        sttSubs.current = [resultSub, errorSub]
        ExpoSpeechRecognitionModule.start({ lang, interimResults: false, continuous: false })
        break
      }

      case 'STOP_STT':
        ExpoSpeechRecognitionModule.stop()
        sttSubs.current.forEach((s) => s.remove())
        sttSubs.current = []
        break

      case 'GET_APP_VERSION': {
        const version = Constants.expoConfig?.version ?? '1.0.0'
        sendToWeb({ type: 'APP_VERSION', payload: { version } })
        break
      }

      case 'SET_USER_ID': {
        const { userId } = msg.payload
        try {
          if (userId) {
            await Purchases.logIn(userId)
          } else {
            await Purchases.logOut()
          }
        } catch (error) {
          console.error('[RevenueCat] setUserId error', error)
        }
        break
      }

      case 'PURCHASE_REQUEST': {
        const { planCode } = msg.payload
        try {
          const offerings = await Purchases.getOfferings()
          // 실제 Entitlement/Offering 식별자는 RevenueCat 대시보드 설정 후 확정 필요 — planCode와
          // 동일한 식별자로 패키지/상품을 구성한다고 가정한 임시 매칭 로직
          const pkg = offerings.current?.availablePackages.find(
            (p) => p.identifier === planCode || p.product.identifier.includes(planCode)
          )
          if (!pkg) {
            sendToWeb({ type: 'PURCHASE_RESULT', payload: { success: false, error: 'offering not found' } })
            break
          }
          await Purchases.purchasePackage(pkg)
          sendToWeb({ type: 'PURCHASE_RESULT', payload: { success: true } })
        } catch (error) {
          sendToWeb({ type: 'PURCHASE_RESULT', payload: { success: false, error: String(error) } })
        }
        break
      }

      case 'RESTORE_PURCHASES':
        try {
          await Purchases.restorePurchases()
          sendToWeb({ type: 'RESTORE_RESULT', payload: { success: true } })
        } catch (error) {
          sendToWeb({ type: 'RESTORE_RESULT', payload: { success: false, error: String(error) } })
        }
        break
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.webviewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: WEB_APP_URL }}
          style={styles.webview}
          onMessage={handleWebMessage}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsBackForwardNavigationGestures={false}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
})
