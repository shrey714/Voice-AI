import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, TextInput, Switch, Alert, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAppStore } from '../stores/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useOnlineShopStore } from '../stores/useOnlineShopStore';
import { useAppTheme } from '../theme';
import { useTranslation } from '../hooks/useTranslation';
import { useIsOnline } from '../hooks/useIsOnline';
import { fonts } from '../theme/typography';
import { sanitizeDecimal, sanitizeInteger } from '../utils/helpers';
import { ShopSchedule, OnlineShopConfig } from '../types/online';
import { reverseGeocode } from '../lib/geocode';
import { OnlineShopSettingsSkeleton } from '../components/common/Skeleton';
import LiquidButton from '../components/common/LiquidButton';
import { toast } from '../utils/toast';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Matches the DB check constraint (online_shops_order_timeout_range) — kept
// in sync so a shopkeeper sees this clamped client-side, not as a Supabase
// error after tapping Save.
const ORDER_TIMEOUT_MIN = 5;
const ORDER_TIMEOUT_MAX = 30;
const ORDER_TIMEOUT_DEFAULT = 10;

/**
 * The single Shop Information screen — merges what used to be two separate
 * screens (local-only "Shop Information" and cloud-only "Online Shop
 * Settings"). Core profile fields (name, owner, phone, address, UPI, GST)
 * are shared and always synced to Supabase `online_shops`, which is now the
 * source of truth for shop identity across the whole app; the rest of the
 * online-shop-specific fields only appear once the shopkeeper opts in via
 * the "Online Shop" toggle. Editing requires connectivity — Supabase is
 * always the write target — but the local SQLite cache (mirrored after every
 * successful save) keeps billing/invoices working offline in between edits.
 */
export default function ShopInfoScreen(props: any) {
  const isOnline = useIsOnline();
  const { fetchShopConfig } = useOnlineShopStore(
    useShallow(state => ({
      fetchShopConfig: state.fetchShopConfig,
    }))
  );
  // The store's own isLoadingConfig only reflects the app's FIRST-EVER fetch
  // this session — every later visit to this screen would otherwise skip
  // straight to rendering the form with whatever (possibly stale) config is
  // still sitting in the store, before the fresh fetch below resolves. Track
  // per-visit readiness locally so re-opening this screen always waits for a
  // fresh pull, and shows edits made directly in the Supabase dashboard too.
  const [hasFetchedThisVisit, setHasFetchedThisVisit] = useState(false);

  useEffect(() => {
    setHasFetchedThisVisit(false);
    if (!isOnline) { setHasFetchedThisVisit(true); return; }
    let cancelled = false;
    fetchShopConfig().finally(() => { if (!cancelled) setHasFetchedThisVisit(true); });
    return () => { cancelled = true; };
  }, [isOnline]);

  // `ShopInfoForm` is always mounted now (not swapped in only once fetched)
  // — that keeps its `ScrollView` present from the very first render, which
  // is what lets iOS correctly detect it for the automatic header inset
  // (`headerCompensation` further down is a manual belt-and-suspenders
  // fallback for the same thing, in case that detection still races on a
  // slow connection). The loading state is a `loading` prop this component
  // renders content for INSIDE that same `ScrollView`, not a separate
  // early-returned skeleton screen — that separate tree (a plain `View`,
  // no `ScrollView` of its own) was going out from under the transparent
  // header instead of being properly inset below it.
  return <ShopInfoForm {...props} isOnline={isOnline} loading={isOnline && !hasFetchedThisVisit} />;
}

function ShopInfoForm({ isOnline, loading, navigation }: { isOnline: boolean; loading: boolean; navigation: any }) {
  const { colors } = useAppTheme();
  // No manual header-compensation needed — this `ScrollView` is mounted
  // from the very first render now (only the loading vs. loaded content
  // INSIDE it swaps, see `loading` below), so iOS's one-time scroll-view
  // detection pass always finds it, same as OnlineInventoryScreen/
  // OnlineOrdersScreen once their `FlatList` became always-mounted for the
  // same reason. It gets the automatic native inset on its own.

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTransparent: true,
      headerStyle: { backgroundColor: 'transparent' },
    });
  }, [navigation]);
  const { t } = useTranslation();
  const appSettings = useAppStore((s) => s.settings);
  const { config, updateConfig, saveConfigToSupabase, fetchShopConfig, isSavingConfig, lastError } = useOnlineShopStore(
    useShallow(state => ({
      config: state.config,
      updateConfig: state.updateConfig,
      saveConfigToSupabase: state.saveConfigToSupabase,
      fetchShopConfig: state.fetchShopConfig,
      isSavingConfig: state.isSavingConfig,
      lastError: state.lastError,
    }))
  );

  // Cloud config is the source of truth once we've actually fetched it
  // (i.e. we're online); offline, fall back to the last-known local cache
  // for the core fields — the online-only fields simply aren't shown then.
  const seed: OnlineShopConfig = isOnline
    ? config
    : {
        ...config,
        shopName: appSettings.shopName,
        ownerName: appSettings.ownerName,
        phone: appSettings.phone,
        addressText: appSettings.address,
        upiId: appSettings.upiId ?? '',
        gstRegistered: appSettings.gstRegistered,
        gstin: appSettings.gstin,
        onlineShopEnabled: appSettings.onlineShopEnabled,
      };

  const [shopName, setShopName] = useState(seed.shopName);
  const [ownerName, setOwnerName] = useState(seed.ownerName);
  const [phone, setPhone] = useState(seed.phone);
  const [addressText, setAddressText] = useState(seed.addressText);
  const [upiId, setUpiId] = useState(seed.upiId);
  const [gstRegistered, setGstRegistered] = useState(seed.gstRegistered);
  const [gstin, setGstin] = useState(seed.gstin);
  const [onlineShopEnabled, setOnlineShopEnabled] = useState(seed.onlineShopEnabled);

  const [shopSlug, setShopSlug] = useState(config.shopSlug);
  const [description, setDescription] = useState(config.description);
  const [orderTimeout, setOrderTimeout] = useState(String(config.orderTimeoutMinutes));
  const [minOrder, setMinOrder] = useState(config.minOrderAmount > 0 ? String(config.minOrderAmount) : '');
  const [isOnlineEnabled, setIsOnlineEnabled] = useState(config.isOnlineEnabled);
  const [deliveryEnabled, setDeliveryEnabled] = useState(config.deliveryEnabled);
  const [deliveryFee, setDeliveryFee] = useState(config.deliveryFee > 0 ? String(config.deliveryFee) : '');
  const [deliveryRadius, setDeliveryRadius] = useState(config.deliveryRadiusKm != null ? String(config.deliveryRadiusKm) : '');
  const [schedule, setSchedule] = useState<ShopSchedule[]>(config.schedule);
  const [latitude, setLatitude] = useState<number | null>(config.latitude);
  const [longitude, setLongitude] = useState<number | null>(config.longitude);
  const [isLocating, setIsLocating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saved, setSaved] = useState(false);

  const isSetup = Boolean(config.shopId);

  // Fields are plain useState seeded once at mount — pulling to refresh
  // updates the store, but that alone wouldn't touch these, so re-populate
  // them explicitly from whatever fetchShopConfig just loaded (e.g. an edit
  // made directly in the Supabase dashboard).
  const resetFieldsFrom = useCallback((c: OnlineShopConfig) => {
    setShopName(c.shopName);
    setOwnerName(c.ownerName);
    setPhone(c.phone);
    setAddressText(c.addressText);
    setUpiId(c.upiId);
    setGstRegistered(c.gstRegistered);
    setGstin(c.gstin);
    setOnlineShopEnabled(c.onlineShopEnabled);
    setShopSlug(c.shopSlug);
    setDescription(c.description);
    setOrderTimeout(String(c.orderTimeoutMinutes));
    setMinOrder(c.minOrderAmount > 0 ? String(c.minOrderAmount) : '');
    setIsOnlineEnabled(c.isOnlineEnabled);
    setDeliveryEnabled(c.deliveryEnabled);
    setDeliveryFee(c.deliveryFee > 0 ? String(c.deliveryFee) : '');
    setDeliveryRadius(c.deliveryRadiusKm != null ? String(c.deliveryRadiusKm) : '');
    setSchedule(c.schedule);
    setLatitude(c.latitude);
    setLongitude(c.longitude);
  }, []);

  // Fields above are seeded via `useState` at mount, from whatever `config`
  // holds at that instant — now that this component mounts immediately
  // (not delayed until the fetch resolves, see `ShopInfoScreen`'s comment),
  // that initial seed can be a stale/default value. Once `loading` flips to
  // `false`, re-populate from the store's freshest fetched config.
  useEffect(() => {
    if (!loading && isOnline) resetFieldsFrom(useOnlineShopStore.getState().config);
  }, [loading, isOnline, resetFieldsFrom]);

  const onRefresh = useCallback(async () => {
    if (!isOnline) return;
    setRefreshing(true);
    await fetchShopConfig();
    resetFieldsFrom(useOnlineShopStore.getState().config);
    setRefreshing(false);
  }, [isOnline, fetchShopConfig, resetFieldsFrom]);

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location permission is required to set your shop\'s pickup location.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
      try {
        const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (address) setAddressText(address);
      } catch {
        // Reverse geocode failed — coordinates are still captured; shopkeeper can type address manually.
      }
    } catch {
      Alert.alert('Location error', 'Could not fetch your current location. Please try again.');
    } finally {
      setIsLocating(false);
    }
  };

  const slugify = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const toggleDay = (day: number) => {
    setSchedule((prev) => {
      const exists = prev.find((s) => s.day === day);
      if (exists) return prev.filter((s) => s.day !== day);
      return [...prev, { day: day as ShopSchedule['day'], open: '09:00', close: '21:00' }].sort((a, b) => a.day - b.day);
    });
  };

  const updateSlotTime = (day: number, field: 'open' | 'close', value: string) => {
    setSchedule((prev) =>
      prev.map((s) => (s.day === day ? { ...s, [field]: value } : s))
    );
  };

  const handleSave = useCallback(async () => {
    if (!isOnline) return;
    if (!shopName.trim()) { toast.error('Enter a shop name.'); return; }
    const slug = slugify(shopSlug || shopName);
    if (!orderTimeout.trim()) {
      toast.error('Auto-cancel timeout is required', { description: `Enter a value between ${ORDER_TIMEOUT_MIN} and ${ORDER_TIMEOUT_MAX} minutes.` });
      return;
    }
    const timeout = parseInt(orderTimeout);
    if (isNaN(timeout) || timeout < ORDER_TIMEOUT_MIN || timeout > ORDER_TIMEOUT_MAX) {
      toast.error('Invalid auto-cancel timeout', { description: `Enter a value between ${ORDER_TIMEOUT_MIN} and ${ORDER_TIMEOUT_MAX} minutes.` });
      return;
    }

    updateConfig({
      shopName: shopName.trim(),
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      upiId: upiId.trim(),
      gstRegistered,
      gstin: gstRegistered ? gstin.trim().toUpperCase() : '',
      onlineShopEnabled,
      isOnlineEnabled,
      shopSlug: slug,
      description,
      schedule,
      orderTimeoutMinutes: timeout,
      minOrderAmount: parseFloat(minOrder) || 0,
      deliveryEnabled,
      deliveryFee: deliveryEnabled ? parseFloat(deliveryFee) || 0 : 0,
      deliveryRadiusKm: deliveryEnabled && deliveryRadius.trim() ? parseFloat(deliveryRadius) || null : null,
      latitude,
      longitude,
      addressText: addressText.trim(),
    });

    try {
      await saveConfigToSupabase();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      toast.error('Could not save', { description: e?.message ?? 'Check your connection and try again.' });
    }
  }, [
    isOnline, shopName, shopSlug, orderTimeout, ownerName, phone, upiId, gstRegistered, gstin,
    onlineShopEnabled, isOnlineEnabled, description, schedule, minOrder, deliveryEnabled,
    deliveryFee, deliveryRadius, latitude, longitude, addressText, updateConfig, saveConfigToSupabase,
  ]);

  const saveLabel = !isOnline ? 'Offline — connect to save' : isSavingConfig ? 'Saving…' : saved ? t('savedExcl') : t('save');
  const saveIcon = !isOnline ? 'icloud.slash' : saved ? 'checkmark.circle.fill' : 'square.and.arrow.down';
  const saveTint = saved ? colors.success : colors.primary;
  const saveDisabled = !isOnline;

  // `bottomAccessory` (iOS 26+ only) — same conversion as InventoryScreen's
  // FAB, but scoped with `useFocusEffect` (set on focus, cleared on blur)
  // rather than a plain mount effect: unlike Inventory's tab (whose stack
  // only has 2-3 screens that all reasonably want the same "Add Product"
  // accessory), this screen sits deep inside the "More" tab's stack
  // alongside many unrelated screens (Settings, Exports, Backup, …) — if
  // left set, this Save button would keep floating there after navigating
  // away, backed by a stale closure.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios') return;
      const parent = navigation.getParent();
      parent?.setOptions({
        bottomAccessory: ({ placement }: { placement: 'regular' | 'inline' }) =>
              <TouchableOpacity
                onPress={saveDisabled ? undefined : handleSave}
                style={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 24, paddingHorizontal: 18, backgroundColor: saveTint, opacity: saveDisabled ? 0.4 : 1 }}
                accessibilityLabel={saveLabel}
                accessibilityRole="button"
              >
                {isSavingConfig ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={saved ? 'checkmark' : 'save-outline'} size={18} color="#fff" />}
                <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 14 }}>{saveLabel}</Text>
              </TouchableOpacity>
      });
      return () => { parent?.setOptions({ bottomAccessory: undefined }); };
    }, [navigation, handleSave, saveLabel, saveTint, saveDisabled, isSavingConfig, saved])
  );

  const s = makeStyles(colors);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      {loading ? (
        <OnlineShopSettingsSkeleton />
      ) : (
      <>
      {!isOnline && (
        <View style={[s.errorBanner, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
          <Text style={[s.errorText, { color: colors.warning }]}>
            You're offline. Shop info below is your last saved copy — connect to the internet to make changes.
          </Text>
        </View>
      )}
      {lastError ? (
        <View style={[s.errorBanner, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '40' }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={[s.errorText, { color: colors.danger }]}>{lastError}</Text>
        </View>
      ) : null}

      {/* Core shop profile — always shown, used by both bills and the online storefront */}
      <View style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>SHOP INFO</Text>
        <Text style={[s.scheduleHint, { color: colors.textMuted }]}>{t('appearsOnBills')}</Text>

        <Text style={[s.fieldLabel, { color: colors.textSub }]}>{t('shopName')} *</Text>
        <TextInput
          style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
          value={shopName}
          onChangeText={setShopName}
          placeholder="My Shop"
          placeholderTextColor={colors.textMuted}
          editable={isOnline}
          autoCapitalize="words"
        />

        <Text style={[s.fieldLabel, { color: colors.textSub }]}>{t('ownerName')}</Text>
        <TextInput
          style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
          value={ownerName}
          onChangeText={setOwnerName}
          placeholder={t('yourName')}
          placeholderTextColor={colors.textMuted}
          editable={isOnline}
          autoCapitalize="words"
        />

        <Text style={[s.fieldLabel, { color: colors.textSub }]}>{t('phone')}</Text>
        <TextInput
          style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
          value={phone}
          onChangeText={setPhone}
          placeholder="+91 XXXXX XXXXX"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          editable={isOnline}
        />

        <Text style={[s.fieldLabel, { color: colors.textSub }]}>{t('address')}</Text>
        <TextInput
          style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border, minHeight: 64, textAlignVertical: 'top' }]}
          value={addressText}
          onChangeText={setAddressText}
          placeholder="Shop no, street, area, city"
          placeholderTextColor={colors.textMuted}
          multiline
          editable={isOnline}
          autoCapitalize="sentences"
        />

        <Text style={[s.fieldLabel, { color: colors.textSub }]}>{t('upiId')}</Text>
        <TextInput
          style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
          value={upiId}
          onChangeText={setUpiId}
          placeholder="yourname@upi"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          editable={isOnline}
        />

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.switchLabel, { color: colors.text }]}>{t('registeredUnderGst')}</Text>
          </View>
          <Switch
            value={gstRegistered}
            onValueChange={setGstRegistered}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={gstRegistered ? '#fff' : colors.textMuted}
            disabled={!isOnline}
          />
        </View>
        {gstRegistered && (
          <>
            <Text style={[s.fieldLabel, { color: colors.textSub, marginTop: 12 }]}>GSTIN</Text>
            <TextInput
              style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
              value={gstin}
              onChangeText={(v) => setGstin(v.toUpperCase())}
              placeholder="22AAAAA0000A1Z5"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              maxLength={15}
              editable={isOnline}
            />
          </>
        )}
      </View>

      {/* Online Shop opt-in */}
      <View style={[s.section, { backgroundColor: colors.surface, borderColor: onlineShopEnabled ? colors.primary + '40' : colors.border, borderWidth: 1 }]}>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.switchLabel, { color: colors.text }]}>Use Online Shop</Text>
            <Text style={[s.switchSub, { color: colors.textMuted }]}>
              Let customers browse and order from this shop
            </Text>
          </View>
          <Switch
            value={onlineShopEnabled}
            onValueChange={setOnlineShopEnabled}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={onlineShopEnabled ? '#fff' : colors.textMuted}
            disabled={!isOnline}
          />
        </View>
      </View>

      {onlineShopEnabled && !isOnline && (
        <View style={[s.errorBanner, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
          <Text style={[s.errorText, { color: colors.warning }]}>
            Connect to the internet to view or edit your online shop settings.
          </Text>
        </View>
      )}

      {onlineShopEnabled && isOnline && (
        <>
          {/* Master enable switch */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.switchLabel, { color: colors.text }]}>List shop online</Text>
                <Text style={[s.switchSub, { color: colors.textMuted }]}>
                  {isOnlineEnabled ? 'Your shop is visible on the customer app' : 'Shop is hidden from customers'}
                </Text>
              </View>
              <Switch
                value={isOnlineEnabled}
                onValueChange={setIsOnlineEnabled}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={isOnlineEnabled ? '#fff' : colors.textMuted}
              />
            </View>
          </View>

          {/* Online shop info */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionTitle, { color: colors.textMuted }]}>ONLINE SHOP</Text>

            <Text style={[s.fieldLabel, { color: colors.textSub }]}>Shop URL Slug</Text>
            <View style={[s.slugRow, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
              <Text style={[s.slugPrefix, { color: colors.textMuted }]}>shop.app/</Text>
              <TextInput
                style={[s.slugInput, { color: colors.text }]}
                value={shopSlug || slugify(shopName)}
                onChangeText={(v) => setShopSlug(slugify(v))}
                placeholder={slugify(shopName) || 'my-shop'}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
            </View>

            <Text style={[s.fieldLabel, { color: colors.textSub }]}>Description (optional)</Text>
            <TextInput
              style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border, minHeight: 72, textAlignVertical: 'top' }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Welcome to our shop…"
              placeholderTextColor={colors.textMuted}
              multiline
            />
          </View>

          {/* Order Settings */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionTitle, { color: colors.textMuted }]}>ORDER SETTINGS</Text>

            <Text style={[s.fieldLabel, { color: colors.textSub }]}>Auto-cancel timeout (minutes) *</Text>
            <TextInput
              style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
              value={orderTimeout}
              onChangeText={(v) => setOrderTimeout(sanitizeInteger(v))}
              keyboardType="numeric"
              placeholder={String(ORDER_TIMEOUT_DEFAULT)}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={[s.scheduleHint, { color: colors.textMuted, marginTop: -6 }]}>
              {ORDER_TIMEOUT_MIN}–{ORDER_TIMEOUT_MAX} minutes — an order you don't respond to auto-cancels after this long.
            </Text>

            <Text style={[s.fieldLabel, { color: colors.textSub }]}>Minimum order amount</Text>
            <TextInput
              style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
              value={minOrder}
              onChangeText={(v) => setMinOrder(sanitizeDecimal(v))}
              keyboardType="numeric"
              placeholder="0 (no minimum)"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Delivery */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionTitle, { color: colors.textMuted }]}>DELIVERY</Text>
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.switchLabel, { color: colors.text }]}>Enable delivery</Text>
                <Text style={[s.switchSub, { color: colors.textMuted }]}>Customers can opt for home delivery</Text>
              </View>
              <Switch
                value={deliveryEnabled}
                onValueChange={setDeliveryEnabled}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={deliveryEnabled ? '#fff' : colors.textMuted}
              />
            </View>
            {deliveryEnabled && (
              <>
                <Text style={[s.fieldLabel, { color: colors.textSub, marginTop: 12 }]}>Delivery fee</Text>
                <TextInput
                  style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
                  value={deliveryFee}
                  onChangeText={(v) => setDeliveryFee(sanitizeDecimal(v))}
                  keyboardType="numeric"
                  placeholder="0 (free delivery)"
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={[s.fieldLabel, { color: colors.textSub }]}>Delivery radius (km)</Text>
                {latitude != null && longitude != null ? (
                  <>
                    <TextInput
                      style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
                      value={deliveryRadius}
                      onChangeText={(v) => setDeliveryRadius(sanitizeDecimal(v))}
                      keyboardType="numeric"
                      placeholder="Unlimited (leave blank)"
                      placeholderTextColor={colors.textMuted}
                    />
                    <Text style={[s.scheduleHint, { color: colors.textMuted, marginTop: -6 }]}>
                      Customers beyond this distance from your shop will only see "Pickup from store" — not home delivery.
                    </Text>
                  </>
                ) : (
                  <View style={[s.locateStatus, { marginTop: 0, marginBottom: 12 }]}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.warning ?? colors.textMuted} />
                    <Text style={[s.locateStatusText, { color: colors.textMuted }]}>
                      Set your shop's pickup location below to enable a delivery radius.
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Pickup Location */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionTitle, { color: colors.textMuted }]}>PICKUP LOCATION</Text>
            <Text style={[s.scheduleHint, { color: colors.textMuted }]}>
              Customers who choose "Pickup from shop" will see the address above and a map link to your store.
            </Text>

            <LiquidButton
              title={isLocating ? 'Fetching location…' : 'Use current location'}
              icon="location.fill"
              onPress={handleUseCurrentLocation}
              loading={isLocating}
              variant="glass"
            />

            {latitude != null && longitude != null ? (
              <View style={s.locateStatus}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={[s.locateStatusText, { color: colors.textMuted }]}>
                  Location set ({latitude.toFixed(5)}, {longitude.toFixed(5)})
                </Text>
              </View>
            ) : (
              <View style={s.locateStatus}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                <Text style={[s.locateStatusText, { color: colors.textMuted }]}>
                  Not set — pickup will still work, showing only the written address above.
                </Text>
              </View>
            )}
          </View>

          {/* Schedule */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionTitle, { color: colors.textMuted }]}>SHOP HOURS</Text>
            <Text style={[s.scheduleHint, { color: colors.textMuted }]}>
              Select open days and set hours. Outside these hours the shop shows as closed.
            </Text>
            {DAYS.map((dayLabel, day) => {
              const slot = schedule.find((s) => s.day === day);
              const isOpen = Boolean(slot);
              return (
                <View key={day} style={[s.dayRow, day > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <TouchableOpacity style={s.dayToggle} onPress={() => toggleDay(day)}>
                    <View style={[s.dayCheck, { borderColor: isOpen ? colors.primary : colors.border, backgroundColor: isOpen ? colors.primary : 'transparent' }]}>
                      {isOpen && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                    <Text style={[s.dayLabel, { color: isOpen ? colors.text : colors.textMuted }]}>{dayLabel}</Text>
                  </TouchableOpacity>
                  {isOpen && slot && (
                    <View style={s.timeRow}>
                      <TextInput
                        style={[s.timeInput, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
                        value={slot.open}
                        onChangeText={(v) => updateSlotTime(day, 'open', v)}
                        placeholder="09:00"
                        placeholderTextColor={colors.textMuted}
                        maxLength={5}
                      />
                      <Text style={[{ color: colors.textMuted, fontFamily: fonts.regular }]}>to</Text>
                      <TextInput
                        style={[s.timeInput, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
                        value={slot.close}
                        onChangeText={(v) => updateSlotTime(day, 'close', v)}
                        placeholder="21:00"
                        placeholderTextColor={colors.textMuted}
                        maxLength={5}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* iOS gets the native `bottomAccessory` (set up above via
          `useFocusEffect` + `navigation.getParent()?.setOptions`) instead —
          Android has no such API, so it keeps this in-form Save button. */}
      {Platform.OS !== 'ios' && (
        <LiquidButton
          title={saveLabel}
          icon={!isOnline ? 'icloud.slash' : saved ? 'checkmark.circle.fill' : 'square.and.arrow.down'}
          onPress={handleSave}
          loading={isSavingConfig}
          disabled={!isOnline}
          tintColor={saved ? colors.success : undefined}
          variant={!isOnline ? 'glass' : 'glassProminent'}
          height={52}
        />
      )}
      </>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
    errorText: { fontFamily: fonts.semiBold, fontSize: 13, flex: 1 },

    section: { borderRadius: 16, padding: 16, marginBottom: 12 },
    sectionTitle: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, marginBottom: 14 },

    fieldLabel: { fontFamily: fonts.bold, fontSize: 13, marginBottom: 6, marginTop: 2 },
    input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 14, fontFamily: fonts.regular, marginBottom: 12 },
    slugRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
    slugPrefix: { fontFamily: fonts.regular, fontSize: 14, paddingLeft: 14 },
    slugInput: { flex: 1, padding: 14, fontSize: 14, fontFamily: fonts.regular },

    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    switchLabel: { fontFamily: fonts.bold, fontSize: 15 },
    switchSub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },

    scheduleHint: { fontFamily: fonts.regular, fontSize: 13, marginBottom: 12, lineHeight: 18 },
    locateStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    locateStatusText: { fontFamily: fonts.regular, fontSize: 12, flex: 1 },
    dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    dayToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 80 },
    dayCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
    dayLabel: { fontFamily: fonts.semiBold, fontSize: 14 },
    timeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center' },

    saveBtn: { borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4, alignContent: 'center', justifyContent: 'center' },
    saveBtnText: { fontFamily: fonts.bold, fontSize: 16 },
  });
