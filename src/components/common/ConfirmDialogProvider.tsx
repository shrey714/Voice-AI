import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
// `Alert` (SwiftUI's real centered modal dialog, native scale/fade
// transitions) instead of `ConfirmationDialog` (SwiftUI's action-sheet
// presentation — no real enter animation, abrupt appear/minimal fade on
// dismiss). This app only ever uses it as a full-screen modal-style prompt
// anyway, never as an actual "pick one of several options" action sheet, so
// `Alert` is the correct native primitive here, not a downgrade — its
// `Trigger`/`Actions`/`Message` shape (including `role` on `Actions`
// buttons) is otherwise identical to `ConfirmationDialog`'s.
import { Host, Alert as SwiftUIAlert, Button as SwiftUIButton } from '@expo/ui/swift-ui';
// `Text` (unlike `Button`, which needs the swift-ui-only `role` prop for
// destructive/cancel styling — no universal equivalent) is a pure pass-
// through wrapper around swift-ui `Text` with no functional gap, confirmed
// by reading @expo/ui's own source — safe to take from the universal layer.
import { Text } from '@expo/ui';
import { useAppTheme } from '../../theme';

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button red/destructive on both platforms. */
  destructive?: boolean;
};

export type ConfirmAction = {
  label: string;
  value: string;
  destructive?: boolean;
};

export type ConfirmActionsOptions = {
  title: string;
  message?: string;
  actions: ConfirmAction[];
  cancelLabel?: string;
};

type PendingConfirm = { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void };
type PendingActions = { kind: 'actions'; options: ConfirmActionsOptions; resolve: (v: string | null) => void };
type Pending = PendingConfirm | PendingActions;

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmActions: (options: ConfirmActionsOptions) => Promise<string | null>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * Replaces ad-hoc `Alert.alert(title, message, [Cancel, Confirm])` call
 * sites app-wide with a single native confirmation dialog — real SwiftUI
 * `Alert` on iOS (via @expo/ui), `Alert.alert` on Android (no @expo/ui
 * equivalent there, and the platform's own alert already looks native).
 * Mount once near the app root; call `useConfirm()` anywhere below it.
 */
export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const { isDark } = useAppTheme();
  const [pending, setPending] = useState<Pending | null>(null);
  const settledRef = useRef(false);

  const confirm = useCallback((options: ConfirmOptions) => {
    if (Platform.OS !== 'ios') {
      return new Promise<boolean>(resolve => {
        Alert.alert(options.title, options.message, [
          { text: options.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: options.confirmLabel ?? 'Confirm', style: options.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) });
      });
    }
    return new Promise<boolean>(resolve => {
      settledRef.current = false;
      setPending({ kind: 'confirm', options, resolve: v => { settledRef.current = true; resolve(v); } });
    });
  }, []);

  const confirmActions = useCallback((options: ConfirmActionsOptions) => {
    if (Platform.OS !== 'ios') {
      return new Promise<string | null>(resolve => {
        Alert.alert(options.title, options.message, [
          ...options.actions.map(a => ({ text: a.label, style: (a.destructive ? 'destructive' : 'default') as 'destructive' | 'default', onPress: () => resolve(a.value) })),
          { text: options.cancelLabel ?? 'Cancel', style: 'cancel' as const, onPress: () => resolve(null) },
        ], { cancelable: true, onDismiss: () => resolve(null) });
      });
    }
    return new Promise<string | null>(resolve => {
      settledRef.current = false;
      setPending({ kind: 'actions', options, resolve: v => { settledRef.current = true; resolve(v); } });
    });
  }, []);

  const handleIsPresentedChange = (isPresented: boolean) => {
    if (isPresented || !pending) return;
    // Dismissed without tapping an action (e.g. tap outside / swipe down).
    if (!settledRef.current) {
      pending.kind === 'confirm' ? pending.resolve(false) : pending.resolve(null);
    }
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm, confirmActions }}>
      {children}
      {Platform.OS === 'ios' && (
        // Full-screen, touch-transparent when idle — a zero-size anchor here
        // collapses to the screen's (0,0) corner and SwiftUI presents the
        // confirmationDialog pinned to that corner instead of centered/full-width.
        <View style={StyleSheet.absoluteFill} pointerEvents={pending ? 'auto' : 'none'}>
        <Host style={StyleSheet.absoluteFill} colorScheme={isDark ? 'dark' : 'light'}>
          <SwiftUIAlert
            title={pending?.options.title ?? ''}
            isPresented={!!pending}
            onIsPresentedChange={handleIsPresentedChange}
          >
            <SwiftUIAlert.Trigger>
              <View style={StyleSheet.absoluteFill} pointerEvents="none" />
            </SwiftUIAlert.Trigger>
            <SwiftUIAlert.Actions>
              {pending?.kind === 'confirm' && (
                <>
                  <SwiftUIButton
                    label={pending.options.confirmLabel ?? 'Confirm'}
                    role={pending.options.destructive ? 'destructive' : 'default'}
                    onPress={() => pending.resolve(true)}
                  />
                  <SwiftUIButton
                    label={pending.options.cancelLabel ?? 'Cancel'}
                    role="cancel"
                    onPress={() => pending.resolve(false)}
                  />
                </>
              )}
              {pending?.kind === 'actions' && (
                <>
                  {pending.options.actions.map(a => (
                    <SwiftUIButton
                      key={a.value}
                      label={a.label}
                      role={a.destructive ? 'destructive' : 'default'}
                      onPress={() => pending.resolve(a.value)}
                    />
                  ))}
                  <SwiftUIButton
                    label={pending.options.cancelLabel ?? 'Cancel'}
                    role="cancel"
                    onPress={() => pending.resolve(null)}
                  />
                </>
              )}
            </SwiftUIAlert.Actions>
            {pending?.options.message ? (
              <SwiftUIAlert.Message>
                <Text>{pending.options.message}</Text>
              </SwiftUIAlert.Message>
            ) : null}
          </SwiftUIAlert>
        </Host>
        </View>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  return ctx;
}
