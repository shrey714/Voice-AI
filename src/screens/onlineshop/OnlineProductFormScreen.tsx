import React, { useLayoutEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, Switch } from 'react-native';
import { Image } from 'expo-image';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/useAppStore';
import { useOnlineShopStore, OnlineProductInput } from '../../stores/useOnlineShopStore';
import { formatCurrency, sanitizeDecimal, sanitizeInteger } from '../../utils/helpers';
import { OnlineProduct } from '../../types/online';
import { Product } from '../../types';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import { toast } from '../../utils/toast';
import { useConfirm } from '../../components/common/ConfirmDialogProvider';

const emptyForm = { name: '', category: 'General', storePrice: '', onlinePrice: '', quantity: '', unit: 'pcs', imageUrl: '' as string | null, localImageUri: '', isVisible: true };

/**
 * Add or edit a single online-catalog listing. `editing` (an existing
 * OnlineProduct) opens it for editing; `importFrom` (a local Product) seeds a
 * brand-new listing with a one-time copy of that product's fields — after
 * Save there is no ongoing link back to it. Neither param means a blank
 * "create new" form.
 */
export default function OnlineProductFormScreen({ route, navigation }: any) {
  const { colors } = useAppTheme();
  const { settings } = useAppStore(
    useShallow(state => ({
      settings: state.settings,
    }))
  );
  const { confirmActions } = useConfirm();
  const { createOnlineProduct, updateOnlineProduct, isSavingProduct } = useOnlineShopStore(
    useShallow(state => ({
      createOnlineProduct: state.createOnlineProduct,
      updateOnlineProduct: state.updateOnlineProduct,
      isSavingProduct: state.isSavingProduct,
    }))
  );

  const editing: OnlineProduct | null = route?.params?.editing ?? null;
  const importFrom: Product | null = route?.params?.importFrom ?? null;

  const [form, setForm] = useState(() => {
    if (editing) {
      return {
        name: editing.name,
        category: editing.category,
        storePrice: String(editing.storePrice),
        onlinePrice: editing.onlinePrice != null ? String(editing.onlinePrice) : '',
        quantity: String(editing.quantity),
        unit: editing.unit,
        imageUrl: editing.imageUrl,
        localImageUri: '',
        isVisible: editing.isVisible,
      };
    }
    if (importFrom) {
      return {
        name: importFrom.name,
        category: importFrom.category,
        storePrice: String(importFrom.sellingPrice),
        onlinePrice: '',
        quantity: String(importFrom.quantity),
        unit: importFrom.unit,
        imageUrl: importFrom.imageUri?.startsWith('http') ? importFrom.imageUri : null,
        localImageUri: importFrom.imageUri && !importFrom.imageUri.startsWith('http') ? importFrom.imageUri : '',
        isVisible: true,
      };
    }
    return emptyForm;
  });

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const name = form.name.trim();
    const storePrice = parseFloat(form.storePrice) || 0;
    const quantity = parseInt(form.quantity) || 0;
    const onlinePrice = form.onlinePrice.trim() ? parseFloat(form.onlinePrice) : null;

    if (!name) { Alert.alert('Missing name', 'Enter a product name.'); return; }
    if (storePrice <= 0) { Alert.alert('Invalid price', 'Price must be greater than 0.'); return; }
    if (onlinePrice != null && onlinePrice >= storePrice) {
      Alert.alert('Check online price', 'The discounted online price should be lower than the regular price.');
      return;
    }

    const input: OnlineProductInput = {
      name,
      category: form.category,
      storePrice,
      onlinePrice,
      quantity,
      unit: form.unit,
      imageUrl: form.imageUrl,
      localImageUri: form.localImageUri || undefined,
      isVisible: form.isVisible,
    };

    setSaving(true);
    try {
      if (editing) {
        await updateOnlineProduct(editing.id, input);
        toast.success('Listing updated');
      } else {
        await createOnlineProduct(input);
        toast.success('Listing added');
      }
      navigation.goBack();
    } catch (e: any) {
      toast.error('Could not save', { description: e?.message ?? 'Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async () => {
    const choice = await confirmActions({
      title: 'Product photo',
      message: 'Choose a source',
      actions: [
        { label: 'Take photo', value: 'camera' },
        { label: 'Gallery', value: 'gallery' },
      ],
    });
    if (choice === 'camera') {
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 });
      if (!r.canceled && r.assets[0]) setForm((f) => ({ ...f, localImageUri: r.assets[0].uri, imageUrl: null }));
    } else if (choice === 'gallery') {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
      if (!r.canceled && r.assets[0]) setForm((f) => ({ ...f, localImageUri: r.assets[0].uri, imageUrl: null }));
    }
  };

  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  useLayoutEffect(() => {
    navigation.setOptions({
      title: editing ? 'Edit Listing' : 'Add Online Product',
      headerRight: () => (
        <TouchableOpacity onPress={() => saveRef.current()} disabled={saving || isSavingProduct} hitSlop={10} style={{ paddingHorizontal: 4 }}>
          {(saving || isSavingProduct)
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={{ color: colors.primary, fontFamily: fonts.extraBold, fontSize: 16 }}>Save</Text>}
        </TouchableOpacity>
      ),
    });
  }, [navigation, saving, isSavingProduct, editing, colors]);

  const previewUri = form.localImageUri || form.imageUrl;
  const s = makeStyles(colors);

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {importFrom && !editing && (
          <View style={[s.importBanner, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="download-outline" size={16} color={colors.primary} />
            <Text style={[s.importBannerText, { color: colors.primary }]}>
              Pre-filled from "{importFrom.name}" — tweak anything before saving. This won't stay linked to your local product.
            </Text>
          </View>
        )}

        {/* Photo picker */}
        <TouchableOpacity style={[s.imagePicker, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={pickImage}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={s.productImage} />
          ) : (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Ionicons name="camera-outline" size={32} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: fonts.regular }}>Add a photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <Field label="Product Name *" colors={colors}>
          <TextInput
            style={[s.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="e.g. Cello Pen Blue"
            placeholderTextColor={colors.textMuted}
          />
        </Field>

        <Field label="Category" colors={colors}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(settings.productCategories ?? []).map((cat) => {
              const active = form.category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[s.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }]}
                  onPress={() => setForm((f) => ({ ...f, category: cat }))}
                >
                  <Text style={{ color: active ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 13 }}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Field>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label={`Price * (${settings.currency})`} colors={colors} flex>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={form.storePrice}
              onChangeText={(v) => setForm((f) => ({ ...f, storePrice: sanitizeDecimal(v) }))}
              keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted}
            />
          </Field>
          <Field label={`Online discount price (${settings.currency})`} colors={colors} flex>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={form.onlinePrice}
              onChangeText={(v) => setForm((f) => ({ ...f, onlinePrice: sanitizeDecimal(v) }))}
              keyboardType="numeric" placeholder="Same as price" placeholderTextColor={colors.textMuted}
            />
          </Field>
        </View>
        {form.storePrice && form.onlinePrice ? (
          <Text style={[s.priceHint, { color: colors.textMuted }]}>
            Customers see {formatCurrency(parseFloat(form.storePrice) || 0, settings.currency)} struck through, {formatCurrency(parseFloat(form.onlinePrice) || 0, settings.currency)} as the price.
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Online stock" colors={colors} flex>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={form.quantity}
              onChangeText={(v) => setForm((f) => ({ ...f, quantity: sanitizeInteger(v) }))}
              keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted}
            />
          </Field>
          <Field label="Unit" colors={colors} flex>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {(settings.units ?? []).map((u) => {
                const active = form.unit === u;
                return (
                  <TouchableOpacity
                    key={u}
                    style={[s.unitChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }]}
                    onPress={() => setForm((f) => ({ ...f, unit: u }))}
                  >
                    <Text style={{ color: active ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 12 }}>{u}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Field>
        </View>
        <Text style={[s.priceHint, { color: colors.textMuted, marginTop: -6 }]}>
          Tracked separately from your in-store stock — update it here as online orders come in.
        </Text>

        <View style={[s.switchRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.text }}>Visible online</Text>
            <Text style={[s.priceHint, { color: colors.textMuted, marginTop: 2 }]}>Customers can see and order this</Text>
          </View>
          <Switch
            value={form.isVisible}
            onValueChange={(v) => setForm((f) => ({ ...f, isVisible: v }))}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={form.isVisible ? '#fff' : colors.textMuted}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, children, colors, flex }: any) {
  return (
    <View style={{ marginBottom: 16, flex: flex ? 1 : undefined }}>
      <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.textSub, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  root: { flex: 1 },
  importBanner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 12, padding: 12, marginBottom: 16 },
  importBannerText: { flex: 1, fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  imagePicker: {
    borderRadius: 14, height: 120, justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, borderStyle: 'dashed', borderWidth: 1.5, overflow: 'hidden',
  },
  productImage: { width: '100%', height: 120, borderRadius: 14 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, fontFamily: fonts.regular },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  unitChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  priceHint: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, marginTop: 4 },
});
