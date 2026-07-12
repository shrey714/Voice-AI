import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Calendar, CalendarProps } from 'react-native-calendars';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import LiquidBottomSheet, { LiquidBottomSheetRef } from './LiquidBottomSheet';
import LiquidButton from './LiquidButton';
import SheetHeader, { SHEET_PADDING } from './SheetHeader';

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
    const sheetRef = useRef<LiquidBottomSheetRef>(null);

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
        sheetRef.current?.expand();
      },
      close: () => sheetRef.current?.close(),
    }));

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
        sheetRef.current?.close();
      } else if (mode === 'range' && rangeStart && rangeEnd) {
        onSelectRange?.({ from: fromYMD(rangeStart), to: fromYMD(rangeEnd) });
        sheetRef.current?.close();
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
      // `transparent`, not `colors.surface` — the sheet itself is real
      // glass now (see LiquidBottomSheet), and this library paints its own
      // opaque background underneath the calendar grid regardless of
      // anything the sheet does, which showed up as a solid mismatched
      // rectangle sitting on top of the glass instead of blending into it.
      backgroundColor: 'transparent',
      calendarBackground: 'transparent',
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
      <LiquidBottomSheet ref={sheetRef} onDismiss={onDismiss}>
        <View>
          <SheetHeader title={sheetTitle} onClose={() => sheetRef.current?.dismiss()} />

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
            <LiquidButton
              title="Confirm"
              onPress={handleConfirm}
              disabled={!canConfirm}
              variant="glassProminent"
              fullWidth={false}
              height={44}
            />
          </View>
        </View>
      </LiquidBottomSheet>
    );
  }
);

export default DatePickerSheet;

const styles = StyleSheet.create({
  calendar: { paddingBottom: 4 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SHEET_PADDING,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 12,
  },
  hint: { flex: 1, fontFamily: fonts.regular, fontSize: 13 },
});
