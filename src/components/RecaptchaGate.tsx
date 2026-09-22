import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { X } from './icons';
import { firebaseConfig } from '@/lib/firebase';
import { useTheme } from '@/theme';

/**
 * Firebase's JS SDK can only send an SMS after a reCAPTCHA token proves a human
 * asked for it. Browsers render that widget on the page; a phone cannot, so this
 * component renders it inside a WebView that pretends to live on the project's
 * authorised domain and hands the token back. Expo Go and web builds use this;
 * native builds use React Native Firebase, which has no reCAPTCHA step at all.
 *
 * Invisible mode is attempted first, so most sign-ins never show a puzzle.
 */
export type PhoneVerifier = { readonly type: 'recaptcha'; verify(): Promise<string>; _reset(): void };

type Pending = { resolve: (token: string) => void; reject: (e: Error) => void };

const SDK = '12.19.0';

export const RecaptchaGate = forwardRef<PhoneVerifier, object>(function RecaptchaGate(_, ref) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<Pending | null>(null);
  const [ready, setReady] = useState(false);

  useImperativeHandle(ref, () => ({
    type: 'recaptcha' as const,
    verify: () => new Promise<string>((resolve, reject) => { setReady(false); setPending({ resolve, reject }); }),
    _reset: () => {},
  }), []);

  const html = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<script src="https://www.gstatic.com/firebasejs/${SDK}/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/${SDK}/firebase-auth-compat.js"></script>
<style>html,body{margin:0;height:100%;background:${c.ground};font-family:-apple-system,system-ui,sans-serif}
#host{display:flex;justify-content:center;padding-top:8px}</style></head>
<body><div id="host"></div>
<script>
  var post = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  try {
    firebase.initializeApp(${JSON.stringify(firebaseConfig)});
    var v = new firebase.auth.RecaptchaVerifier('host', {
      size: 'invisible',
      callback: function (token) { post({ type: 'token', token: token }); },
      'expired-callback': function () { post({ type: 'expired' }); }
    });
    v.render().then(function () { post({ type: 'ready' }); return v.verify(); })
      .then(function (token) { if (token) post({ type: 'token', token: token }); })
      .catch(function (e) { post({ type: 'error', code: e && e.code, message: e && e.message }); });
  } catch (e) { post({ type: 'error', message: e && e.message }); }
</script></body></html>`, [c.ground]);

  const finish = (fn: (p: Pending) => void) => { if (pending) fn(pending); setPending(null); };
  const cancel = () => finish((p) => p.reject(Object.assign(new Error('Security check cancelled'), { code: 'auth/cancelled' })));

  const onMessage = (raw: string) => {
    let m: { type: string; token?: string; code?: string; message?: string };
    try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'ready') setReady(true);
    else if (m.type === 'token' && m.token) finish((p) => p.resolve(m.token!));
    else if (m.type === 'expired') cancel();
    else if (m.type === 'error') finish((p) => p.reject(Object.assign(new Error(m.message ?? 'Security check failed'), { code: m.code ?? 'auth/recaptcha' })));
  };

  return (
    <Modal visible={Boolean(pending)} animationType="fade" transparent onRequestClose={cancel}>
      <View className="flex-1 justify-end bg-hero/70">
        <View className="overflow-hidden rounded-t-[28px] bg-ground dark:bg-ground-dark" style={{ height: 520, paddingBottom: insets.bottom }}>
          <View className="flex-row items-center gap-3 px-5 pb-2 pt-4">
            <View className="flex-1">
              <Text className="font-jkb text-[16px] text-ink dark:text-ink-dark">Quick security check</Text>
              <Text className="font-jk text-[12px] text-ink3 dark:text-ink3-dark">{ready ? 'Solve the puzzle if one appears.' : 'Making sure a person asked for this OTP…'}</Text>
            </View>
            {!ready ? <ActivityIndicator color={c.brand} /> : null}
            <Pressable onPress={cancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancel"
              className="h-9 w-9 items-center justify-center rounded-full bg-sunk dark:bg-sunk-dark">
              <X size={18} color={c.ink2} />
            </Pressable>
          </View>
          {pending ? (
            <WebView
              originWhitelist={['*']}
              source={{ html, baseUrl: `https://${firebaseConfig.authDomain}` }}
              javaScriptEnabled
              domStorageEnabled
              setSupportMultipleWindows={false}
              onMessage={(e) => onMessage(e.nativeEvent.data)}
              onError={() => cancel()}
              style={{ flex: 1, backgroundColor: c.ground }}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
});
