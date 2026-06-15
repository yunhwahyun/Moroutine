import { useRef, useEffect } from 'react'
import { StyleSheet, View, Platform } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native'
import WebView, { WebViewMessageEvent } from 'react-native-webview'
import * as Notifications from 'expo-notifications'
import * as Speech from 'expo-speech'
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition'
import Constants from 'expo-constants'
import type { BridgeOutbound, BridgeInbound } from './src/types/bridge'

// 개발: Vite 로컬 서버 / 프로덕션: 배포 URL
const WEB_APP_URL = __DEV__
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:5173'  // Android 에뮬레이터 → 호스트 localhost
    : 'http://localhost:5173'  // iOS 시뮬레이터 → 호스트 localhost
  : 'https://moroutine.vercel.app'  // TODO: 실제 배포 URL로 교체

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
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
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
