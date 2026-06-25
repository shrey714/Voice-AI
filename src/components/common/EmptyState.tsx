import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  icon: IoniconsName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, subtitle, actionLabel, onAction }: Props) {
  const { colors } = useAppTheme();

  return (
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 400 }}
      style={styles.container}
    >
      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
        <Ionicons name={icon} size={30} color={colors.textMuted} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={onAction} activeOpacity={0.85}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 32 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  title: { fontFamily: fonts.bold, fontSize: 16, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 22, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 12 },
  btnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
});
