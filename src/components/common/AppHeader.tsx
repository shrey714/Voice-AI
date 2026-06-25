import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

/**
 * AppHeader — the ONE header used across the whole app.
 *
 * Register it once at the navigator level via the `header` option:
 *   <Stack.Navigator screenOptions={{ header: (props) => <AppHeader {...props} /> }}>
 *
 * Because every screen (native-stack OR bottom-tabs) renders this exact React
 * component, the font, height, colors and safe-area handling are guaranteed
 * identical everywhere — no per-screen header styling, ever. Don't hand-build
 * per-screen header bars; set `title` / `headerRight` in the screen's options
 * (e.g. navigation.setOptions) and this component renders them.
 *
 * Works for both header prop shapes:
 *   - native-stack: { navigation, route, options, back }
 *   - bottom-tabs:  { navigation, route, options }  (no `back` → no back button)
 */
export const HEADER_HEIGHT = 56;

export default function AppHeader({ navigation, route, options, back }: any) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const headerTitle = options?.headerTitle;
  const titleStr =
    typeof headerTitle === 'string'
      ? headerTitle
      : options?.title ?? route?.name ?? '';

  const renderRight = options?.headerRight;

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <View style={[styles.row, { height: HEADER_HEIGHT }]}>
        {back ? (
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : null}

        {typeof headerTitle === 'function' ? (
          <View style={styles.titleSlot}>{headerTitle({ children: titleStr, tintColor: colors.text })}</View>
        ) : (
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {titleStr}
          </Text>
        )}

        {renderRight ? (
          <View style={styles.right}>{renderRight({ tintColor: colors.primary })}</View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  backBtn: { marginRight: 8, marginLeft: -4 },
  title: { flex: 1, fontFamily: fonts.extraBold, fontSize: 18 },
  titleSlot: { flex: 1 },
  right: { marginLeft: 8 },
});
