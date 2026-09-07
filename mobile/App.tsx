import { useRef, useEffect } from 'react'
import { StyleSheet, View, Platform } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native'
import WebView, { WebViewMessageEvent } from 'react-native-webview'
import * as Notifications from 'expo-notifications'
import * as Speech from 'expo-speech'
import { useAudioPlayer, setAudioModeAsync, requestNotificationPermissionsAsync } from 'expo-audio'
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition'
import Purchases from 'react-native-purchases'
import Constants from 'expo-constants'
import type { BridgeOutbound, BridgeInbound } from './src/types/bridge'

// 자동재생 세션 상태 — 화면 잠금/백그라운드에서도 이어지도록 웹뷰가 아닌 이 RN JS 스레드가
// 시퀀싱을 전담한다(docs/DECISION_LOG.md 참고).
interface AutoplaySession {
  words: string[]
  lang: string
  gapMs: number
  index: number
  paused: boolean
}

function getWebAppUrl(): string {
  if (!__DEV__) return 'https://www.moroutine.kr'

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
  const autoplayRef = useRef<AutoplaySession | null>(null)

  // 무음 루프 — 실제 소리는 Speech.speak가 담당하고, 이 플레이어는 백그라운드 오디오
  // 세션/잠금화면 컨트롤을 유지시켜 화면이 꺼져도 자동재생이 계속되게 하는 용도다.
  const keepAlivePlayer = useAudioPlayer(require('./assets/silence.wav'))
  useEffect(() => {
    keepAlivePlayer.loop = true
    keepAlivePlayer.volume = 0
  }, [keepAlivePlayer])

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

  function speakAutoplayWord() {
    const session = autoplayRef.current
    if (!session || session.paused) return
    if (session.index >= session.words.length) {
      sendToWeb({ type: 'AUTOPLAY_FINISHED' })
      keepAlivePlayer.pause()
      keepAlivePlayer.setActiveForLockScreen(false)
      autoplayRef.current = null
      return
    }
    sendToWeb({ type: 'AUTOPLAY_WORD_CHANGED', payload: { index: session.index } })
    const advance = () => {
      if (!autoplayRef.current || autoplayRef.current.paused) return
      setTimeout(() => {
        if (!autoplayRef.current || autoplayRef.current.paused) return
        autoplayRef.current.index += 1
        speakAutoplayWord()
      }, session.gapMs)
    }
    Speech.speak(session.words[session.index], {
      language: session.lang,
      onDone: advance,
      onError: advance,
    })
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

      case 'AUTOPLAY_START': {
        const { words, lang, gapMs } = msg.payload
        autoplayRef.current = { words, lang, gapMs, index: 0, paused: false }
        try {
          await setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: 'doNotMix',
          })
        } catch (error) {
          console.error('[autoplay] setAudioModeAsync error', error)
        }
        // Android는 잠금화면 미디어 컨트롤 표시에 알림 권한이 필요하다(iOS는 해당 없음, 호출 시 throw).
        if (Platform.OS === 'android') {
          try {
            await requestNotificationPermissionsAsync()
          } catch (error) {
            console.error('[autoplay] requestNotificationPermissionsAsync error', error)
          }
        }
        keepAlivePlayer.setActiveForLockScreen(true, { title: 'Moroutine', artist: '자동재생 중' })
        keepAlivePlayer.play()
        speakAutoplayWord()
        break
      }

      case 'AUTOPLAY_PAUSE':
        if (autoplayRef.current) autoplayRef.current.paused = true
        Speech.stop()
        break

      case 'AUTOPLAY_RESUME':
        if (autoplayRef.current) {
          autoplayRef.current.paused = false
          speakAutoplayWord()
        }
        break

      case 'AUTOPLAY_SEEK':
        if (autoplayRef.current) {
          Speech.stop()
          autoplayRef.current.index = msg.payload.index
          autoplayRef.current.paused = false
          speakAutoplayWord()
        }
        break

      case 'AUTOPLAY_STOP':
        Speech.stop()
        autoplayRef.current = null
        keepAlivePlayer.pause()
        keepAlivePlayer.setActiveForLockScreen(false)
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
