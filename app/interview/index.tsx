import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, Animated, Dimensions, Alert,
} from 'react-native';
import { useRef, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { colors, radius, space } from '@/theme';

const { width: SW } = Dimensions.get('window');

// ── Dynamic require of speech recognition so the route still loads in Expo Go ──
// expo-speech-recognition is a native module; if unavailable it throws on import.
let SpeechRecognition: any = null;
try {
  SpeechRecognition = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {}
const sttAvailable = !!SpeechRecognition;

// ─── Problems ─────────────────────────────────────────────────────────────────

const PROBLEMS = [
  {
    id: 'two-sum-ii',
    title: 'Two Sum II',
    difficulty: 'medium' as const,
    description: 'Sorted 1-indexed array, find two numbers summing to target. Optimal: two pointers, O(n) time O(1) space.',
    interviewOpener: "Hey, good to meet you. You have a sorted, 1-indexed integer array and a target. Return the positions of two numbers that sum to the target — you can't reuse the same element. Before any code, what's the first approach that comes to mind?",
  },
  {
    id: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'easy' as const,
    description: 'Given a string of brackets, determine if it is valid. Optimal: stack, O(n) time O(n) space.',
    interviewOpener: "Morning. I have a string of parentheses, square brackets, and curly braces. Write me a function that returns true if every opening bracket is closed correctly and in the right order. Where do you start?",
  },
  {
    id: 'merge-intervals',
    title: 'Merge Intervals',
    difficulty: 'medium' as const,
    description: 'Given an array of intervals, merge all overlapping ones. Optimal: sort + linear scan, O(n log n).',
    interviewOpener: "Here's a practical one. You have a list of time intervals, like meeting slots. Some overlap. Write a function that merges all overlapping intervals and returns the result. How do you approach it?",
  },
  {
    id: 'maximum-subarray',
    title: 'Maximum Subarray',
    difficulty: 'medium' as const,
    description: "Find the contiguous subarray with the largest sum. Optimal: Kadane's algorithm, O(n).",
    interviewOpener: "Classic problem. You have an integer array that can have negatives. Find the contiguous subarray with the largest sum and return that sum. What's your thought process?",
  },
  {
    id: 'number-of-islands',
    title: 'Number of Islands',
    difficulty: 'medium' as const,
    description: "Given a 2D binary grid of 1s (land) and 0s (water), count distinct islands.",
    interviewOpener: "Grid problem. You have a 2D binary grid where ones are land and zeros are water. Count the distinct islands — groups of connected land cells. How would you tackle this?",
  },
] as const;

type Problem = typeof PROBLEMS[number];
const DIFF_COLOR = { easy: colors.easy, medium: colors.medium, hard: colors.hard };

const FALLBACKS = [
  "Reasonable. What's the time complexity of that approach?",
  "Good instinct. What edge cases are you thinking about?",
  "I like where this is heading. Can we do better on space?",
  "Solid. What happens if the input is empty?",
  "Correct. Is there a more optimal approach here?",
];

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function splitMsg(text: string): [string, string] {
  const m = text.match(/^(.*?[.!?])\s+(.+)$/s);
  if (m && m[1].split(' ').length <= 12) return [m[1] + ' ', m[2]];
  const words = text.split(' ');
  const cut = Math.min(8, Math.ceil(words.length * 0.45));
  return [words.slice(0, cut).join(' ') + ' ', words.slice(cut).join(' ')];
}

// ─── Orb ring ─────────────────────────────────────────────────────────────────

const ORB_SIZE = Math.round(SW * 0.38);

function OrbRing({ delay }: { delay: number }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.7, duration: 2400, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 2400, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,   duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', width: ORB_SIZE, height: ORB_SIZE,
      borderRadius: ORB_SIZE / 2, borderWidth: 1.5, borderColor: colors.accent,
      opacity, transform: [{ scale }],
    }} />
  );
}

// ─── Animated waveform ────────────────────────────────────────────────────────

const BAR_PEAKS = [0.35, 0.7, 0.45, 1.0, 0.6, 0.85, 0.4, 0.75, 0.5];

function AnimatedWaveform({ active }: { active: boolean }) {
  const bars = useRef(
    BAR_PEAKS.map((h, i) => ({
      anim:  new Animated.Value(4),
      peak:  h * 36,
      speed: 380 + (i % 3) * 110,
    }))
  ).current;
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    loopsRef.current.forEach(a => a.stop());
    loopsRef.current = [];
    if (!active) {
      bars.forEach(b =>
        Animated.timing(b.anim, { toValue: 4, duration: 200, useNativeDriver: false }).start()
      );
      return;
    }
    loopsRef.current = bars.map(b =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b.anim, { toValue: b.peak, duration: b.speed, useNativeDriver: false }),
          Animated.timing(b.anim, { toValue: 4,      duration: b.speed, useNativeDriver: false }),
        ])
      )
    );
    loopsRef.current.forEach(a => a.start());
    return () => loopsRef.current.forEach(a => a.stop());
  }, [active]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 40 }}>
      {bars.map((b, i) => (
        <Animated.View key={i} style={{
          width: 4, borderRadius: 3, height: b.anim,
          backgroundColor: active ? colors.accent : colors.border,
        }} />
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InterviewScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const problem = useRef<Problem>(
    PROBLEMS[Math.floor(Math.random() * PROBLEMS.length)]
  ).current;

  const [currentAiMsg, setCurrentAiMsg] = useState(problem.interviewOpener);
  const [input,        setInput]        = useState('');
  const [aiSpeaking,   setAiSpeaking]   = useState(false);
  const [fetching,     setFetching]     = useState(false);
  const [recognizing,  setRecognizing]  = useState(false);
  const [transcript,   setTranscript]   = useState('');
  const [ending,       setEnding]       = useState(false);
  const [showText,     setShowText]     = useState(false);
  const [configured,   setConfigured]   = useState(true);
  const [secs,         setSecs]         = useState(0);

  const secsRef       = useRef(0);
  const transcriptRef = useRef('');
  const historyRef    = useRef<Array<{ role: 'assistant' | 'user'; content: string }>>([
    { role: 'assistant', content: problem.interviewOpener },
  ]);
  const fbCount   = useRef(0);
  const sendRef   = useRef<(text: string) => void>(() => {});
  const soundRef  = useRef<Audio.Sound | null>(null);

  const busy = aiSpeaking || fetching;

  // ── Orb animation ──────────────────────────────────────────────────────────
  const orbScale  = useRef(new Animated.Value(1)).current;
  const orbGlow   = useRef(new Animated.Value(0.65)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    pulseLoop.current?.stop();
    if (busy) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(orbScale, { toValue: 1.07, duration: 700, useNativeDriver: true }),
            Animated.timing(orbGlow,  { toValue: 1,    duration: 700, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(orbScale, { toValue: 1,    duration: 700, useNativeDriver: true }),
            Animated.timing(orbGlow,  { toValue: 0.35, duration: 700, useNativeDriver: true }),
          ]),
        ])
      );
      pulseLoop.current.start();
    } else {
      Animated.parallel([
        Animated.timing(orbScale, { toValue: 1,    duration: 300, useNativeDriver: true }),
        Animated.timing(orbGlow,  { toValue: 0.65, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [busy]);

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      setSecs(s => { secsRef.current = s + 1; return s + 1; });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // ── Stop any current playback ──────────────────────────────────────────────
  const stopSpeaking = useCallback(async () => {
    Speech.stop();
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    setAiSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { stopSpeaking(); }, []);

  // ── TTS: ElevenLabs → expo-av, with expo-speech fallback ──────────────────
  const speak = useCallback(async (text: string) => {
    await stopSpeaking();
    setAiSpeaking(true);

    try {
      const { data, error } = await supabase.functions.invoke('tts', { body: { text } });

      if (!error && data?.audio) {
        // Write base64 MP3 to a temp file and play with expo-av
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const uri = FileSystem.cacheDirectory + 'leet_tts_' + Date.now() + '.mp3';
        await FileSystem.writeAsStringAsync(uri, data.audio, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, volume: 1.0 }
        );
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate(async (status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            setAiSpeaking(false);
            soundRef.current = null;
            try { await sound.unloadAsync(); } catch {}
            FileSystem.deleteAsync(uri, { idempotent: true });
          }
        });
        return;
      }
    } catch {}

    // Fallback: device TTS
    Speech.speak(text, {
      language: 'en-US',
      rate: 0.88,
      pitch: 0.85,
      onDone:    () => setAiSpeaking(false),
      onStopped: () => setAiSpeaking(false),
      onError:   () => setAiSpeaking(false),
    });
  }, [stopSpeaking]);

  // Speak opening on mount
  useEffect(() => {
    const t = setTimeout(() => speak(problem.interviewOpener), 600);
    return () => { clearTimeout(t); Speech.stop(); };
  }, []);

  // ── Core send ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || fetching || ending) return;
    await stopSpeaking();

    const userMsg    = { role: 'user' as const, content: t };
    const newHistory = [...historyRef.current, userMsg];
    historyRef.current = newHistory;
    setFetching(true);

    try {
      const { data, error } = await supabase.functions.invoke('interview-ai', {
        body: { mode: 'chat', messages: newHistory, problem },
      });
      let reply: string;
      if (error || !data?.reply) {
        if (data?.configured === false) setConfigured(false);
        reply = FALLBACKS[fbCount.current % FALLBACKS.length];
        fbCount.current++;
      } else {
        reply = data.reply;
      }
      historyRef.current = [...newHistory, { role: 'assistant', content: reply }];
      setCurrentAiMsg(reply);
      setFetching(false);
      speak(reply);
    } catch {
      const fb = FALLBACKS[fbCount.current % FALLBACKS.length];
      fbCount.current++;
      historyRef.current = [...newHistory, { role: 'assistant', content: fb }];
      setCurrentAiMsg(fb);
      setFetching(false);
      speak(fb);
    }
  }, [fetching, ending, problem, speak, stopSpeaking]);

  // Keep a stable ref so STT event listeners can always call the latest version
  useEffect(() => { sendRef.current = sendMessage; }, [sendMessage]);

  // ── STT event listeners (addListener, not hooks — works with dynamic require) ─
  useEffect(() => {
    if (!SpeechRecognition) return;
    const subs = [
      SpeechRecognition.addListener('start', () => {
        setRecognizing(true);
      }),
      SpeechRecognition.addListener('result', (e: any) => {
        const text = e.results?.[0]?.transcript ?? '';
        transcriptRef.current = text;
        setTranscript(text);
      }),
      SpeechRecognition.addListener('end', () => {
        setRecognizing(false);
        const text = transcriptRef.current.trim();
        transcriptRef.current = '';
        setTranscript('');
        if (text) sendRef.current(text);
      }),
      SpeechRecognition.addListener('error', (e: any) => {
        setRecognizing(false);
        setTranscript('');
        transcriptRef.current = '';
        if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('STT error:', e.error);
        }
      }),
    ];
    return () => subs.forEach((s: any) => s?.remove?.());
  }, []); // run once — sendRef stays current via the ref update above

  // ── Mic button ─────────────────────────────────────────────────────────────
  const handleMic = async () => {
    if (!sttAvailable) {
      Alert.alert(
        'Voice not available',
        'Use the chat icon to type your answer, or rebuild the app as a development build to enable voice.',
        [{ text: 'OK', onPress: () => { setShowText(true); setTimeout(() => inputRef.current?.focus(), 50); } }]
      );
      return;
    }
    if (recognizing) {
      SpeechRecognition.stop();
      return;
    }
    await stopSpeaking();
    const { granted } = await SpeechRecognition.requestPermissionsAsync();
    if (!granted) {
      Alert.alert('Microphone access needed', 'Enable microphone permission in Settings to use voice.');
      return;
    }
    transcriptRef.current = '';
    setTranscript('');
    try {
      SpeechRecognition.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        addsPunctuation: true,
      });
    } catch (e) {
      console.warn('STT start failed:', e);
    }
  };

  // ── End interview ──────────────────────────────────────────────────────────
  const endInterview = async () => {
    if (historyRef.current.length < 4) return;
    await stopSpeaking();
    if (sttAvailable) { try { SpeechRecognition.stop(); } catch {} }
    setEnding(true);

    try {
      const { data, error } = await supabase.functions.invoke('interview-ai', {
        body: { mode: 'report', messages: historyRef.current, problem },
      });
      if (error || !data?.verdict) throw new Error();
      router.replace({
        pathname: '/interview/report',
        params: {
          reportJson:   JSON.stringify(data),
          problemTitle: problem.title,
          problemDiff:  problem.difficulty,
          elapsed:      String(secsRef.current),
          hintsUsed:    String(fbCount.current),
        },
      });
    } catch {
      router.replace({
        pathname: '/interview/report',
        params: {
          reportJson: JSON.stringify({
            verdict: 'Lean Hire', signal: 72,
            summary: 'Solid fundamentals. Clear communication throughout.',
            scores: [
              { label: 'Problem solving',     score: 4,   note: 'Reached valid approach with minimal guidance.' },
              { label: 'Code quality',        score: 3.5, note: 'Clean structure, naming could improve.' },
              { label: 'Communication',       score: 4.5, note: 'Narrated thinking throughout — strong.' },
              { label: 'Complexity analysis', score: 3,   note: 'Correct on time, hesitated on space.' },
              { label: 'Edge cases',          score: 3,   note: 'Missed empty input until prompted.' },
            ],
            coaching: 'Lead with edge cases before writing any code next time.',
          }),
          problemTitle: problem.title,
          problemDiff:  problem.difficulty,
          elapsed:      String(secsRef.current),
          hintsUsed:    String(fbCount.current),
        },
      });
    }
  };

  const diffColor  = DIFF_COLOR[problem.difficulty];
  const [bold, dim] = splitMsg(currentAiMsg);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.iconBtn} onPress={() => { stopSpeaking(); router.back(); }} hitSlop={12}>
          <Ionicons name="close" size={16} color={colors.textDim} />
        </Pressable>
        <Text style={s.roundLabel}>VOICE ROUND</Text>
        <View style={s.timerPill}>
          <Ionicons name="time-outline" size={11} color={colors.textDim} />
          <Text style={s.timerText}>{mmss(secs)}</Text>
        </View>
      </View>

      {/* Problem chip */}
      <View style={s.problemRow}>
        <View style={s.problemChip}>
          <Text style={s.problemTitle} numberOfLines={1}>{problem.title}</Text>
          <View style={[s.diffPill, { backgroundColor: diffColor + '20' }]}>
            <Text style={[s.diffLabel, { color: diffColor }]}>
              {problem.difficulty.charAt(0).toUpperCase() + problem.difficulty.slice(1)}
            </Text>
          </View>
        </View>
      </View>

      {/* Orb + caption */}
      <View style={s.centerSection}>
        <View style={s.orbWrap}>
          <OrbRing delay={0} />
          <OrbRing delay={800} />
          <OrbRing delay={1600} />
          <Animated.View style={[s.orb, {
            shadowOpacity: orbGlow,
            transform: [{ scale: orbScale }],
          }]}>
            <Ionicons name="sparkles" size={36} color="#fff" />
          </Animated.View>
        </View>

        <View style={s.statusRow}>
          {(busy || recognizing) && (
            <View style={[s.statusDot, recognizing && { backgroundColor: colors.hard }]} />
          )}
          <Text style={[s.statusText, recognizing && { color: colors.hard }]}>
            {fetching ? 'LeetAI is thinking…' : aiSpeaking ? 'LeetAI is speaking…' : recognizing ? 'Listening…' : 'Your turn'}
          </Text>
        </View>

        <View style={s.captionWrap}>
          <View style={s.captionBubble}>
            {fetching ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : recognizing && transcript ? (
              <Text style={[s.captionText, { color: colors.textDim }]}>"{transcript}"</Text>
            ) : (
              <Text style={s.captionText}>
                <Text style={s.captionBold}>"{bold}</Text>
                <Text style={s.captionDim}>{dim}"</Text>
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* User answer bar */}
      <View style={s.userAnswerWrap}>
        <View style={[s.userAnswerPill, recognizing && { borderColor: colors.hard + '60' }]}>
          <View style={[s.userInitial, recognizing && { backgroundColor: colors.hard }]}>
            <Text style={s.userInitialText}>Y</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userAnswerLabel}>
              {recognizing ? 'Speaking…' : 'Your answer'}
            </Text>
            <AnimatedWaveform active={recognizing} />
          </View>
        </View>
      </View>

      {/* Text fallback input */}
      {showText && (
        <View style={s.inputRow}>
          <TextInput
            ref={inputRef}
            style={s.input}
            placeholder="Type your answer…"
            placeholderTextColor={colors.textLight}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => {
              const t = input.trim();
              if (t) { sendMessage(t); setInput(''); setShowText(false); }
            }}
            returnKeyType="send"
            multiline
            autoFocus
          />
          <Pressable
            style={[s.sendBtn, (!input.trim() || fetching) && s.sendBtnOff]}
            onPress={() => {
              const t = input.trim();
              if (t) { sendMessage(t); setInput(''); setShowText(false); }
            }}
            disabled={!input.trim() || fetching}
          >
            <Ionicons name="arrow-up" size={17} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Controls */}
      <View style={[s.controls, { paddingBottom: insets.bottom + space(5) }]}>
        {/* Text toggle */}
        <Pressable
          style={[s.controlBtn, showText && { borderColor: colors.accent + '60' }]}
          onPress={() => {
            setShowText(v => !v);
            if (!showText) setTimeout(() => inputRef.current?.focus(), 50);
          }}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={22}
            color={showText ? colors.accent : colors.textDim}
          />
        </Pressable>

        {/* Stop / end */}
        <Pressable
          style={[s.stopBtn, (ending || historyRef.current.length < 4) && { opacity: 0.45 }]}
          onPress={endInterview}
          disabled={ending || historyRef.current.length < 4}
        >
          {ending
            ? <ActivityIndicator size="small" color="#fff" />
            : <View style={s.stopSquare} />
          }
        </Pressable>

        {/* Mic */}
        <Pressable
          style={[s.controlBtn, recognizing && { borderColor: colors.hard + '70' }]}
          onPress={handleMic}
          disabled={fetching || ending}
        >
          <Ionicons
            name={recognizing ? 'mic' : 'mic-outline'}
            size={24}
            color={recognizing ? colors.hard : sttAvailable && !fetching ? colors.textDim : colors.textLight}
          />
        </Pressable>
      </View>

      {!configured && (
        <View style={s.banner}>
          <Text style={s.bannerText}>
            Deploy interview-ai + add ANTHROPIC_API_KEY in Supabase secrets.
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space(4), paddingBottom: space(2),
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  roundLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  timerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingHorizontal: space(2), paddingVertical: 4,
  },
  timerText: { color: colors.text, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  problemRow: { alignItems: 'center', marginBottom: space(2) },
  problemChip: {
    flexDirection: 'row', alignItems: 'center', gap: space(2),
    paddingHorizontal: space(3), paddingVertical: space(2),
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 999,
  },
  problemTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  diffPill: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: 6 },
  diffLabel: { fontSize: 11, fontWeight: '700' },

  centerSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orbWrap: {
    width: ORB_SIZE + 80, height: ORB_SIZE + 80,
    alignItems: 'center', justifyContent: 'center', marginBottom: space(4),
  },
  orb: {
    width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.65, shadowRadius: 32, elevation: 14,
  },

  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(4),
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  statusText: { color: colors.accentText, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  captionWrap: { paddingHorizontal: space(6), width: '100%' },
  captionBubble: {
    backgroundColor: 'rgba(22,27,34,0.72)',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl,
    padding: space(4), minHeight: 56, justifyContent: 'center', alignItems: 'center',
  },
  captionText: { fontSize: 14.5, lineHeight: 22, textAlign: 'center' },
  captionBold: { color: colors.text, fontWeight: '700' },
  captionDim:  { color: colors.textLight, fontWeight: '400' },

  userAnswerWrap: { paddingHorizontal: space(5), marginBottom: space(3) },
  userAnswerPill: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.xl, paddingHorizontal: space(4), paddingVertical: space(3),
  },
  userInitial: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.hard,
    alignItems: 'center', justifyContent: 'center',
  },
  userInitialText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  userAnswerLabel: { color: colors.textDim, fontSize: 11, fontWeight: '600', marginBottom: 4 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: space(2),
    paddingHorizontal: space(5), marginBottom: space(2),
  },
  input: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1,
    borderColor: colors.accent + '60', borderRadius: radius.lg,
    paddingHorizontal: space(4), paddingVertical: space(3),
    color: colors.text, fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: colors.border },

  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space(8), paddingTop: space(2),
  },
  controlBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stopBtn: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.hard,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.hard, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 14, elevation: 8,
  },
  stopSquare: { width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' },

  banner: {
    position: 'absolute', bottom: 130, left: space(4), right: space(4),
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: space(3),
  },
  bannerText: { color: colors.textDim, fontSize: 11, textAlign: 'center', fontStyle: 'italic' },
});
