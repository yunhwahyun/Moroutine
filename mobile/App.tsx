import { useRef, useEffect } from 'react'
import { StyleSheet, View, Platform, AppState } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native'
import WebView, { WebViewMessageEvent } from 'react-native-webview'
import * as Notifications from 'expo-notifications'
import * as Speech from 'expo-speech'
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync, requestNotificationPermissionsAsync } from 'expo-audio'
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition'
import Purchases from 'react-native-purchases'
import Constants from 'expo-constants'
import type { BridgeOutbound, BridgeInbound } from './src/types/bridge'

// 자동재생 세션 상태 — 화면 잠금/백그라운드에서도 이어지도록 웹뷰가 아닌 이 RN JS 스레드가
// 시퀀싱을 전담한다(docs/DECISION_LOG.md 참고). gen은 seek/pause/stop이 재생 도중 끼어들 때
// 이전에 예약된 onDone/setTimeout 콜백이 뒤늦게 실행되는 걸 막기 위한 세대 값이다.
interface AutoplaySession {
  words: string[]
  lang: string
  gapMs: number
  index: number
  paused: boolean
  gen: number
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
  const autoplayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 무음 루프 — 실제 소리는 Speech.speak가 담당하고, 이 플레이어는 백그라운드 오디오
  // 세션/잠금화면 컨트롤을 유지시켜 화면이 꺼져도 자동재생이 계속되게 하는 용도다. 잠금화면/
  // 제어센터/이어폰 리모컨의 재생·일시정지 버튼은 전부 OS가 이 플레이어에 직접 play()/pause()를
  // 호출하는 방식으로 동작한다.
  const keepAlivePlayer = useAudioPlayer(require('./assets/silence.wav'))
  const keepAlivePlayerStatus = useAudioPlayerStatus(keepAlivePlayer)
  useEffect(() => {
    keepAlivePlayer.loop = true
    keepAlivePlayer.volume = 0
  }, [keepAlivePlayer])

  // 앱 내 버튼이든 잠금화면/이어폰이든, keepAlivePlayer의 play()/pause()가 유일한 진입점이다.
  function setKeepAlivePlaying(playing: boolean) {
    if (playing) keepAlivePlayer.play()
    else keepAlivePlayer.pause()
  }

  function clearAutoplayTimeout() {
    if (autoplayTimeoutRef.current) {
      clearTimeout(autoplayTimeoutRef.current)
      autoplayTimeoutRef.current = null
    }
  }

  // Speech 쪽 재생/정지는 오직 이 effect 하나에서만 다룬다 — 호출 주체(앱 내 버튼 vs 잠금화면/
  // 제어센터/이어폰)를 구분해서 한쪽을 "무시"하려 하면, 상태 갱신 이벤트가 비동기로 지연 도착할 때
  // 자체 변경과 외부 변경이 뒤섞여 상태가 꼬일 수 있다(실기기에서 확인된 버그) — 그래서 구분 자체를
  // 없애고, keepAlivePlayer.playing 값 하나만 진실로 삼아 항상 거기에 맞춘다(레벨 트리거).
  useEffect(() => {
    const session = autoplayRef.current
    if (!session) return
    const shouldPlay = keepAlivePlayerStatus.playing
    if (shouldPlay === !session.paused) return  // 이미 반영된 상태(자체 변경 포함) — 아무 것도 안 함
    session.paused = !shouldPlay
    session.gen += 1
    sendToWeb({ type: 'AUTOPLAY_PLAYING_CHANGED', payload: { playing: shouldPlay } })
    if (shouldPlay) {
      speakAutoplayWord(session.gen)
    } else {
      clearAutoplayTimeout()
      Speech.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepAlivePlayerStatus.playing])

  // 화면 잠금/백그라운드 중엔 WebView 자체가 정지돼 injectJavaScript로 보낸 진행 상황 메시지가
  // 그동안 반영되지 못했을 수 있다 — 앱이 다시 포그라운드로 돌아올 때마다 지금 네이티브가 들고 있는
  // 진짜 상태(인덱스/재생 여부)를 다시 보내 화면(미니 플레이어)을 강제로 맞춘다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      const session = autoplayRef.current
      if (!session) return
      sendToWeb({ type: 'AUTOPLAY_WORD_CHANGED', payload: { index: session.index } })
      sendToWeb({ type: 'AUTOPLAY_PLAYING_CHANGED', payload: { playing: !session.paused } })
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // gen: 호출 시점의 세대 값을 캡처해두고, 지연 콜백(advance)이 실행될 때 세션의 현재 세대와
  // 비교한다 — 그 사이 seek/pause/stop이 끼어들어 세대가 바뀌었으면 낡은 콜백이니 무시한다.
  function speakAutoplayWord(gen: number) {
    const session = autoplayRef.current
    if (!session || session.paused || session.gen !== gen) return
    if (session.index >= session.words.length) {
      sendToWeb({ type: 'AUTOPLAY_FINISHED' })
      setKeepAlivePlaying(false)
      keepAlivePlayer.setActiveForLockScreen(false)
      autoplayRef.current = null
      return
    }
    sendToWeb({ type: 'AUTOPLAY_WORD_CHANGED', payload: { index: session.index } })

    let advanced = false
    const advanceOnce = () => {
      if (advanced) return
      advanced = true
      if (!autoplayRef.current || autoplayRef.current.paused || autoplayRef.current.gen !== gen) return
      clearAutoplayTimeout()
      autoplayTimeoutRef.current = setTimeout(() => {
        if (!autoplayRef.current || autoplayRef.current.paused || autoplayRef.current.gen !== gen) return
        autoplayRef.current.index += 1
        speakAutoplayWord(gen)
      }, session.gapMs)
    }

    Speech.speak(session.words[session.index], {
      language: session.lang,
      onDone: advanceOnce,
      onError: advanceOnce,
    })

    // expo-speech의 onDone/onError가 일부 기기·언어 조합에서 아예 안 불리는 경우가 있어(실기기에서
    // "다음 단어로 자동 진행이 안 된다" 버그로 확인됨) — 예상 재생 시간이 지나도 콜백이 없으면
    // 안전장치로 강제 진행시킨다. 콜백이 정상적으로 먼저 오면 advanced 플래그가 중복 실행을 막는다.
    const estimatedMs = Math.max(2500, session.words[session.index].length * 220)
    setTimeout(advanceOnce, estimatedMs)
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
        const { words, lang, gapMs, startIndex } = msg.payload
        clearAutoplayTimeout()
        Speech.stop()
        const gen = (autoplayRef.current?.gen ?? 0) + 1
        autoplayRef.current = { words, lang, gapMs, index: startIndex, paused: false, gen }
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
        setKeepAlivePlaying(true)
        speakAutoplayWord(gen)
        break
      }

      // 실제 정지/재개 처리는 keepAlivePlayer.playing을 관찰하는 effect 하나가 전담한다(위 참고)
      // — 여기서는 플레이어 상태만 바꾸고, 앱 내 버튼과 잠금화면/이어폰을 동일하게 취급한다.
      case 'AUTOPLAY_PAUSE':
        setKeepAlivePlaying(false)
        break

      case 'AUTOPLAY_RESUME':
        setKeepAlivePlaying(true)
        break

      case 'AUTOPLAY_STEP': {
        const session = autoplayRef.current
        if (!session) break
        const targetIndex = session.index + msg.payload.direction
        if (targetIndex < 0) break  // 첫 단어에서 이전 — 아무 것도 안 함
        clearAutoplayTimeout()
        Speech.stop()
        if (targetIndex >= session.words.length) {
          // 마지막 단어에서 다음 — 자연 종료와 동일하게 처리
          sendToWeb({ type: 'AUTOPLAY_FINISHED' })
          setKeepAlivePlaying(false)
          keepAlivePlayer.setActiveForLockScreen(false)
          autoplayRef.current = null
          break
        }
        session.index = targetIndex
        session.paused = false
        session.gen += 1
        setKeepAlivePlaying(true)
        speakAutoplayWord(session.gen)
        break
      }

      case 'AUTOPLAY_STOP':
        clearAutoplayTimeout()
        Speech.stop()
        if (autoplayRef.current) autoplayRef.current.gen += 1
        autoplayRef.current = null
        setKeepAlivePlaying(false)
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
