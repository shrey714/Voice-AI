import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

/** Shared horizontal padding for every `LiquidBottomSheet`'s content — was
 * inconsistent (20/16/10/8/0) across screens before this was pulled out. */
export const SHEET_PADDING = 20;

/**
 * The title row every bottom sheet should lead with — title text + an
 * optional close (X) button, divided from the content below by a hairline
 * border. Pulled out of `DatePickerSheet` (the one sheet that already had
 * this exact look) so every sheet in the app shares one header instead of
 * each screen re-inventing its own title/padding/border combination.
 */
export default function SheetHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  /** Second line under the title — e.g. a date's scope/category. */
  subtitle?: string;
  /** Omit to render a title-only header with no close button (e.g. sheets
   * that are dismissed via their own primary action instead). */
  onClose?: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, marginRight: 16 }}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {onClose && (
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={[styles.closeBtn, { backgroundColor: colors.surfaceHigh }]}
        >
          <Ionicons name="close" size={18} color={colors.textSub} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    // The close button sits center-aligned against the *title* line, not
    // the whole (title + subtitle) block — `flex-start` + a small top
    // offset instead of `center` keeps it level with the title even when a
    // subtitle is present, rather than drifting to the vertical middle of
    // both lines.
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SHEET_PADDING,
    // Extra top padding gives the header real room under the drag handle
    // instead of the title crowding right up against it, and the taller
    // bottom padding + border reads as a deliberate divider rather than a
    // cramped one-line strip.
    paddingTop: 20,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  title: { fontFamily: fonts.extraBold, fontSize: 19 },
  subtitle: { fontFamily: fonts.medium, fontSize: 13, marginTop: 3 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
