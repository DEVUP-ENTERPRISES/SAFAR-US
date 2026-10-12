import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function BottomSheet({ visible, onClose, title, children, footer }: BottomSheetProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <Pressable accessibilityLabel="Close" style={[styles.backdrop, { backgroundColor: c.overlay }]} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + space.lg }]}>
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          {title ? <Text variant="title" style={styles.title}>{title}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: StyleSheet.absoluteFill,
  sheet: { borderTopLeftRadius: radius.xl + 6, borderTopRightRadius: radius.xl + 6, maxHeight: '88%', paddingTop: space.sm },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: space.md },
  title: { paddingHorizontal: space.lg, marginBottom: space.sm },
  body: { paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.md },
  footer: { paddingHorizontal: space.lg, gap: space.sm },
});
