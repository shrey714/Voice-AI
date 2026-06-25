import React from 'react';
import { View, StyleSheet, StatusBar, ScrollView, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  style?: any;
}

export default function Screen({ children, scroll = false, refreshing, onRefresh, padded = false, style }: Props) {
  const { colors, isDark } = useAppTheme();

  const content = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[padded && styles.padded, style]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padded && styles.padded, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]} edges={['bottom']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
        translucent={false}
      />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  padded: { padding: 16 },
});
