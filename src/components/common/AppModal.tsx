import React, { useEffect } from 'react';
import { StyleSheet, BackHandler, KeyboardAvoidingView, Platform } from 'react-native';
import { Portal } from 'react-native-paper';
import { MotiView, AnimatePresence } from 'moti';

/**
 * AppModal — a Portal-based replacement for React Native's <Modal>.
 *
 * WHY THIS EXISTS (read before "fixing" modal layout again):
 * This app runs on the New Architecture (Fabric) — see app.json "newArchEnabled": true.
 * On Fabric/Android the native <Modal> does NOT reliably give its children a size, so
 * `flex: 1` / percentage-height content collapses to height 0 and the modal renders blank
 * (only fixed-height children like a row of buttons show). No amount of SafeAreaView /
 * explicit-dimension juggling fixes the native <Modal> permanently — it keeps regressing.
 *
 * So we stop using the native <Modal> entirely:
 *   - <Portal> (from react-native-paper; its host is provided by <PaperProvider> at the
 *     app root) renders the children as a normal IN-APP overlay, NOT a separate native
 *     window. Normal RN views always measure correctly, so the Fabric Modal bug can't occur.
 *   - StyleSheet.absoluteFill anchors the overlay to all four screen edges, giving it
 *     concrete full-screen bounds that can never collapse.
 *
 * It is a drop-in replacement for <Modal>: pass the same props (visible, onRequestClose,
 * transparent, animationType, …). Props that only made sense for the native modal are
 * accepted and ignored.
 *
 * ALWAYS use <AppModal> instead of <Modal> in this codebase.
 */
type AppModalProps = {
  visible: boolean;
  onRequestClose?: () => void;
  children: React.ReactNode;
  /** Accepted for <Modal> API compatibility; not needed by the Portal implementation. */
  transparent?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
  statusBarTranslucent?: boolean;
  hardwareAccelerated?: boolean;
  edges?: readonly string[];
};

export default function AppModal({ visible, onRequestClose, children }: AppModalProps) {
  // Mirror <Modal onRequestClose>: the Android hardware back button closes the modal.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (onRequestClose) {
        onRequestClose();
        return true; // we handled it
      }
      return false;
    });
    return () => sub.remove();
  }, [visible, onRequestClose]);

  return (
    <Portal>
      <AnimatePresence>
        {visible && (
          <MotiView
            key="app-modal"
            style={StyleSheet.absoluteFill}
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'timing', duration: 160 }}
            exitTransition={{ type: 'timing', duration: 160 }}
          >
            <KeyboardAvoidingView
              style={StyleSheet.absoluteFill}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              {children}
            </KeyboardAvoidingView>
          </MotiView>
        )}
      </AnimatePresence>
    </Portal>
  );
}
