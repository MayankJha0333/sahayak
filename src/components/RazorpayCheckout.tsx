import { useMemo, useRef } from 'react';
import { Modal, Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { CreditCard } from './icons';
import { AppBar, Badge, Btn, Card, Eyebrow, Screen, SplitRow, Tiny } from './ui';
import { inr } from '@/lib/format';
import { PAYMENTS_TEST_MODE, RAZORPAY_KEY_ID } from '@/lib/firebase';
import { useTheme } from '@/theme';

export type RazorpaySuccess = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };

type Props = {
  visible: boolean;
  orderId: string;
  amount: number;       // paise
  /** Key id returned with the order by the server (falls back to the app's key). */
  keyId?: string;
  name?: string;
  description: string;
  prefill?: { name?: string; contact?: string; email?: string };
  onSuccess: (r: RazorpaySuccess) => void;
  onDismiss: (reason?: string) => void;
};

/**
 * On phones the checkout runs in Razorpay's redirect mode: banks, card checks (OTP pages) and UPI open as full
 * pages inside the WebView instead of pop-ups, which a WebView blocks. When Razorpay is done it sends the page
 * here; we stop that load and let the server ask Razorpay whether the order was paid.
 */
const RETURN_URL = 'https://sahayak.app/payment-return';

/**
 * Razorpay Standard Checkout inside a WebView. Works in Expo Go and on the web,
 * so no native build is needed. Test-mode keys open the sandbox checkout.
 */
export function RazorpayCheckout({ visible, orderId, amount, keyId, name = 'Sahayak', description, prefill, onSuccess, onDismiss }: Props) {
  const html = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#F6F5F4;font-family:-apple-system,system-ui,sans-serif">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var post = function (m) { (window.ReactNativeWebView ? window.ReactNativeWebView.postMessage : function(x){ window.parent.postMessage(x, '*'); })(JSON.stringify(m)); };
  var rzp = new Razorpay({
    key: ${JSON.stringify(keyId || RAZORPAY_KEY_ID)},
    order_id: ${JSON.stringify(orderId)},
    amount: ${amount},
    currency: 'INR',
    name: ${JSON.stringify(name)},
    description: ${JSON.stringify(description)},
    theme: { color: '#F25C45' },
    prefill: ${JSON.stringify(prefill ?? {})},
    retry: { enabled: true, max_count: 3 },
    modal: { ondismiss: function () { post({ type: 'dismiss' }); }, confirm_close: true },
    handler: function (r) { post({ type: 'success', payload: r }); }${Platform.OS === 'web' ? '' : `,
    redirect: true,
    callback_url: ${JSON.stringify(RETURN_URL)}`}
  });
  // A failed attempt stays inside Razorpay so she can retry another method; we only hear about it for the record.
  rzp.on('payment.failed', function (e) { post({ type: 'attempt_failed', error: e.error && e.error.description }); });
  rzp.open();
</script></body></html>`, [orderId, amount, keyId, name, description, prefill]);

  const lastError = useRef<string | null>(null);
  const onMessage = (raw: string) => {
    try {
      const m = JSON.parse(raw) as { type: string; payload?: RazorpaySuccess; error?: string };
      if (m.type === 'success' && m.payload) onSuccess(m.payload);
      else if (m.type === 'attempt_failed') lastError.current = m.error ?? 'Payment failed';
      else onDismiss(lastError.current ?? undefined);
    } catch { onDismiss(); }
  };

  if (!visible) return null;

  if (PAYMENTS_TEST_MODE) return <TestCheckout amount={amount} description={description} orderId={orderId} onSuccess={onSuccess} onDismiss={onDismiss} />;

  return (
    <Modal visible animationType="slide" onRequestClose={() => onDismiss()}>
      <View className="flex-1 bg-ground dark:bg-ground-dark">
        <AppBar title="Secure payment" subtitle="Razorpay" back onBack={() => onDismiss(lastError.current ?? undefined)} />
        {Platform.OS === 'web' ? (
          <iframe title="Razorpay" srcDoc={html} style={{ flex: 1, border: 0 }} onLoad={() => {
            window.addEventListener('message', (e) => typeof e.data === 'string' && onMessage(e.data), { once: false });
          }} />
        ) : (
          <WebView
            originWhitelist={['*']}
            source={{ html, baseUrl: 'https://checkout.razorpay.com' }}
            onMessage={(e) => onMessage(e.nativeEvent.data)}
            onShouldStartLoadWithRequest={(req) => {
              if (!req.url.startsWith(RETURN_URL)) return true;
              // Paid or not, Razorpay is finished. The server checks the order with Razorpay itself.
              onSuccess({ razorpay_order_id: orderId, razorpay_payment_id: '', razorpay_signature: '' });
              return false;
            }}
            javaScriptEnabled
            domStorageEnabled
            style={{ flex: 1, backgroundColor: 'transparent' }}
          />
        )}
      </View>
    </Modal>
  );
}

/** Stand-in for Razorpay while running against the local emulators with no keys: the server accepts this payment. */
function TestCheckout({ amount, description, orderId, onSuccess, onDismiss }: Pick<Props, 'amount' | 'description' | 'orderId' | 'onSuccess' | 'onDismiss'>) {
  const { c } = useTheme();
  const pay = () => onSuccess({ razorpay_order_id: orderId, razorpay_payment_id: `pay_test_${Date.now().toString(36)}`, razorpay_signature: 'test-mode' });
  return (
    <Modal visible animationType="slide" onRequestClose={() => onDismiss()}>
      <View className="flex-1 bg-ground dark:bg-ground-dark">
        <AppBar title="Test payment" subtitle="Local emulator" back onBack={() => onDismiss()} />
        <Screen footer={<><Btn title={`Pay ${inr(amount / 100)} (test)`} icon={<CreditCard size={16} color={c.onBrand} />} onPress={pay} /><Btn title="Payment failed" tone="ghost" size="sm" onPress={() => onDismiss('Your bank declined the payment')} /></>}>
          <Badge tone="warn" label="no real money" />
          <Card>
            <Eyebrow>Order</Eyebrow>
            <SplitRow label={description} value={inr(amount / 100)} strong />
            <Text className="font-jkx text-[12px] text-ink3 dark:text-ink3-dark">{orderId}</Text>
          </Card>
          <Tiny>Razorpay keys are not set and the app is pointed at the emulators, so this sheet stands in for the real checkout. Add EXPO_PUBLIC_RAZORPAY_KEY_ID to see Razorpay.</Tiny>
        </Screen>
      </View>
    </Modal>
  );
}
