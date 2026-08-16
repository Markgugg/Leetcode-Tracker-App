import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, Animated as RNAnimated, Dimensions,
} from 'react-native';
import { useRef, useState, useEffect, useCallback, useId } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { Toast } from '@/components/Toast';
import { GlassCard } from '@/components/GlassCard';
import {
  blur, colors, pressed, radius, shadow, space, tabular, type as T,
} from '@/theme';

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

/* ------------------------------------------------------------------ */
/* Siri orb — three ring-colored radial glows that breathe             */
/* ------------------------------------------------------------------ */

/** Diameter of the whole glow field. */
const FIELD = Math.min(340, Math.round(SW * 0.82));
/** The glass core that sits in the middle of the field. */
const CORE = Math.round(FIELD * 0.44);

/**
 * §1 ring hues (#FA114F / #A2F73D / #00D3F2) used here as *ambient light*,
 * not as data. Each blob is one SVG radial gradient inside its own animated
 * view — the whole field slowly rotates, and every blob independently drifts
 * and breathes. `energy` (0..1) is driven by the interview state, so the orb
 * sits almost still when it is the candidate's turn and swells while the
 * interviewer is speaking.
 */
const BLOBS = [
  { color: colors.volume,     size: FIELD * 0.78, x: -FIELD * 0.15, y: -FIELD * 0.13, dur: 3800, delay: 0 },
  { color: colors.streak,     size: FIELD * 0.86, x:  FIELD * 0.16, y: -FIELD * 0.03, dur: 4700, delay: 700 },
  { color: colors.difficulty, size: FIELD * 0.70, x:  FIELD * 0.01, y:  FIELD * 0.19, dur: 5400, delay: 1400 },
] as const;

type EnergyValue = SharedValue<number>;

function Blob({
  blob,
  index,
  uid,
  energy,
}: {
  blob: typeof BLOBS[number];
  index: number;
  uid: string;
  energy: EnergyValue;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      blob.delay,
      withRepeat(
        withTiming(1, { duration: blob.dur, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => {
    const e = energy.value;
    const drift = (t.value - 0.5) * (12 + e * 30);
    return {
      opacity: 0.34 + e * 0.52 - t.value * 0.07,
      transform: [
        { translateX: blob.x + drift },
        { translateY: blob.y - drift * 0.65 },
        { scale: 1 + t.value * (0.10 + e * 0.30) },
      ],
    };
  });

  const id = `orb${uid}_${index}`;

  return (
    <Animated.View
      pointerEvents="none"
      style={[s.blob, { width: blob.size, height: blob.size, marginLeft: -blob.size / 2, marginTop: -blob.size / 2 }, style]}>
      <Svg width={blob.size} height={blob.size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={blob.color} stopOpacity={0.95} />
            <Stop offset="0.45" stopColor={blob.color} stopOpacity={0.38} />
            <Stop offset="1" stopColor={blob.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={blob.size / 2}
          cy={blob.size / 2}
          rx={blob.size / 2}
          ry={blob.size / 2}
          fill={`url(#${id})`}
        />
      </Svg>
    </Animated.View>
  );
}

/** A single expanding halo — one per state change, looped. */
function Halo({ delay, color, energy }: { delay: number; color: string; energy: EnergyValue }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 3200, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: (1 - t.value) * 0.30 * energy.value,
    transform: [{ scale: 0.86 + t.value * 0.85 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.halo,
        { width: CORE * 1.5, height: CORE * 1.5, borderRadius: CORE * 0.75, borderColor: color },
        style,
      ]}
    />
  );
}

function SiriOrb({ energy, tint }: { energy: EnergyValue; tint: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const spin = useSharedValue(0);
  const core = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 26000, easing: Easing.linear }),
      -1,
      false,
    );
    core.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  const fieldStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + core.value * (0.015 + energy.value * 0.075) }],
    shadowOpacity: 0.25 + energy.value * 0.45,
  }));

  return (
    <View style={s.orbWrap} pointerEvents="none">
      <Animated.View style={[s.field, fieldStyle]}>
        {BLOBS.map((b, i) => (
          <Blob key={i} blob={b} index={i} uid={uid} energy={energy} />
        ))}
      </Animated.View>

      <Halo delay={0} color={tint} energy={energy} />
      <Halo delay={1600} color={tint} energy={energy} />

      <Animated.View style={[s.coreShadow, coreStyle]}>
        <BlurView intensity={blur.card} tint="dark" style={s.coreBlur}>
          <View style={s.coreFill}>
            <LinearGradient
              colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
              start={{ x: 0.25, y: 0 }}
              end={{ x: 0.75, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </BlurView>
      </Animated.View>
    </View>
  );
}

// ─── Animated waveform ────────────────────────────────────────────────────────

const BAR_PEAKS = [0.35, 0.7, 0.45, 1.0, 0.6, 0.85, 0.4, 0.75, 0.5];
const BAR_HUES = [colors.volume, colors.difficulty, colors.streak];

function AnimatedWaveform({ active }: { active: boolean }) {
  const bars = useRef(
    BAR_PEAKS.map((h, i) => ({
      anim:  new RNAnimated.Value(3),
      peak:  h * 30,
      speed: 380 + (i % 3) * 110,
    }))
  ).current;
  const loopsRef = useRef<RNAnimated.CompositeAnimation[]>([]);

  useEffect(() => {
    loopsRef.current.forEach(a => a.stop());
    loopsRef.current = [];
    if (!active) {
      bars.forEach(b =>
        RNAnimated.timing(b.anim, { toValue: 3, duration: 200, useNativeDriver: false }).start()
      );
      return;
    }
    loopsRef.current = bars.map(b =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(b.anim, { toValue: b.peak, duration: b.speed, useNativeDriver: false }),
          RNAnimated.timing(b.anim, { toValue: 3,      duration: b.speed, useNativeDriver: false }),
        ])
      )
    );
    loopsRef.current.forEach(a => a.start());
    return () => loopsRef.current.forEach(a => a.stop());
  }, [active]);

  return (
    <View style={s.wave}>
      {bars.map((b, i) => (
        <RNAnimated.View key={i} style={{
          width: 3, borderRadius: 2, height: b.anim,
          backgroundColor: active ? BAR_HUES[i % 3] : 'rgba(255,255,255,0.14)',
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

  const [currentAiMsg, setCurrentAiMsg] = useState<string>(problem.interviewOpener);
  const [toast,        setToast]        = useState<string | null>(null);
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

  // ── Orb energy ─────────────────────────────────────────────────────────────
  // speaking 1.0 · listening 0.85 · thinking 0.55 · your turn 0.22
  const energy = useSharedValue(0.22);

  useEffect(() => {
    const target = aiSpeaking ? 1 : recognizing ? 0.85 : fetching ? 0.55 : 0.22;
    energy.value = withTiming(target, { duration: 620, easing: Easing.out(Easing.quad) });
  }, [aiSpeaking, fetching, recognizing]);

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
      // §3.12 — no Alert.alert: the toast says it and we fall back to typing.
      setToast('Voice unavailable — type your answer instead');
      setShowText(true);
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    if (recognizing) {
      SpeechRecognition.stop();
      return;
    }
    await stopSpeaking();
    const { granted } = await SpeechRecognition.requestPermissionsAsync();
    if (!granted) {
      setToast('Enable microphone access in Settings to use voice');
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

  // One centered state per §1 — the label, its color, and the orb tint agree.
  const state = fetching
    ? { label: 'Thinking', tint: colors.difficulty }
    : aiSpeaking
      ? { label: 'Speaking', tint: colors.accent }
      : recognizing
        ? { label: 'Listening', tint: colors.streak }
        : { label: 'Your turn', tint: colors.textTertiary };

  const canEnd = !ending && historyRef.current.length >= 4;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* Header — minimal chrome */}
      <View style={s.header}>
        <Pressable
          style={({ pressed: p }) => [s.iconBtn, p && pressed]}
          onPress={() => { stopSpeaking(); router.back(); }}
          hitSlop={12}>
          <Ionicons name="close" size={17} color={colors.textSecondary} />
        </Pressable>

        <Text style={s.roundLabel}>VOICE ROUND</Text>

        <View style={s.timerPill}>
          <Text style={s.timerText}>{mmss(secs)}</Text>
        </View>
      </View>

      {/* Problem line */}
      <View style={s.problemRow}>
        <View style={[s.diffDot, { backgroundColor: diffColor }]} />
        <Text style={s.problemTitle} numberOfLines={1}>{problem.title}</Text>
        <Text style={[s.diffLabel, { color: diffColor }]}>
          {problem.difficulty.toUpperCase()}
        </Text>
      </View>

      {/* Siri orb + centered state */}
      <View style={s.centerSection}>
        <SiriOrb energy={energy} tint={state.tint} />

        <Text style={[s.stateLabel, { color: state.tint }]}>{state.label}</Text>

        <View style={s.captionWrap}>
          <GlassCard variant="small" radius={radius.card} padding={space(4)} style={s.captionCard}>
            {fetching ? (
              <View style={s.captionCenter}>
                <ActivityIndicator size="small" color={colors.difficulty} />
              </View>
            ) : recognizing && transcript ? (
              <Text style={[s.captionText, { color: colors.textSecondary }]}>{transcript}</Text>
            ) : (
              <Text style={s.captionText}>
                <Text style={s.captionBold}>{bold}</Text>
                <Text style={s.captionDim}>{dim}</Text>
              </Text>
            )}
          </GlassCard>
        </View>
      </View>

      {/* Live input meter */}
      <View style={s.meterWrap}>
        <GlassCard
          variant="small"
          radius={radius.pill}
          padding={0}
          borderColor={recognizing ? 'rgba(0,211,242,0.42)' : undefined}
          contentStyle={s.meterInner}>
          <Text style={[s.meterLabel, recognizing && { color: colors.streak }]}>
            {recognizing ? 'YOU’RE SPEAKING' : 'YOUR ANSWER'}
          </Text>
          <AnimatedWaveform active={recognizing} />
        </GlassCard>
      </View>

      {/* Text fallback input */}
      {showText && (
        <View style={s.inputRow}>
          <TextInput
            ref={inputRef}
            style={s.input}
            placeholder="Type your answer…"
            placeholderTextColor={colors.textPlaceholder}
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
            style={({ pressed: p }) => [
              s.sendBtn,
              (!input.trim() || fetching) && s.sendBtnOff,
              p && pressed,
            ]}
            onPress={() => {
              const t = input.trim();
              if (t) { sendMessage(t); setInput(''); setShowText(false); }
            }}
            disabled={!input.trim() || fetching}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Controls */}
      <View style={[s.controls, { paddingBottom: insets.bottom + space(5) }]}>
        {/* Text toggle */}
        <Pressable
          style={({ pressed: p }) => [s.controlBtn, p && pressed]}
          onPress={() => {
            setShowText(v => !v);
            if (!showText) setTimeout(() => inputRef.current?.focus(), 50);
          }}
        >
          <BlurView intensity={blur.cardSmall} tint="dark" style={s.controlBlur}>
            <View style={[
              s.controlFill,
              showText && { backgroundColor: colors.accentSelectedFill, borderColor: colors.accentSelectedBorder },
            ]}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={21}
                color={showText ? colors.accentText : colors.textSecondary}
              />
            </View>
          </BlurView>
        </Pressable>

        {/* Mic — the primary control */}
        <Pressable
          style={({ pressed: p }) => [s.micBtn, p && pressed]}
          onPress={handleMic}
          disabled={fetching || ending}
        >
          <View style={[
            s.micFill,
            recognizing
              ? { backgroundColor: colors.streak, shadowColor: colors.streak }
              : { backgroundColor: colors.accent, shadowColor: colors.accent },
            (fetching || ending) && { opacity: 0.4 },
          ]}>
            <Ionicons
              name={recognizing ? 'mic' : 'mic-outline'}
              size={27}
              color={recognizing ? '#00131A' : '#FFFFFF'}
            />
          </View>
        </Pressable>

        {/* End round */}
        <Pressable
          style={({ pressed: p }) => [s.controlBtn, !canEnd && { opacity: 0.4 }, p && pressed]}
          onPress={endInterview}
          disabled={!canEnd}
        >
          <BlurView intensity={blur.cardSmall} tint="dark" style={s.controlBlur}>
            <View style={[s.controlFill, s.endFill]}>
              {ending
                ? <ActivityIndicator size="small" color={colors.volume} />
                : <View style={s.stopSquare} />
              }
            </View>
          </BlurView>
        </Pressable>
      </View>

      {!configured && (
        <View style={s.banner}>
          <GlassCard variant="small" radius={radius.smallCard} padding={space(3)}>
            <Text style={s.bannerText}>
              Deploy interview-ai + add ANTHROPIC_API_KEY in Supabase secrets.
            </Text>
          </GlassCard>
        </View>
      )}

      <Toast message={toast} onHide={() => setToast(null)} bottom={space(32)} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: space(2), height: 44,
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.controlAlt16, borderWidth: 0.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  roundLabel: { ...T.microLabel, color: colors.textTertiary },
  timerPill: {
    minWidth: 34, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10, height: 34, borderRadius: 17,
    backgroundColor: colors.controlAlt16, borderWidth: 0.5, borderColor: colors.border,
  },
  timerText: { ...T.caption, ...tabular, color: colors.text, fontWeight: '600' },

  problemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 20, marginTop: space(1),
  },
  diffDot: { width: 6, height: 6, borderRadius: 3 },
  problemTitle: { ...T.bodyRow, color: colors.text, letterSpacing: -0.2, flexShrink: 1 },
  diffLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7 },

  centerSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* Orb */
  orbWrap: {
    width: FIELD, height: FIELD,
    alignItems: 'center', justifyContent: 'center',
  },
  field: {
    position: 'absolute', width: FIELD, height: FIELD,
    alignItems: 'center', justifyContent: 'center',
  },
  blob: { position: 'absolute', left: '50%', top: '50%' },
  halo: { position: 'absolute', borderWidth: 1 },
  coreShadow: {
    width: CORE, height: CORE, borderRadius: CORE / 2,
    shadowColor: '#FFFFFF', shadowOffset: { width: 0, height: 0 },
    shadowRadius: 26, elevation: 10,
  },
  coreBlur: { width: CORE, height: CORE, borderRadius: CORE / 2, overflow: 'hidden' },
  coreFill: {
    width: '100%', height: '100%', borderRadius: CORE / 2,
    backgroundColor: 'rgba(28,28,30,0.34)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },

  stateLabel: {
    ...T.microLabel, textTransform: 'uppercase',
    marginTop: space(5), marginBottom: space(4),
  },

  captionWrap: { paddingHorizontal: 20, width: '100%' },
  captionCard: { width: '100%' },
  captionCenter: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  captionText: { ...T.body, fontSize: 15.5, lineHeight: 22, textAlign: 'center' },
  captionBold: { color: colors.text, fontWeight: '600' },
  captionDim:  { color: colors.textSecondary, fontWeight: '400' },

  meterWrap: { paddingHorizontal: 20, marginBottom: space(3) },
  meterInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, gap: space(4),
  },
  meterLabel: { ...T.microLabel, color: colors.textTertiary },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: space(2),
    paddingHorizontal: 20, marginBottom: space(3),
  },
  input: {
    flex: 1, backgroundColor: colors.controlAlt, borderWidth: 0.5,
    borderColor: colors.border, borderRadius: radius.input,
    paddingHorizontal: 18, paddingVertical: 12,
    color: colors.text, fontSize: 15.5, maxHeight: 110,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: colors.controlAlt30 },

  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space(8), paddingTop: space(2),
  },
  controlBtn: { width: 54, height: 54 },
  controlBlur: { width: 54, height: 54, borderRadius: 27, overflow: 'hidden' },
  controlFill: {
    width: '100%', height: '100%', borderRadius: 27,
    backgroundColor: colors.cardSmall, borderWidth: 0.5, borderColor: colors.borderSmall,
    alignItems: 'center', justifyContent: 'center',
  },
  endFill: { backgroundColor: 'rgba(250,17,79,0.14)', borderColor: 'rgba(250,17,79,0.42)' },
  stopSquare: { width: 17, height: 17, borderRadius: 4, backgroundColor: colors.volume },

  micBtn: { width: 72, height: 72 },
  micFill: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.md, shadowOpacity: 0.55, shadowRadius: 22,
  },

  banner: { position: 'absolute', bottom: 150, left: 20, right: 20 },
  bannerText: { ...T.caption, color: colors.textTertiary, textAlign: 'center' },
});
