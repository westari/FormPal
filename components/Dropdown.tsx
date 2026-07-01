import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { SymbolView } from 'expo-symbols';

export interface DropdownOption {
  value:      string;
  label:      string;
  symbolName: string;
}

interface Props {
  options:       DropdownOption[];
  value:         string;
  onChange:      (v: string) => void;
  renderTrigger: (open: () => void) => React.ReactNode;
}

export default function Dropdown({ options, value, onChange, renderTrigger }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos,     setPos]     = useState({ x: 0, y: 0 });
  const ref = useRef<View>(null);

  function open() {
    ref.current?.measureInWindow((x, y, _w, h) => {
      setPos({ x, y: y + h + 8 });
      setVisible(true);
    });
  }

  return (
    <View ref={ref} collapsable={false}>
      {renderTrigger(open)}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={() => setVisible(false)}
        statusBarTranslucent
      >
        {/* Full-screen overlay — tap anywhere outside to dismiss */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)}>
          {/* Menu card — absorbs touches so they don't reach the overlay */}
          <Pressable
            style={[d.menu, { top: pos.y, left: pos.x }]}
            onPress={() => { /* stop propagation */ }}
          >
            {options.map((opt, i) => {
              const sel = opt.value === value;
              return (
                <Pressable
                  key={opt.value}
                  style={[d.option, i < options.length - 1 && d.divider]}
                  onPress={() => { onChange(opt.value); setVisible(false); }}
                >
                  <SymbolView
                    name={opt.symbolName as any}
                    type="monochrome"
                    style={d.optIcon}
                    tintColor={sel ? '#0a84ff' : '#9aa0ad'}
                  />
                  <Text style={[d.optLabel, sel && d.optSel]}>{opt.label}</Text>
                  {sel && <Text style={d.check}>✓</Text>}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const d = StyleSheet.create({
  menu: {
    position:        'absolute',
    minWidth:        190,
    backgroundColor: '#ffffff',
    borderRadius:    16,
    paddingVertical:  4,
    shadowColor:     '#1a1d36',
    shadowOffset:    { width: 0, height: 6 },
    shadowOpacity:   0.16,
    shadowRadius:    22,
    elevation:       14,
  },
  option: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               13,
    paddingVertical:   15,
    paddingHorizontal: 18,
  },
  divider:  { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.07)' },
  optIcon:  { width: 20, height: 20 },
  optLabel: { flex: 1, fontSize: 16, color: '#1a1d26', letterSpacing: -0.1 },
  optSel:   { fontWeight: '600' as const, color: '#0a84ff' },
  check:    { fontSize: 16, fontWeight: '700' as const, color: '#0a84ff' },
});
