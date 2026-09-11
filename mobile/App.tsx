import { useRef, useEffect, useState } from 'react'
import { StyleSheet, View, Platform, AppState, Linking } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native'
import WebView, { WebViewMessageEvent } from 'react-native-webview'
import * as Notifications from 'expo-notifications'
import * as Speech from 'expo-speech'
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync, requestNotificationPermissionsAsync } from 'expo-audio'
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition'
import Constants from 'expo-constants'
import type { BridgeOutbound, BridgeInbound, AutoplaySpeechSegment } from './src/types/bridge'

// 자동재생 세션 상태 — 화면 잠금/백그라운드에서도 이어지도록 웹뷰가 아닌 이 RN JS 스레드가
// 시퀀싱을 전담한다(docs/DECISION_LOG.md 참고). gen은 seek/pause/stop이 재생 도중 끼어들 때
// 이전에 예약된 onDone/setTimeout 콜백이 뒤늦게 실행되는 걸 막기 위한 세대 값이다. words[i]는
// i번째 단어에서 순서대로 읽을 세그먼트 목록(단어→뜻→설명→예문, 세그먼트마다 언어가 다를 수 있음).
interface AutoplaySession {
  words: AutoplaySpeechSegment[][]
  gapMs: number
  index: number
  paused: boolean
  gen: number
  rate: number
}

// 한 단어 안에서 세그먼트(단어→뜻→설명→예문) 사이의 짧은 틈. 단어와 단어 사이의 gapMs보다 짧다.
const SEGMENT_GAP_MS = 350

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

// Universal Links(iOS)/App Links(Android)로 들어오는 딥링크 중 실제로 처리할 경로만 허용한다
// (docs/DECISION_LOG.md 2026-09-11 — Master 초대/비밀번호 재설정 메일 링크가 앱과 분리돼 있던 문제
// 해결). apple-app-site-association/assetlinks.json에도 이 두 경로만 등록돼 있다
// (web/public/.well-known/). 그 외 경로는 무시하고 기본 WEB_APP_URL을 그대로 쓴다 — OS가 검증한
// 도메인이라도 방어적으로 한 번 더 걸러낸다.
const DEEPLINK_PATHS = ['/master/accept', '/reset-password']

function resolveDeepLinkUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!DEEPLINK_PATHS.some((p) => parsed.pathname.startsWith(p))) return null
    // WebView는 항상 WEB_APP_URL(운영/개발 호스트)로 접속해야 하므로, 실제 이동은 origin은
    // WEB_APP_URL로 고정하고 경로+쿼리+해시(재설정 토큰이 해시로 옴)만 가져온다.
    return `${WEB_APP_URL}${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

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
  const [webUri, setWebUri] = useState(WEB_APP_URL)

  // Universal Links(iOS)/App Links(Android)로 Master 초대·비밀번호 재설정 메일 링크를 탭하면
  // OS가 앱을 직접 열어주는데, 그 진입 URL을 WebView에 반영해야 실제로 해당 화면(recovery 세션
  // 포함)으로 이동한다 — 안 하면 WebView는 항상 WEB_APP_URL(홈)만 로드해서 링크를 그냥 버리게 된다.
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      const resolved = resolveDeepLinkUrl(url)
      if (resolved) setWebUri(resolved)
    })
    const sub = Linking.addEventListener('url', ({ url }) => {
      const resolved = resolveDeepLinkUrl(url)
      if (resolved) setWebUri(resolved)
    })
    return () => sub.remove()
  }, [])

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
    // 안드로이드 8.0+(API 26+)는 채널이 있어야 알림을 표시할 수 있고, 안드로이드 13+에서는
    // 채널이 최소 1개 존재해야 시스템 권한 프롬프트 자체가 뜬다(expo-notifications 공식 문서) —
    // 채널 없이 requestPermissionsAsync()만 호출하면 프롬프트가 아예 안 뜨고 조용히 거부 상태로
    // 남을 수 있다. 그래서 반드시 권한 요청보다 먼저 채널을 만든다(iOS는 이 호출 자체가 무해한 no-op).
    const setupNotifications = async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: '일정 알림',
          importance: Notifications.AndroidImportance.MAX,
        })
      }
      // 결과를 웹에 알려줘서(REQUEST_PERMISSION 응답을 기다리지 않고도) 알림 권한이 거부된 경우
      // 설정 화면에서 안내 배너를 띄울 수 있게 한다 — 이 요청 자체는 앱 최초 실행 시 딱 한 번만
      // 시스템 프롬프트를 띄우고, 사용자가 거부하면 이후로는 재요청해도 프롬프트가 다시 안 뜬다
      // (iOS/Android 공통 정책) — 그래서 "권한 없음"을 사용자에게 보여주는 게 유일한 대응 수단이다.
      const { granted } = await Notifications.requestPermissionsAsync()
      sendToWeb({ type: 'PERMISSION_RESULT', payload: { permission: 'notifications', granted } })
    }
    setupNotifications()
    // docs/launch/PHASE1_POLICY.md §10 2단계 — 1차 빌드는 RevenueCat SDK 자체를 포함하지 않는다
    // (react-native-purchases 제거, git 이력으로만 보존, 2차에 커밋 되돌리기).
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
    speakSegment(session.words[session.index], 0, gen)
  }

  // 한 단어의 세그먼트(단어→뜻→설명→예문)를 순서대로 읽고, 전부 끝나면 gapMs만큼 쉰 뒤 다음
  // 단어로 넘어간다.
  function speakSegment(segments: AutoplaySpeechSegment[], segIndex: number, gen: number) {
    const session = autoplayRef.current
    if (!session || session.paused || session.gen !== gen) return

    if (segIndex >= segments.length) {
      clearAutoplayTimeout()
      autoplayTimeoutRef.current = setTimeout(() => {
        if (!autoplayRef.current || autoplayRef.current.paused || autoplayRef.current.gen !== gen) return
        autoplayRef.current.index += 1
        speakAutoplayWord(gen)
      }, session.gapMs)
      return
    }

    let advanced = false
    const advanceOnce = () => {
      if (advanced) return
      advanced = true
      if (!autoplayRef.current || autoplayRef.current.paused || autoplayRef.current.gen !== gen) return
      clearAutoplayTimeout()
      autoplayTimeoutRef.current = setTimeout(() => {
        if (!autoplayRef.current || autoplayRef.current.paused || autoplayRef.current.gen !== gen) return
        speakSegment(segments, segIndex + 1, gen)
      }, SEGMENT_GAP_MS)
    }

    const segment = segments[segIndex]
    Speech.speak(segment.text, {
      language: segment.lang,
      rate: session.rate,
      onDone: advanceOnce,
      onError: advanceOnce,
    })

    // expo-speech의 onDone/onError가 일부 기기·언어 조합에서 아예 안 불리는 경우가 있어(실기기에서
    // "다음으로 자동 진행이 안 된다" 버그로 확인됨) — 예상 재생 시간이 지나도 콜백이 없으면
    // 안전장치로 강제 진행시킨다. 콜백이 정상적으로 먼저 오면 advanced 플래그가 중복 실행을 막는다.
    // 배속이 느릴수록 실제 재생 시간이 길어지므로 rate로 나눠 보정한다.
    const estimatedMs = Math.max(2500, segment.text.length * 220) / session.rate
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
              ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
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
          // continuous 모드에서는 말하다 잠깐 멈출 때마다 isFinal이 여러 번 올 수 있어 여기서
          // 구독을 끊지 않는다 — 실제 종료는 사용자가 손을 뗄 때(STOP_STT)만 처리한다.
        })
        const errorSub = ExpoSpeechRecognitionModule.addListener('error', () => {
          sendToWeb({ type: 'STT_RESULT', payload: { transcript: '', final: true } })
          sttSubs.current.forEach((s) => s.remove())
          sttSubs.current = []
        })
        sttSubs.current = [resultSub, errorSub]
        // continuous: true — 탭해서 시작, 다시 탭하면(STOP_STT) 종료하는 방식이라 무음 감지로
        // 중간에 자동 종료되면 안 된다(사용자가 직접 멈출 때까지 듣는다).
        // interimResults: true — false로 두면 iOS에서 "final 결과는 인식 세션이 완전히 끝난
        // 뒤에만 온다"는 제약 때문에 화면에 아무 반응 없이 응답이 안 채워지는 버그가 있었다.
        ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: true })
        break
      }

      case 'STOP_STT':
        ExpoSpeechRecognitionModule.stop()
        // 구독은 여기서 바로 끊지 않는다 — stop() 직후에도 방금까지 말한 마지막 구간의 결과가
        // 비동기로 한 번 더 도착할 수 있어, 그걸 받을 수 있게 둔다(다음 START_STT 때 정리됨).
        break

      case 'GET_APP_VERSION': {
        const version = Constants.expoConfig?.version ?? '1.0.0'
        sendToWeb({ type: 'APP_VERSION', payload: { version } })
        break
      }

      // SET_USER_ID/PURCHASE_REQUEST/RESTORE_PURCHASES — docs/launch/PHASE1_POLICY.md §10 2단계.
      // RevenueCat SDK를 1차 빌드에서 제거하면서 네이티브 처리도 함께 제거했다(웹 쪽
      // web/src/types/bridge.ts, web/src/bridge/index.ts의 타입/함수는 2차 재연동을 위해 보존).
      // 웹은 여전히 이 메시지들을 보낼 수 있으나(PricingPage 등), 1차엔 응답이 오지 않는다 — 단,
      // 1차 UI에서는 가격/구독 화면 자체를 노출하지 않으므로 실제로 호출되지 않는다.

      case 'AUTOPLAY_START': {
        const { words, gapMs, startIndex, rate } = msg.payload
        clearAutoplayTimeout()
        Speech.stop()
        const gen = (autoplayRef.current?.gen ?? 0) + 1
        autoplayRef.current = { words, gapMs, index: startIndex, paused: false, gen, rate }
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
        // artworkUrl은 원격 URL만 공식 문서에 나와 있고 로컬 번들 에셋(file://) 사용은
        // 문서화돼 있지 않아(실기기 검증도 불가한 환경) 안전하게 배포된 웹 앱의 정적 파일을
        // 그대로 가리킨다 — web/public/symbol-artwork.png(symbol.svg를 PNG로 변환한 것,
        // OS 락스크린/미디어 아트워크는 SVG를 지원하지 않는다). WEB_APP_URL이 이미 dev/prod를
        // 구분해주므로 그대로 재사용한다.
        keepAlivePlayer.setActiveForLockScreen(true, {
          title: 'Moroutine',
          artist: '자동재생 중',
          artworkUrl: `${WEB_APP_URL}/symbol-artwork.png`,
        })
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

      case 'AUTOPLAY_SET_RATE':
        // 지금 말하는 중인 세그먼트는 그대로 두고, 다음 세그먼트부터 새 배속을 적용한다.
        if (autoplayRef.current) autoplayRef.current.rate = msg.payload.rate
        break

      case 'AUTOPLAY_STEP': {
        // 다음/이전은 순환한다 — 마지막에서 다음은 첫 단어로, 첫 단어에서 이전은 마지막으로
        // (재생이 끝까지 자동 진행되어 자연 종료되는 것과는 별개 동작이다).
        const session = autoplayRef.current
        if (!session || session.words.length === 0) break
        const count = session.words.length
        const targetIndex = (session.index + msg.payload.direction + count) % count
        clearAutoplayTimeout()
        Speech.stop()
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
          source={{ uri: webUri }}
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
