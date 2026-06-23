import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { MYPAL_API_URL } from '../constants/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// ─── Palette (matches onboarding design system) ───────────────────────────────

const C = {
  bg:      '#0A0B0C',
  surface: '#15161A',
  border:  'rgba(255,255,255,0.08)',
  text:    '#F0F0F2',
  muted:   '#9A9AA2',
  dim:     '#62626A',
  userBg:  '#D6D7DC',
  aiBg:    '#1B1C22',
};

// ─── Bubble ───────────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[b.row, isUser ? b.userRow : b.aiRow]}>
      <View style={[b.bubble, isUser ? b.userBubble : b.aiBubble]}>
        <Text style={[b.text, isUser ? b.userText : b.aiText]}>{msg.content}</Text>
      </View>
    </View>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <View style={[b.row, b.aiRow]}>
      <View style={[b.bubble, b.aiBubble]}>
        <Text style={[b.text, b.aiText, { letterSpacing: 2 }]}>…</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MyPalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError(null);

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages(prev => {
      const next = [...prev, userMsg];
      return next;
    });
    setLoading(true);
    scrollToEnd();

    try {
      // Send last 20 messages as history context (capped to keep cost low)
      const history = messages.slice(-20).map(m => ({ role: m.role, content: m.content }));

      const res = await fetch(MYPAL_API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, history }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Request failed');

      const aiMsg: Message = { id: `a-${Date.now()}`, role: 'assistant', content: data.reply };
      setMessages(prev => [...prev, aiMsg]);
      scrollToEnd();
    } catch {
      setError("Couldn't reach MyPal — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, scrollToEnd]);

  const isEmpty = messages.length === 0 && !loading;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <SymbolView name="chevron.left" size={18} tintColor={C.text} type="monochrome" style={{ width: 18, height: 18 }} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>MyPal</Text>
          <Text style={s.headerSub}>AI fitness coach</Text>
        </View>
        {/* spacer to balance back button */}
        <View style={{ width: 36 }} />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[s.messageList, { paddingBottom: 12 }]}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {/* Empty state */}
        {isEmpty && (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <SymbolView name="sparkles" size={28} tintColor={C.muted} type="monochrome" style={{ width: 28, height: 28 }} />
            </View>
            <Text style={s.emptyGreeting}>Hey, I'm MyPal</Text>
            <Text style={s.emptySub}>Ask me anything about your training, form, or plan. I'll keep it short and practical.</Text>
            <View style={s.chipRow}>
              {['How do I squat correctly?', 'My knee hurts after lunges', 'Make my plan easier'].map(q => (
                <TouchableOpacity
                  key={q}
                  style={s.chip}
                  activeOpacity={0.7}
                  onPress={() => { setInput(q); }}
                >
                  <Text style={s.chipText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Message bubbles */}
        {messages.map(msg => <Bubble key={msg.id} msg={msg} />)}

        {/* Typing indicator */}
        {loading && <TypingIndicator />}

        {/* Error */}
        {error && (
          <View style={s.errorRow}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask MyPal…"
          placeholderTextColor={C.dim}
          multiline
          maxLength={500}
          returnKeyType="default"
          onSubmitEditing={send}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
          onPress={send}
          disabled={!input.trim() || loading}
          activeOpacity={0.75}
        >
          {loading
            ? <ActivityIndicator size="small" color={C.bg} />
            : <SymbolView name="arrow.up" size={16} tintColor={C.bg} type="monochrome" style={{ width: 16, height: 16 }} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Bubble styles ────────────────────────────────────────────────────────────

const b = StyleSheet.create({
  row:        { flexDirection: 'row', marginBottom: 8, paddingHorizontal: 16 },
  userRow:    { justifyContent: 'flex-end' },
  aiRow:      { justifyContent: 'flex-start' },
  bubble:     { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { backgroundColor: C.userBg, borderBottomRightRadius: 4 },
  aiBubble:   { backgroundColor: C.aiBg,  borderBottomLeftRadius: 4 },
  text:       { fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  userText:   { color: C.bg,   fontWeight: '500' },
  aiText:     { color: C.text, fontWeight: '400' },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 16,
    paddingBottom:   14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 16, fontWeight: '600', color: '#F0F0F2', letterSpacing: -0.3 },
  headerSub:    { fontSize: 11, color: '#9A9AA2', marginTop: 1 },

  messageList: { paddingTop: 16, flexGrow: 1 },

  emptyWrap:     { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 48, gap: 0 },
  emptyIcon:     { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyGreeting: { fontSize: 22, fontWeight: '600', color: '#F0F0F2', letterSpacing: -0.5, marginBottom: 8 },
  emptySub:      { fontSize: 14, color: '#9A9AA2', textAlign: 'center', lineHeight: 20, marginBottom: 28, letterSpacing: -0.1 },
  chipRow:       { gap: 8, width: '100%' },
  chip:          { backgroundColor: '#15161A', borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 16, paddingVertical: 10 },
  chipText:      { fontSize: 13, color: '#9A9AA2', fontWeight: '500' },

  errorRow:  { paddingHorizontal: 16, paddingVertical: 8 },
  errorText: { fontSize: 13, color: '#FB923C', textAlign: 'center' },

  inputBar: {
    flexDirection:    'row',
    alignItems:       'flex-end',
    gap:              10,
    paddingHorizontal: 16,
    paddingTop:       12,
    borderTopWidth:   StyleSheet.hairlineWidth,
    borderTopColor:   'rgba(255,255,255,0.08)',
    backgroundColor:  '#0A0B0C',
  },
  input: {
    flex:              1,
    backgroundColor:   '#15161A',
    borderRadius:      22,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical:   11,
    fontSize:          15,
    color:             '#F0F0F2',
    maxHeight:         120,
    letterSpacing:     -0.1,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#D6D7DC',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 1,
  },
  sendBtnDisabled: { opacity: 0.35 },
});
