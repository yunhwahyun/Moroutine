import { useState, useCallback, useEffect } from 'react'
import type { QuizWord, QuizMode } from '@/types'
import ProgressBar from './ProgressBar'
import AnswerOptions from './AnswerOptions'
import AnswerReveal from './AnswerReveal'
import { BackIcon, CloseIcon, SpeakerIcon, MicIcon } from '@/components/icons'
import { useTTS } from '@/hooks/useTTS'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { useSettingsStore } from '@/stores/settingsStore'

interface Props {
  words: QuizWord[]
  initialMode?: QuizMode
  sessionLanguage?: string
  onComplete: (correctCount: number, total: number) => void
  onClose: () => void
  onWordAnswered?: (wordId: string, isCorrect: boolean) => void
}

type Phase = 'question' | 'revealed'

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/[.,!?]/g, '')
}

export default function Quiz({ words, initialMode = 'multiple_choice', onComplete, onClose, onWordAnswered }: Props) {
  const { speak, isSupported: ttsSupported } = useTTS()
  const { supported: sttSupported, listening, transcript, start: startSTT, stop: stopSTT } = useSpeechRecognition()
  const shortAnswerInput = useSettingsStore((s) => s.settings.shortAnswerInput)

  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<QuizMode>(initialMode)
  const [phase, setPhase] = useState<Phase>('question')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shortInput, setShortInput] = useState('')
  const [correctCount, setCorrectCount] = useState(0)

  // 음성 인식 결과 → 입력창 자동 반영
  useEffect(() => {
    if (transcript) setShortInput(transcript)
  }, [transcript])

  const word = words[index]
  if (!word) return null

  const correctOption = { id: word.id, definition: word.definition }
  const options =
    mode === 'multiple_choice'
      ? shuffle([correctOption, ...word.distractors]).slice(0, 4)
      : []

  const correctId = word.id
  const isLast = index === words.length - 1

  const handleSelectMultiple = useCallback(
    (id: string) => {
      if (phase !== 'question') return
      setSelectedId(id)
      const correct = id === correctId
      if (correct) setCorrectCount((c) => c + 1)
      setPhase('revealed')
      onWordAnswered?.(word.id, correct)
    },
    [phase, correctId, word.id, onWordAnswered],
  )

  const handleSubmitShort = useCallback(() => {
    if (phase !== 'question') return
    if (listening) stopSTT()
    const correct = normalize(shortInput) === normalize(word.term)
    setSelectedId(correctId)
    if (correct) setCorrectCount((c) => c + 1)
    setPhase('revealed')
    onWordAnswered?.(word.id, correct)
  }, [phase, shortInput, word.term, word.id, correctId, onWordAnswered, listening, stopSTT])

  const handleNext = useCallback(() => {
    setIndex((i) => i + 1)
    setPhase('question')
    setSelectedId(null)
    setShortInput('')
  }, [])

  const handleComplete = useCallback(() => {
    onComplete(correctCount, words.length)
  }, [correctCount, words.length, onComplete])

  const isCorrectAnswer = phase === 'revealed' && selectedId === correctId

  const showKeyboard = mode === 'short_answer' && (shortAnswerInput === 'keyboard' || shortAnswerInput === 'both')
  const showMic = mode === 'short_answer' && sttSupported && (shortAnswerInput === 'voice' || shortAnswerInput === 'both')

  return (
    <div className="flex flex-col min-h-dvh bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onClose} className="p-1 -ml-1 text-gray-900">
            <BackIcon size={24} />
          </button>
          <span className="text-sm text-gray-500">
            {index + 1} / {words.length}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{Math.round(((index + 1) / words.length) * 100)}%</span>
            <button onClick={onClose} className="p-1 -mr-1 text-gray-400">
              <CloseIcon />
            </button>
          </div>
        </div>
        <ProgressBar current={index + 1} total={words.length} />
      </div>

      {/* Mode toggle */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-gray-500">단어 뜻 맞추기</span>
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {(['multiple_choice', 'short_answer'] as QuizMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setPhase('question'); setSelectedId(null); setShortInput('') }}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {m === 'multiple_choice' ? '객관식' : '주관식'}
            </button>
          ))}
        </div>
      </div>

      {/* Word card */}
      <div className="px-4 mb-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm text-center">
          {mode === 'short_answer' ? (
            <>
              <p className="text-xs text-gray-400 mb-2">뜻</p>
              <p className="text-xl font-bold text-gray-900 leading-snug">{word.definition}</p>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-2">영어</p>
              <p className="text-3xl font-bold text-gray-900 tracking-tight">{word.term}</p>
              {ttsSupported && (
                <button
                  onClick={() => speak(word.term)}
                  className="mt-3 flex items-center gap-1.5 mx-auto text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors text-sm"
                  aria-label="발음 듣기"
                >
                  <SpeakerIcon size={16} />
                  <span>발음 듣기</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Answer area */}
      <div className="flex-1 px-4 flex flex-col gap-4">
        {phase === 'revealed' && (
          <AnswerReveal
            isCorrect={isCorrectAnswer}
            correctDefinition={mode === 'short_answer' ? word.term : word.definition}
            description={word.description}
            onSpeak={ttsSupported ? () => speak(word.term) : undefined}
          />
        )}

        {mode === 'multiple_choice' ? (
          <AnswerOptions
            options={options}
            selectedId={selectedId}
            correctId={phase === 'revealed' ? correctId : null}
            onSelect={handleSelectMultiple}
            disabled={phase === 'revealed'}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* 입력창 + 마이크 */}
            <div className="flex gap-2">
              {showKeyboard && (
                <input
                  type="text"
                  value={shortInput}
                  onChange={(e) => setShortInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && phase === 'question' && shortInput.trim() && handleSubmitShort()}
                  placeholder="답을 입력하세요"
                  disabled={phase === 'revealed'}
                  className="flex-1 border border-gray-200 rounded-lg px-4 py-4 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
                />
              )}
              {showMic && phase === 'question' && (
                <button
                  onClick={listening ? stopSTT : startSTT}
                  className={`flex items-center justify-center w-[56px] rounded-lg border transition-colors ${
                    listening
                      ? 'border-red-400 bg-red-50 text-red-500'
                      : 'border-gray-200 bg-white text-gray-400 hover:text-gray-600'
                  }`}
                  aria-label={listening ? '음성 인식 중지' : '음성 입력 시작'}
                >
                  {listening ? (
                    <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-pulse" />
                  ) : (
                    <MicIcon size={20} />
                  )}
                </button>
              )}
            </div>
            {/* voice-only 모드: 인식된 텍스트 표시 */}
            {!showKeyboard && shortInput && (
              <p className="text-sm text-gray-700 px-1">{shortInput}</p>
            )}
          </div>
        )}
      </div>

      {/* Bottom button */}
      <div className="px-4 pb-8 pt-4">
        {phase === 'question' ? (
          mode === 'multiple_choice' ? (
            <button
              disabled
              className="w-full py-4 rounded-lg bg-gray-100 text-gray-400 text-sm font-medium"
            >
              답을 선택하세요
            </button>
          ) : (
            <button
              onClick={handleSubmitShort}
              disabled={!shortInput.trim()}
              className="w-full py-4 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:bg-gray-100 disabled:text-gray-400"
            >
              정답 확인
            </button>
          )
        ) : isLast ? (
          <button
            onClick={handleComplete}
            className="w-full py-4 rounded-lg bg-gray-900 text-white text-sm font-medium"
          >
            결과 확인하기
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="w-full py-4 rounded-lg bg-gray-900 text-white text-sm font-medium"
          >
            다음 문제
          </button>
        )}
      </div>
    </div>
  )
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}
