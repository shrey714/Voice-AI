import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Linking, FlatList, Image, Keyboard, Pressable,
  Platform,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import {
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import AppBottomSheet, { AppBottomSheetRef } from '../../components/common/AppBottomSheet';
import QRCode from 'react-native-qrcode-svg';
import { useAppStore } from '../../stores/useAppStore';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCurrency, generateBillText, fuzzyMatch, sanitizeDecimal } from '../../utils/helpers';
import { toast } from '../../utils/toast';
import * as Haptics from 'expo-haptics';
import VoiceButton from '../../components/billing/VoiceButton';
import BarcodeScannerModal from '../../components/billing/BarcodeScannerModal';
import BtStatusIcon from '../../components/billing/BtStatusIcon';
import EmptyState from '../../components/common/EmptyState';
import AppModal from '../../components/common/AppModal';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function BillingScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { products, cart, addToCart, removeFromCart, updateCartQuantity, clearCart, checkout, settings, templates, saveTemplate, renameTemplate, deleteTemplate } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'credit'>('cash');
  const [discount, setDiscount] = useState('0');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [processing, setProcessing] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'form' | 'success'>('form');
  const [lastBill, setLastBill] = useState<any>(null);
  const [showUpiQr, setShowUpiQr] = useState(false);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const checkoutSheetRef = useRef<AppBottomSheetRef>(null);
  const saveTemplateSheetRef = useRef<AppBottomSheetRef>(null);
  const templatesSheetRef = useRef<AppBottomSheetRef>(null);
  const renameSheetRef = useRef<AppBottomSheetRef>(null);
  const btInputRef = useRef<TextInput>(null);
  const btBufferRef = useRef('');
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBillingFocused = useRef(false);

  const [btBuffer, setBtBuffer] = useState('');
  const [btActive, setBtActive] = useState(false);
  const templatesSheetSnap = useMemo(() => ['85%'], []);

  const openCheckout = useCallback(() => checkoutSheetRef.current?.expand(), []);
  const closeCheckout = useCallback(() => checkoutSheetRef.current?.close(), []);
  const openSaveSheet = useCallback(() => { setTemplateName(''); saveTemplateSheetRef.current?.expand(); }, []);
  const closeSaveSheet = useCallback(() => saveTemplateSheetRef.current?.close(), []);
  const openTemplatesSheet = useCallback(() => templatesSheetRef.current?.expand(), []);
  const closeTemplatesSheet = useCallback(() => templatesSheetRef.current?.close(), []);
  const openRenameSheet = useCallback((tmpl: { id: string; name: string }) => {
    setRenameTarget(tmpl);
    setRenameName(tmpl.name);
    renameSheetRef.current?.expand();
  }, []);
  const closeRenameSheet = useCallback(() => renameSheetRef.current?.close(), []);

  const cartTotal = cart.reduce((sum, i) => sum + i.product.sellingPrice * i.quantity, 0);
  // Clamp discount to [0, cartTotal] so the bill total / profit can never go negative.
  const discountNum = Math.min(Math.max(parseFloat(discount) || 0, 0), cartTotal);
  const finalTotal = cartTotal - discountNum;

  const filteredProducts = searchQuery.length > 0
    ? products.filter(p => fuzzyMatch(searchQuery, p.name) || fuzzyMatch(searchQuery, p.category))
    : products.filter(p => p.quantity > 0).slice(0, 20);

  const quickItems = products.filter(p => p.quantity > 0).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10);

  const handleLoadTemplate = useCallback((template: typeof templates[0]) => {
    const doLoad = (merge: boolean) => {
      const skipped: string[] = [];
      if (!merge) clearCart();
      template.items.forEach(ti => {
        const product = products.find(p => p.id === ti.productId);
        if (!product || product.quantity <= 0) {
          skipped.push(ti.productName);
          return;
        }
        addToCart(product, ti.quantity);
      });
      if (skipped.length > 0) {
        Alert.alert(t('someItemsUnavailable'), t('skippedItems').replace('{items}', skipped.join(', ')));
      }
    };

    if (cart.length > 0) {
      Alert.alert(t('loadTemplate').replace('{name}', template.name), t('whatShouldHappenToCart'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('addToCart'), onPress: () => doLoad(true) },
        { text: t('replaceCart'), style: 'destructive', onPress: () => doLoad(false) },
      ]);
    } else {
      doLoad(false);
    }
  }, [cart, products, clearCart, addToCart]);

  const handleDeleteTemplate = useCallback((id: string, name: string) => {
    Alert.alert(t('deleteTemplateConfirm').replace('{name}', name), t('permanentlyRemoved'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => deleteTemplate(id) },
    ]);
  }, [deleteTemplate]);

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      await saveTemplate(templateName.trim());
      closeSaveSheet();
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleRename = async () => {
    if (!renameName.trim() || !renameTarget) return;
    setRenameSaving(true);
    try {
      await renameTemplate(renameTarget.id, renameName.trim());
      closeRenameSheet();
    } finally {
      setRenameSaving(false);
    }
  };

  const shareOnWhatsApp = useCallback((bill: any) => {
    const text = generateBillText(bill, settings.shopName, settings.currency);
    const encoded = encodeURIComponent(text);
    const digits = bill.customerPhone?.replace(/\D/g, '') ?? '';
    const url = digits
      ? `whatsapp://send?phone=${digits.length === 10 ? '91' + digits : digits}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;
    Linking.openURL(url).catch(() =>
      Alert.alert(t('whatsappNotFound'), t('installWhatsappShareBills'))
    );
  }, [settings.shopName, settings.currency]);

  // Bluetooth HID scanner support — toggleable in Settings → Preferences.
  const btEnabled = settings.btScannerEnabled !== false;

  const refocusBtInput = useCallback(() => {
    if (!btEnabled || !isBillingFocused.current) return;
    // PagerView (under react-navigation material-top-tabs) runs its page transition
    // on the native thread — InteractionManager only tracks JS Animated, so it fires
    // almost immediately and we'd call .focus() mid-transition.
    // Instead use a plain delay that clears the native animation:
    //   iOS  ~80ms  — PagerView resigns first-responder once at animation START;
    //                 we just need to get past that event.
    //   Android ~350ms — full native PagerView transition before IMF accepts focus.
    const delay = Platform.OS === 'android' ? 350 : 80;
    setTimeout(() => {
      if (isBillingFocused.current) btInputRef.current?.focus();
    }, delay);
  }, [btEnabled]);

  const handleBtScan = useCallback(() => {
    if (scanTimer.current) { clearTimeout(scanTimer.current); scanTimer.current = null; }

    const barcode = btBufferRef.current.trim();
    btBufferRef.current = '';
    setBtBuffer('');
    if (!barcode) { refocusBtInput(); return; }

    const product = products.find(p => p.barcode === barcode);
    if (!product) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(t('notInInventory').replace('{barcode}', barcode));
    } else if (product.quantity <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(t('outOfStockItem').replace('{name}', product.name));
    } else {
      const cartQty = cart.find(ci => ci.product.id === product.id)?.quantity ?? 0;
      if (cartQty >= product.quantity) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        toast.warning(t('onlyInStock').replace('{name}', product.name).replace('{qty}', String(product.quantity)));
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addToCart(product);
        toast.success(product.name);
      }
    }
    refocusBtInput();
  }, [products, cart, addToCart, refocusBtInput]);

  useFocusEffect(useCallback(() => {
    isBillingFocused.current = true;
    refocusBtInput();
    return () => {
      isBillingFocused.current = false;
      btInputRef.current?.blur();
    };
  }, [refocusBtInput]));

  useEffect(() => {
    navigation.setOptions({
      headerRight: btEnabled ? () => <BtStatusIcon active={btActive} /> : undefined,
    });
  }, [btActive, navigation, btEnabled]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', refocusBtInput);
    return () => {
      sub.remove();
      if (scanTimer.current) clearTimeout(scanTimer.current);
    };
  }, [refocusBtInput]);

  const handleBarcodeScanned = (barcode: string) => {
    setShowScanner(false);
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      if (product.quantity <= 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.error(t('outOfStockItem').replace('{name}', product.name));
      } else {
        const cartQty = cart.find(ci => ci.product.id === product.id)?.quantity ?? 0;
        if (cartQty >= product.quantity) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        toast.warning(t('onlyInStock').replace('{name}', product.name).replace('{qty}', String(product.quantity)));
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          addToCart(product);
          toast.success(product.name);
        }
      }
      refocusBtInput();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(t('notInInventory').replace('{barcode}', barcode));
      // Delay Alert until the full-screen modal has fully closed, otherwise it conflicts on Android
      setTimeout(() => {
        Alert.alert(t('addToInventory'), t('noProductWithBarcode').replace('{barcode}', barcode), [
          { text: t('cancel'), style: 'cancel' },
          { text: t('create'), onPress: () => navigation.navigate('Inventory', { screen: 'InventoryMain', params: { openAdd: true, prefillBarcode: barcode } }) },
        ]);
      }, 500);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    // Credit sales must be attributable to someone, or the debt is untrackable.
    if (paymentMode === 'credit' && !customerName.trim() && !customerPhone.trim()) {
      Alert.alert(t('customerNeededForCredit'), t('customerNeededForCreditMsg'));
      return;
    }
    setProcessing(true);
    try {
      const bill = await checkout(paymentMode, discountNum, customerName || undefined, customerPhone || undefined, customerGstin || undefined);
      setDiscount('0');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerGstin('');
      setLastBill(bill);
      setCheckoutStep('success');
      checkoutSheetRef.current?.snapToIndex(0);
    } finally {
      setProcessing(false);
    }
  };

  const s = makeStyles(colors);

  const payModeColors = { cash: colors.success, upi: colors.info, credit: colors.warning };

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {/* Top bar */}
      <View style={[s.topBar, { backgroundColor: colors.surface }]}>
        <View style={[s.searchBox, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder={t('searchProducts')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.textMuted}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); refocusBtInput(); }} accessibilityLabel="Clear search" accessibilityRole="button">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
         <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]} onPress={() => setShowScanner(true)} accessibilityLabel="Scan barcode" accessibilityRole="button">
          <Ionicons name="barcode-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
       <VoiceButton
          style={[s.iconBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6 }]}
          color={colors.primary}
          onResult={(items) => {
            items.forEach(({ product, quantity }) => addToCart(product, quantity));
          }}
        />
      </View>

      {/* Quick chips or search results */}
      {searchQuery.length === 0 ? (
        <View>
          <Text style={[s.sectionLabel, { color: colors.textMuted }]}>{t('quickAdd')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 8 }}>
            {/* Fixed Templates access button — NOT in scroll */}
            <TouchableOpacity
              style={[s.templateAccessBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
              onPress={openTemplatesSheet}
            >
              <Ionicons name="bookmark" size={15} color={colors.primary} />
              <Text style={[s.templateAccessText, { color: colors.primary }]}>Templates</Text>
              {templates.length > 0 && (
                <View style={[s.templateCountBadge, { backgroundColor: colors.primary, position: 'absolute', top: -7, right: -7 }]}>
                  <Text style={s.templateCountText}>{templates.length}</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={[s.quickAddDivider, { backgroundColor: colors.border }]} />

            {/* Scrollable quick-add chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}
              contentContainerStyle={{ paddingRight: 8, gap: 8 }}>
              {quickItems.map((p, i) => (
                <MotiView key={p.id} from={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', delay: i * 30 }}>
                  <TouchableOpacity style={[s.quickChip, { backgroundColor: colors.surface }]} onPress={() => addToCart(p)}>
                    <Text style={[s.quickChipName, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
                    <Text style={[s.quickChipPrice, { color: colors.primary }]}>{formatCurrency(p.sellingPrice, settings.currency)}</Text>
                  </TouchableOpacity>
                </MotiView>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={p => p.id}
          style={{ flex: 1, backgroundColor: colors.bg, marginHorizontal: 8, marginVertical: 8, borderRadius: 10 }}
          contentContainerStyle={{ flexGrow: 1 }}
          renderItem={({ item: p, index }) => (
            <MotiView from={{ opacity: 0, translateX: -8 }} animate={{ opacity: 1, translateX: 0 }}
              transition={{ type: 'timing', duration: 250, delay: index * 30 }}>
              <TouchableOpacity style={[s.productRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
                onPress={() => { addToCart(p); setSearchQuery(''); refocusBtInput(); }} activeOpacity={0.7}>
                {p.imageUri ? (
                  <Image source={{ uri: p.imageUri }} style={s.rowThumb} />
                ) : (
                  <View style={[s.rowThumb, { backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: colors.primary, fontFamily: fonts.extraBold, fontSize: 15 }}>{initials(p.name)}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.productName, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.quantity <= 0 ? colors.danger : p.quantity <= p.lowStockThreshold ? colors.warning : colors.success }} />
                    <Text style={[s.productMeta, { color: colors.textMuted }]}>{p.category} · {p.quantity} in stock</Text>
                  </View>
                </View>
                <Text style={[s.productPrice, { color: colors.text }]}>{formatCurrency(p.sellingPrice, settings.currency)}</Text>
                <View style={[s.addBtn, { backgroundColor: colors.primary }]}>
                  <Ionicons name="add" size={20} color="#fff" />
                </View>
              </TouchableOpacity>
            </MotiView>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={t('noProductsFound')}
              subtitle={t('tryDifferentNameOrBarcode')}
            />
          }
        />
      )}

      {/* Cart */}
      <View style={[s.cartContainer, { backgroundColor: colors.surface }]}>
        <View style={[s.cartHeader, { borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="cart" size={18} color={colors.primary} />
            <Text style={[s.cartTitle, { color: colors.text }]}>{t('cart')}</Text>
            {cart.length > 0 && (
              <MotiView key={cart.length} from={{ scale: 1.25, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'timing', duration: 200 }}
                style={[s.cartBadge, { backgroundColor: colors.primary }]}>
                <Text style={s.cartBadgeText}>{cart.length}</Text>
              </MotiView>
            )}
          </View>
          {cart.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <TouchableOpacity onPress={openSaveSheet} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="bookmark-outline" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: fonts.semiBold, fontSize: 12 }}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearCart} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="trash-outline" size={14} color={colors.danger} />
                <Text style={{ color: colors.danger, fontFamily: fonts.semiBold, fontSize: 12 }}>{t('clear')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {cart.length === 0 ? (
          <EmptyState
            icon="cart-outline"
            title={t('cartIsEmpty')}
            subtitle={t('scanBarcodeOrSearchForItems')}
          />
        ) : (
          <ScrollView style={s.cartItems} nestedScrollEnabled>
            {cart.map((item, index) => (
              <MotiView key={item.product.id} from={{ opacity: 0, translateY: 6 }} animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 200, delay: index * 20 }}>
                <View style={[s.cartItem, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cartItemName, { color: colors.text }]} numberOfLines={1}>{item.product.name}</Text>
                    <Text style={[s.cartItemPrice, { color: colors.textMuted }]}>{formatCurrency(item.product.sellingPrice, settings.currency)} {t('each')}</Text>
                  </View>
                  <View style={s.qtyRow}>
                    <TouchableOpacity style={[s.qtyBtn, { backgroundColor: colors.surfaceHigh }]} onPress={() => updateCartQuantity(item.product.id, item.quantity - 1)} accessibilityLabel="Decrement quantity" accessibilityRole="button">
                      <Text style={[s.qtyBtnText, { color: colors.primary }]}>−</Text>
                    </TouchableOpacity>
                    <Text style={[s.qtyText, { color: colors.text }]}>{item.quantity}</Text>
                    <TouchableOpacity
                      style={[s.qtyBtn, { backgroundColor: colors.surfaceHigh, opacity: item.quantity >= item.product.quantity ? 0.4 : 1 }]}
                      disabled={item.quantity >= item.product.quantity}
                      onPress={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                      accessibilityLabel="Increment quantity"
                      accessibilityRole="button">
                      <Text style={[s.qtyBtnText, { color: colors.primary }]}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.cartItemTotal, { color: colors.primary }]}>{formatCurrency(item.product.sellingPrice * item.quantity, settings.currency)}</Text>
                  <TouchableOpacity onPress={() => removeFromCart(item.product.id)} style={{ marginLeft: 4 }} accessibilityLabel="Remove from cart" accessibilityRole="button">
                    <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </MotiView>
            ))}
          </ScrollView>
        )}

        {cart.length > 0 && (
          <TouchableOpacity style={[s.checkoutBtn, { backgroundColor: colors.primary }]} onPress={openCheckout}>
            <Text style={s.checkoutTotal}>{formatCurrency(cartTotal, settings.currency)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={s.checkoutLabel}>{t('checkout')}</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
        )}
      </View>

      <View style={[s.emptyContainer]}></View>

      {/* Checkout Bottom Sheet */}
      <AppBottomSheet
        ref={checkoutSheetRef}
        onDismiss={() => { setCheckoutStep('form'); setLastBill(null); setShowUpiQr(false); refocusBtInput(); }}
      >
        {checkoutStep === 'success' && lastBill ? (
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 220 }}
            style={s.successSheetContent}
          >
            <View style={[s.successSheetIcon, { backgroundColor: colors.success + '18' }]}>
              <Ionicons name="checkmark-circle" size={52} color={colors.success} />
            </View>
            <Text style={[s.successSheetTitle, { color: colors.text }]}>Bill Generated!</Text>
            <Text style={[s.successSheetSub, { color: colors.textMuted }]}>
              Total {formatCurrency(lastBill.total, settings.currency)}{'  ·  '}Profit {formatCurrency(lastBill.profit, settings.currency)}
            </Text>
            <TouchableOpacity style={s.waBtn} onPress={() => shareOnWhatsApp(lastBill)} activeOpacity={0.85}>
              <Ionicons name="logo-whatsapp" size={22} color="#fff" />
              <Text style={s.waBtnText}>
                {lastBill.customerName
                   ? t('sendTo').replace('{name}', lastBill.customerName)
                   : lastBill.customerPhone
                   ? t('sendToPhone').replace('{phone}', lastBill.customerPhone)
                   : t('shareViaWhatsapp')}
              </Text>
            </TouchableOpacity>
            {!!settings.upiId && (
              <TouchableOpacity
                style={[s.upiBtn, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
                onPress={() => setShowUpiQr(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
                 <Text style={[s.upiBtnText, { color: colors.primary }]}>{t('showUpiQr')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.doneBtn} onPress={closeCheckout}>
              <Text style={[s.doneLink, { color: colors.textMuted }]}>{t('done')}</Text>
            </TouchableOpacity>
          </MotiView>
        ) : null}
        {checkoutStep === 'form' && (
        <BottomSheetScrollView contentContainerStyle={s.sheetContent}>
          <Text style={[s.modalTitle, { color: colors.text }]}>{t('generateBill')}</Text>

          <Text style={[s.modalLabel, { color: colors.textSub }]}>{t('customerName')}</Text>
          <BottomSheetTextInput
            style={[s.modalInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            placeholder={t('optional')} value={customerName} onChangeText={setCustomerName}
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[s.modalLabel, { color: colors.textSub }]}>{t('phoneNumber')}</Text>
          <BottomSheetTextInput
            style={[s.modalInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            placeholder={t('optional')} value={customerPhone} onChangeText={setCustomerPhone}
            keyboardType="phone-pad" placeholderTextColor={colors.textMuted}
          />
          {paymentMode === 'credit' && (
            <Text style={{ color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, marginTop: 4 }}>
              {t('creditSalesAddedToUdhaar')}
            </Text>
          )}

          {settings.gstRegistered && (
             <>
               <Text style={[s.modalLabel, { color: colors.textSub }]}>{t('customerGstin')}</Text>
              <BottomSheetTextInput
                style={[s.modalInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
                placeholder="22AAAAA0000A1Z5" value={customerGstin} onChangeText={setCustomerGstin}
                autoCapitalize="characters" placeholderTextColor={colors.textMuted}
              />
            </>
          )}

          <Text style={[s.modalLabel, { color: colors.textSub }]}>{t('discount')} ({settings.currency})</Text>
          <BottomSheetTextInput
            style={[s.modalInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            value={discount} onChangeText={v => setDiscount(sanitizeDecimal(v))} keyboardType="numeric" placeholderTextColor={colors.textMuted}
          />

          <Text style={[s.modalLabel, { color: colors.textSub }]}>{t('paymentMode')}</Text>
          <View style={s.paymentRow}>
            {(['cash', 'upi', 'credit'] as const).map(mode => {
              const active = paymentMode === mode;
              const mc = payModeColors[mode];
              return (
                <TouchableOpacity key={mode} style={[s.paymentBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderColor: active ? mc : colors.border, backgroundColor: active ? mc : 'transparent' }]}
                  onPress={() => setPaymentMode(mode)}>
                  <Ionicons name={mode === 'cash' ? 'cash-outline' : mode === 'upi' ? 'phone-portrait-outline' : 'document-text-outline'} size={15} color={active ? '#fff' : mc} />
                  <Text style={{ color: active ? '#fff' : mc, fontFamily: fonts.bold, fontSize: 12 }}>
                    {mode === 'cash' ? t('cash') : mode === 'upi' ? t('upi') : t('credit')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {(() => {
            // Compute live GST preview from current cart
            const gstItems = cart.filter(i => (i.product.gstRate || 0) > 0);
            const totalGstAmt = gstItems.reduce((s, i) => {
              const lineTotal = i.product.sellingPrice * i.quantity;
              return s + lineTotal - lineTotal / (1 + (i.product.gstRate || 0) / 100);
            }, 0);
            const totalTaxable = cartTotal - totalGstAmt;
            return (
              <View style={[s.summaryBox, { backgroundColor: colors.surfaceHigh }]}>
                <View style={s.summaryRow}>
                  <Text style={{ color: colors.textSub, fontFamily: fonts.regular, fontSize: 14 }}>
                     {settings.gstRegistered ? t('taxableValue') : t('subtotal')}
                  </Text>
                  <Text style={{ color: colors.text, fontFamily: fonts.regular, fontSize: 14 }}>
                    {formatCurrency(settings.gstRegistered ? totalTaxable : cartTotal, settings.currency)}
                  </Text>
                </View>
                {settings.gstRegistered && totalGstAmt > 0 && (
                  <>
                    <View style={s.summaryRow}>
                      <Text style={{ color: colors.textSub, fontFamily: fonts.regular, fontSize: 13 }}>{t('cgst')}</Text>
                      <Text style={{ color: colors.textSub, fontFamily: fonts.regular, fontSize: 13 }}>{formatCurrency(totalGstAmt / 2, settings.currency)}</Text>
                    </View>
                    <View style={s.summaryRow}>
                       <Text style={{ color: colors.textSub, fontFamily: fonts.regular, fontSize: 13 }}>{t('sgst')}</Text>
                      <Text style={{ color: colors.textSub, fontFamily: fonts.regular, fontSize: 13 }}>{formatCurrency(totalGstAmt / 2, settings.currency)}</Text>
                    </View>
                  </>
                )}
                {discountNum > 0 && (
                  <View style={s.summaryRow}>
                    <Text style={{ color: colors.textSub, fontFamily: fonts.regular, fontSize: 14 }}>Discount</Text>
                    <Text style={{ color: colors.success, fontFamily: fonts.regular, fontSize: 14 }}>−{formatCurrency(discountNum, settings.currency)}</Text>
                  </View>
                )}
                <View style={[s.summaryRow, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 8 }]}>
                  <Text style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 16 }}>Total</Text>
                  <Text style={{ color: colors.primary, fontFamily: fonts.display, fontSize: 20 }}>{formatCurrency(finalTotal, settings.currency)}</Text>
                </View>
              </View>
            );
          })()}

          <View style={s.modalBtns}>
            <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={closeCheckout}>
              <Text style={{ color: colors.textSub, fontFamily: fonts.semiBold }}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.confirmBtn, { backgroundColor: colors.primary }]} onPress={handleCheckout} disabled={processing}>
              {processing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: '#fff', fontFamily: fonts.extraBold, fontSize: 15 }}>{t('generateBill')}</Text>
              }
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
        )}
      </AppBottomSheet>

      {/* UPI QR Modal */}
      <AppModal visible={showUpiQr} onRequestClose={() => setShowUpiQr(false)}>
        <Pressable style={s.qrOverlay} onPress={() => setShowUpiQr(false)}>
          <Pressable style={[s.qrCard, { backgroundColor: colors.surface }]} onPress={() => {}}>
            {/* Header */}
            <View style={s.qrCardHeader}>
              <Text style={[s.qrCardTitle, { color: colors.text }]}>{t('upiPayment')}</Text>
              <TouchableOpacity onPress={() => setShowUpiQr(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close" accessibilityRole="button">
                <Ionicons name="close" size={22} color={colors.textSub} />
              </TouchableOpacity>
            </View>

            {/* Shop + amount */}
            <Text style={[s.qrShopName, { color: colors.text }]}>{settings.shopName}</Text>
            <Text style={[s.qrAmount, { color: colors.primary }]}>
              {formatCurrency(lastBill?.total ?? 0, settings.currency)}
            </Text>

            {/* QR Code */}
            <View style={[s.qrBox, { backgroundColor: '#fff' }]}>
              <QRCode
                value={`upi://pay?pa=${encodeURIComponent(settings.upiId ?? '')}&pn=${encodeURIComponent(settings.shopName)}&am=${lastBill?.total ?? 0}&cu=INR`}
                size={200}
                color="#000"
                backgroundColor="#fff"
              />
            </View>

            {/* UPI ID */}
            <Text style={[s.qrUpiId, { color: colors.textMuted }]}>
              {settings.upiId}
            </Text>
            <Text style={[s.qrScanHint, { color: colors.textSub }]}>
              {t('scanWithUpi')}
            </Text>
          </Pressable>
        </Pressable>
      </AppModal>

      {/* Templates List Sheet */}
      <AppBottomSheet
        ref={templatesSheetRef}
        snapPoints={templatesSheetSnap}
      >
        <BottomSheetScrollView contentContainerStyle={s.sheetContent}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <View>
               <Text style={[s.modalTitle, { color: colors.text }]}>{t('templates')}</Text>
               <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, marginTop: 3 }}>
                 {templates.length === 0 ? t('noTemplatesYet') : templates.length === 1 ? t('savedTemplate').replace('{count}', String(templates.length)) : t('savedTemplatePlural').replace('{count}', String(templates.length))}
               </Text>
            </View>
            <TouchableOpacity onPress={closeTemplatesSheet} style={{ padding: 4 }} accessibilityLabel="Close" accessibilityRole="button">
              <Ionicons name="close" size={22} color={colors.textSub} />
            </TouchableOpacity>
          </View>

          {templates.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
              <View style={[s.emptyIconBox, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="bookmark-outline" size={32} color={colors.primary} />
              </View>
               <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.text }}>{t('noTemplatesYet')}</Text>
               <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', maxWidth: 240 }}>
                 {t('buildCartToSaveTemplate')}
               </Text>
            </View>
          ) : (
            templates.map(tmpl => {
              const isExpanded = expandedTemplateId === tmpl.id;
              return (
                <View key={tmpl.id} style={[s.templateCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
                  {/* Compact header — always visible */}
                  <TouchableOpacity
                    style={s.templateCardHeader}
                    onPress={() => setExpandedTemplateId(isExpanded ? null : tmpl.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.templateIconBox, { backgroundColor: colors.primaryLight }]}>
                      <Ionicons name="bookmark" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.templateCardName, { color: colors.text }]} numberOfLines={1}>{tmpl.name}</Text>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                        {tmpl.items.length} item{tmpl.items.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[s.loadIconBtn, { backgroundColor: colors.primary }]}
                      onPress={() => { closeTemplatesSheet(); setTimeout(() => handleLoadTemplate(tmpl), 150); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Load template into cart"
                      accessibilityRole="button"
                    >
                      <Ionicons name="cart-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.textMuted}
                      style={{ marginLeft: 8 }}
                    />
                  </TouchableOpacity>

                  {/* Expandable section */}
                  {isExpanded && (
                    <MotiView
                      from={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ type: 'timing', duration: 180 }}
                    >
                      <View style={[s.templateDivider, { backgroundColor: colors.border }]} />

                      {/* Items list */}
                      <View style={s.templateItemsList}>
                        {tmpl.items.map((item, idx) => {
                          const inStock = products.find(p => p.id === item.productId);
                          return (
                            <View key={item.productId} style={[s.templateItemRow, idx < tmpl.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                              <View style={[s.stockDot, { backgroundColor: !inStock || inStock.quantity <= 0 ? colors.danger : inStock.quantity <= inStock.lowStockThreshold ? colors.warning : colors.success }]} />
                              <Text style={[s.templateItemName, { color: colors.text }]} numberOfLines={1}>{item.productName}</Text>
                              <Text style={[s.templateItemQty, { color: colors.primary }]}>×{item.quantity}</Text>
                            </View>
                          );
                        })}
                      </View>

                      {/* Edit / Delete */}
                      <View style={[s.templateActions, { borderTopColor: colors.border }]}>
                        <TouchableOpacity
                          style={[s.iconActionBtn, { backgroundColor: colors.primaryLight }]}
                          onPress={() => openRenameSheet(tmpl)}
                          accessibilityLabel="Rename template"
                          accessibilityRole="button"
                        >
                          <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.iconActionBtn, { backgroundColor: colors.danger + '15' }]}
                          onPress={() => handleDeleteTemplate(tmpl.id, tmpl.name)}
                          accessibilityLabel="Delete template"
                          accessibilityRole="button"
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </MotiView>
                  )}
                </View>
              );
            })
          )}
        </BottomSheetScrollView>
      </AppBottomSheet>

      {/* Rename Template Sheet */}
      <AppBottomSheet
        ref={renameSheetRef}
        detached
        onDismiss={() => setRenameTarget(null)}
      >
        <BottomSheetScrollView contentContainerStyle={s.sheetContent}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <Text style={[s.modalTitle, { color: colors.text }]}>{t('renameTemplate')}</Text>
            <TouchableOpacity onPress={closeRenameSheet} accessibilityLabel="Close" accessibilityRole="button">
              <Ionicons name="close" size={22} color={colors.textSub} />
            </TouchableOpacity>
          </View>
          <Text style={[s.modalLabel, { color: colors.textSub }]}>{t('newName')}</Text>
          <BottomSheetTextInput
            style={[s.modalInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            value={renameName}
            onChangeText={setRenameName}
            returnKeyType="done"
            onSubmitEditing={handleRename}
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity
            style={[s.confirmBtn, { backgroundColor: renameName.trim() ? colors.primary : colors.border, marginTop: 6 }]}
            onPress={handleRename}
            disabled={!renameName.trim() || renameSaving}
          >
             <Text style={{ color: '#fff', fontFamily: fonts.extraBold, fontSize: 15 }}>
               {renameSaving ? t('saving') : t('saveName')}
            </Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </AppBottomSheet>

      {/* Save Template Sheet */}
      <AppBottomSheet
        ref={saveTemplateSheetRef}
        detached
      >
        <BottomSheetScrollView contentContainerStyle={s.sheetContent}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
             <Text style={[s.modalTitle, { color: colors.text }]}>{t('saveAsTemplate')}</Text>
            <TouchableOpacity onPress={closeSaveSheet} accessibilityLabel="Close" accessibilityRole="button">
              <Ionicons name="close" size={22} color={colors.textSub} />
            </TouchableOpacity>
          </View>
           <Text style={[s.modalLabel, { color: colors.textSub }]}>{t('templateName')}</Text>
           <BottomSheetTextInput
             style={[s.modalInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
             placeholder={t('templatePlaceholder')}
             placeholderTextColor={colors.textMuted}
             value={templateName}
             onChangeText={setTemplateName}
             returnKeyType="done"
             onSubmitEditing={handleSaveTemplate}
           />
          <Text style={[{ color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, marginBottom: 16 }]}>
            {cart.length === 1 ? t('itemWillBeSaved').replace('{count}', String(cart.length)) : t('itemsWillBeSaved').replace('{count}', String(cart.length))}
          </Text>
          <TouchableOpacity
            style={[s.confirmBtn, { backgroundColor: templateName.trim() ? colors.primary : colors.border }]}
            onPress={handleSaveTemplate}
            disabled={!templateName.trim() || savingTemplate}
          >
            <Text style={{ color: '#fff', fontFamily: fonts.extraBold, fontSize: 15 }}>
              {savingTemplate ? t('saving') : t('saveTemplate')}
            </Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </AppBottomSheet>

      {/* Hidden input — always focused, captures BT HID scanner keystrokes silently.
          Must be 1×1 (not 0×0) so Android's IMF routes keyboard events to it.
          Only mounted when the Bluetooth scanner feature is enabled in settings. */}
      {btEnabled && (
      <TextInput
        ref={btInputRef}
        value={btBuffer}
        onChangeText={(t) => {
          btBufferRef.current = t;
          setBtBuffer(t);
          if (t)          // Restart the completion timer on every keystroke.
          // If no new char arrives in 120ms → barcode is complete (handles scanners that don't send Enter).
          if (scanTimer.current) clearTimeout(scanTimer.current);
          if (t.length >= 4) scanTimer.current = setTimeout(handleBtScan, 120);
        }}
        onSubmitEditing={handleBtScan}
        onFocus={() => { setBtActive(true);; }}
        onBlur={() => {
          setBtActive(false);
          // Self-heal: if Billing is still the active tab the blur was unexpected
          // (iOS UIScrollView resigned first-responder during PagerView programmatic
          // scroll; Android IMF dropped focus mid-transition).
          // Use TextInput.State.currentlyFocusedInput() — not Keyboard.isVisible() —
          // because showSoftInputOnFocus={false} makes iOS keyboard-visibility tracking
          // unreliable. If another input grabbed focus the user tapped it intentionally;
          // if nothing is focused it was PagerView/IMF stealing it unexpectedly.
          if (isBillingFocused.current) {
            setTimeout(() => {
              if (isBillingFocused.current && !TextInput.State.currentlyFocusedInput()) {
                btInputRef.current?.focus();
              }
            }, 50);
          }
        }}
        blurOnSubmit={false}
        showSoftInputOnFocus={false}
        caretHidden
        autoFocus
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, bottom: 0, left: 0 }}
      />
      )}

      <BarcodeScannerModal visible={showScanner} onClose={() => { setShowScanner(false); refocusBtInput(); }} onScanned={handleBarcodeScanned} />

    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', padding: 12, gap: 10, alignItems: 'center', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, padding: 0, fontFamily: fonts.regular },
  iconBtn: { alignItems: 'center', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, justifyContent: 'center', borderWidth: 0.5 },
  sectionLabel: { fontFamily: fonts.bold, fontSize: 13, paddingHorizontal: 8, marginTop:8, marginBottom: 8 },
  quickChip: { borderRadius: 10, padding: 12, alignItems: 'center', minWidth: 90, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  quickChipName: { fontFamily: fonts.bold, fontSize: 13, marginBottom: 4 },
  quickChipPrice: { fontFamily: fonts.semiBold, fontSize: 12 },
  templateAccessBtn: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, gap: 3, marginLeft: 8, overflow: 'visible' },
  templateAccessText: { fontFamily: fonts.bold, fontSize: 11 },
  templateCountBadge: { borderRadius: 8, minWidth: 16, height: 16, paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center' },
  templateCountText: { color: '#fff', fontFamily: fonts.extraBold, fontSize: 10 },
  quickAddDivider: { width: 1, height: 36, marginHorizontal: 8 },
  emptyIconBox: { width: 68, height: 68, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  templateCard: { borderRadius: 10, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  templateCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  templateIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  templateCardName: { fontFamily: fonts.extraBold, fontSize: 15 },
  templateDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  templateItemsList: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  templateItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  stockDot: { width: 7, height: 7, borderRadius: 4 },
  templateItemName: { fontFamily: fonts.medium, fontSize: 13, flex: 1 },
  templateItemQty: { fontFamily: fonts.extraBold, fontSize: 13 },
  templateActions: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  loadIconBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  iconActionBtn: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  productRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 0.5, gap: 12 },
  rowThumb: { width: 44, height: 44, borderRadius: 12 },
  productName: { fontFamily: fonts.bold, fontSize: 15 },
  productMeta: { fontFamily: fonts.regular, fontSize: 12 },
  productPrice: { fontFamily: fonts.extraBold, fontSize: 15, marginRight: 4 },
  addBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  cartContainer: { marginHorizontal: 8, borderRadius: 10, display: 'flex', flex: 1 },
  emptyContainer: { height: 90 },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5 },
  cartTitle: { fontFamily: fonts.extraBold, fontSize: 16 },
  cartBadge: { width: 18, height: 18, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cartBadgeText: { color: '#fff', fontFamily: fonts.extraBold, fontSize: 12 },
  cartItems: { display: 'flex' },
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  cartItemName: { fontFamily: fonts.bold, fontSize: 14 },
  cartItemPrice: { fontFamily: fonts.regular, fontSize: 12, marginTop: 3 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10 },
  qtyBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  qtyBtnText: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 20 },
  qtyText: { fontFamily: fonts.extraBold, fontSize: 15, minWidth: 24, textAlign: 'center' },
  cartItemTotal: { fontFamily: fonts.extraBold, fontSize: 14, minWidth: 60, textAlign: 'right' },
  checkoutBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: 14, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 16 },
  checkoutTotal: { color: '#fff', fontFamily: fonts.display, fontSize: 18 },
  checkoutLabel: { color: '#fff', fontFamily: fonts.bold, fontSize: 15 },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 24 },
  modalTitle: { fontFamily: fonts.extraBold, fontSize: 18, marginBottom: 8 },
  modalLabel: { fontFamily: fonts.bold, fontSize: 13, marginBottom: 8, marginTop: 14 },
  modalInput: { borderRadius: 14, padding: 14, fontSize: 15, borderWidth: 1, fontFamily: fonts.regular, color: 'black' },
  paymentRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  paymentBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  summaryBox: { borderRadius: 14, padding: 16, marginTop: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 18 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  confirmBtn: { flex: 2, padding: 16, borderRadius: 14, alignItems: 'center' },
  successSheetContent: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  successSheetIcon: { width: 76, height: 76, borderRadius: 38, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  successSheetTitle: { fontFamily: fonts.display, fontSize: 20, marginBottom: 4 },
  successSheetSub: { fontFamily: fonts.regular, fontSize: 14, marginBottom: 24 },
  waBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#25D366', paddingVertical: 14, borderRadius: 10, marginBottom: 8 },
  waBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 16 },
  upiBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 10, marginBottom: 4, borderWidth: 1.5 },
  upiBtnText: { fontFamily: fonts.bold, fontSize: 15 },
  doneBtn: { paddingVertical: 14, paddingHorizontal: 24 },
  doneLink: { fontFamily: fonts.medium, fontSize: 15 },
  // UPI QR modal
  qrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  qrCard: { width: '100%', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  qrCardHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  qrCardTitle: { fontFamily: fonts.extraBold, fontSize: 17 },
  qrShopName: { fontFamily: fonts.bold, fontSize: 15, marginBottom: 4, textAlign: 'center' },
  qrAmount: { fontFamily: fonts.display, fontSize: 28, marginBottom: 20, textAlign: 'center' },
  qrBox: { padding: 16, borderRadius: 16, marginBottom: 16 },
  qrUpiId: { fontFamily: fonts.semiBold, fontSize: 13, marginBottom: 4 },
  qrScanHint: { fontFamily: fonts.regular, fontSize: 12 },
});
