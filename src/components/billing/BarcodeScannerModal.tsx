import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';
import AppModal from '../common/AppModal';
import { fonts } from '../../theme/typography';

const beepSound = require('../../../assets/sounds/beep.wav');

interface Props {
  visible: boolean;
  onClose: () => void;
  onScanned: (barcode: string) => void;
}

export default function BarcodeScannerModal({ visible, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const hasScanned = useRef(false);
  const insets = useSafeAreaInsets();
  const beepPlayer = useAudioPlayer(beepSound);

  useEffect(() => {
    if (visible) {
      hasScanned.current = false;
      setScanned(false);
      if (!permission?.granted) requestPermission();
    }
  }, [visible]);

  const handleBarcode = ({ data }: { data: string }) => {
    if (hasScanned.current) return;
    hasScanned.current = true;
    setScanned(true);
    beepPlayer.seekTo(0);
    beepPlayer.play();
    onScanned(data);
  };

  return (
    // edges={[]} → camera fills the whole screen; we pad the header with the real inset.
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose} edges={[]}>
      <View style={styles.container}>
        {/* Camera background */}
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarcode}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'qr', 'code128', 'code39'],
            }}
          />
        ) : (
          <View style={styles.noCam}>
            <Ionicons name="camera-outline" size={64} color="rgba(255,255,255,0.4)" />
            <Text style={styles.noCamText}>Camera permission needed</Text>
            <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Overlay UI */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.headerTitle}>Scan Barcode</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Centered scan box */}
          <View style={styles.body} pointerEvents="box-none">
            <View style={styles.scanBox}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
            </View>
            <Text style={styles.hint}>Align the barcode inside the box</Text>

            {scanned && (
              <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
                <Ionicons name="refresh" size={16} color="#6C63FF" />
                <Text style={styles.rescanText}>Tap to scan again</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </AppModal>
  );
}

const CORNER = 24;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  noCam: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32, backgroundColor: '#0A0A1B' },
  noCamText: { color: 'rgba(255,255,255,0.7)', fontSize: 16, textAlign: 'center' },
  permBtn: { backgroundColor: '#6C63FF', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { color: '#fff', fontFamily: fonts.bold },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  headerTitle: { fontFamily: fonts.bold, fontSize: 18, color: '#fff' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center',
  },

  body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanBox: { width: 260, height: 180 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#6C63FF', borderWidth: 3 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  hint: { color: 'rgba(255,255,255,0.85)', marginTop: 24, fontFamily: fonts.medium, fontSize: 14 },
  rescanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 28,
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30,
  },
  rescanText: { color: '#5B7567', fontFamily: fonts.bold },
});
