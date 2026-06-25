import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Calendar, CalendarProps } from 'react-native-calendars';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DatePickerMode = 'single' | 'range';

export interface DateRange {
  from: Date;
  to: Date;
}

export interface DatePickerSheetRef {
  open: () => void;
  close: () => void;
}

interface Props {
  mode?: DatePickerMode;
  title?: string;
  /** Called when a single date is confirmed (mode="single") */
  onSelectDate?: (date: Date) => void;
  /** Called when both ends of a range are selected (mode="range") */
  onSelectRange?: (range: DateRange) => void;
  /** Called whenever the sheet is dismissed (optional) */
  onDismiss?: () => void;
  /** Pass any react-native-calendars CalendarProps to customise the calendar */
  calendarProps?: Omit<CalendarProps, 'onDayPress' | 'markedDates' | 'theme'>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─── Component ───────────────────────────────────────────────────────────────

const DatePickerSheet = forwardRef<DatePickerSheetRef, Props>(
  ({ mode = 'single', title, onSelectDate, onSelectRange, onDismiss, calendarProps }, ref) => {
    const { colors } = useAppTheme();
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['55%'], []);

    // Single-mode selection
    const [selectedYMD, setSelectedYMD] = useState<string | undefined>();

    // Range-mode selection
    const [rangeStart, setRangeStart] = useState<string | undefined>();
    const [rangeEnd, setRangeEnd] = useState<string | undefined>();

    // ── Imperative handle ──────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      open: () => {
        setSelectedYMD(undefined);
        setRangeStart(undefined);
        setRangeEnd(undefined);
        sheetRef.current?.present();
      },
      close: () => sheetRef.current?.dismiss(),
    }));

    // ── Backdrop ──────────────────────────────────────────────────────────
    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.45}
          pressBehavior="close"
        />
      ),
      []
    );

    // ── Day press logic ────────────────────────────────────────────────────
    const handleDayPress = useCallback(
      (day: { dateString: string }) => {
        const ymd = day.dateString;

        if (mode === 'single') {
          setSelectedYMD(ymd);
          return;
        }

        // Range mode: first tap = start, second tap = end (must be >= start)
        if (!rangeStart || (rangeStart && rangeEnd)) {
          setRangeStart(ymd);
          setRangeEnd(undefined);
        } else {
          if (ymd < rangeStart) {
            // tapped before start — swap
            setRangeEnd(rangeStart);
            setRangeStart(ymd);
          } else {
            setRangeEnd(ymd);
          }
        }
      },
      [mode, rangeStart, rangeEnd]
    );

    // ── Marked dates ──────────────────────────────────────────────────────
    const markedDates = useMemo<CalendarProps['markedDates']>(() => {
      if (mode === 'single') {
        if (!selectedYMD) return {};
        return { [selectedYMD]: { selected: true, selectedColor: colors.primary } };
      }

      // Range mode
      const marks: CalendarProps['markedDates'] = {};
      if (!rangeStart) return marks;

      marks[rangeStart] = {
        startingDay: true,
        color: colors.primary,
        textColor: '#fff',
      };

      if (rangeEnd) {
        marks[rangeEnd] = {
          endingDay: true,
          color: colors.primary,
          textColor: '#fff',
        };

        // Fill in-between days
        let current = rangeStart;
        while (current < rangeEnd) {
          const d = fromYMD(current);
          d.setDate(d.getDate() + 1);
          current = toYMD(d);
          if (current < rangeEnd) {
            marks[current] = { color: colors.primary + '33', textColor: colors.text };
          }
        }
      }

      return marks;
    }, [mode, selectedYMD, rangeStart, rangeEnd, colors]);

    // ── Confirm ───────────────────────────────────────────────────────────
    const canConfirm =
      mode === 'single' ? !!selectedYMD : !!(rangeStart && rangeEnd);

    const handleConfirm = useCallback(() => {
      if (mode === 'single' && selectedYMD) {
        onSelectDate?.(fromYMD(selectedYMD));
        sheetRef.current?.dismiss();
      } else if (mode === 'range' && rangeStart && rangeEnd) {
        onSelectRange?.({ from: fromYMD(rangeStart), to: fromYMD(rangeEnd) });
        sheetRef.current?.dismiss();
      }
    }, [mode, selectedYMD, rangeStart, rangeEnd, onSelectDate, onSelectRange]);

    // ── Default title ─────────────────────────────────────────────────────
    const sheetTitle =
      title ?? (mode === 'range' ? 'Select Date Range' : 'Select Date');

    // ── Hint text under calendar ──────────────────────────────────────────
    const hint = useMemo(() => {
      if (mode === 'single') return selectedYMD ? '' : 'Tap a day to select';
      if (!rangeStart) return 'Tap start date';
      if (!rangeEnd) return 'Tap end date';
      return '';
    }, [mode, selectedYMD, rangeStart, rangeEnd]);

    // ── Calendar theme ────────────────────────────────────────────────────
    const calendarTheme: CalendarProps['theme'] = {
      backgroundColor: colors.surface,
      calendarBackground: colors.surface,
      textSectionTitleColor: colors.textMuted,
      selectedDayBackgroundColor: colors.primary,
      selectedDayTextColor: '#fff',
      todayTextColor: colors.primary,
      dayTextColor: colors.text,
      textDisabledColor: colors.border,
      arrowColor: colors.primary,
      monthTextColor: colors.text,
      textDayFontFamily: fonts.semiBold,
      textMonthFontFamily: fonts.extraBold,
      textDayHeaderFontFamily: fonts.bold,
      textDayFontSize: 14,
      textMonthFontSize: 16,
      textDayHeaderFontSize: 12,
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border, width: 40 }}
        onDismiss={onDismiss}
        enableContentPanningGesture={false}
      >
        <BottomSheetView>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>{sheetTitle}</Text>
            <TouchableOpacity
              onPress={() => sheetRef.current?.dismiss()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={colors.textSub} />
            </TouchableOpacity>
          </View>

          {/* Calendar */}
          <Calendar
            markingType={mode === 'range' ? 'period' : 'dot'}
            markedDates={markedDates}
            onDayPress={handleDayPress}
            theme={calendarTheme}
            style={styles.calendar}
            {...calendarProps}
          />

          {/* Hint + Confirm */}
          <View style={styles.footer}>
            {hint ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                { backgroundColor: canConfirm ? colors.primary : colors.border },
              ]}
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Text style={[styles.confirmText, { color: canConfirm ? '#fff' : colors.textMuted }]}>
                Confirm
              </Text>
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

export default DatePickerSheet;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontFamily: fonts.extraBold, fontSize: 17 },
  calendar: { paddingBottom: 4 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 12,
  },
  hint: { flex: 1, fontFamily: fonts.regular, fontSize: 13 },
  confirmBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  confirmText: { fontFamily: fonts.bold, fontSize: 15 },
});
