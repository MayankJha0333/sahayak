import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { RazorpayCheckout, type RazorpaySuccess } from '@/components/RazorpayCheckout';
import type { OrderResult } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { inr } from '@/lib/format';
import { useTheme } from '@/theme';

export type PayOutcome = 'paid' | 'closed';

/**
 * One payment flow for the whole app:
 *   order from the server → Razorpay checkout → the server confirms the payment with Razorpay.
 * `pay` resolves 'paid' once the server has confirmed, 'closed' if she shut the checkout without paying,
 * and throws with a message she can read if the bank declined or the payment could not be confirmed.
 */
export function usePay() {
  const { profile } = useAuth();
  const { c } = useTheme();
  const [sheet, setSheet] = useState<{ order: OrderResult; description: string } | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const pending = useRef<{ verify: (r: RazorpaySuccess) => Promise<unknown>; resolve: (o: PayOutcome) => void; reject: (e: Error) => void } | null>(null);

  const pay = (order: OrderResult, description: string, verify: (r: RazorpaySuccess) => Promise<unknown>) =>
    new Promise<PayOutcome>((resolve, reject) => {
      pending.current = { verify, resolve, reject };
      setSheet({ order, description });
    });

  const onSuccess = async (r: RazorpaySuccess) => {
    const p = pending.current; if (!p || !sheet) return;
    setConfirming(sheet.order.amount);
    setSheet(null);
    try { await p.verify(r); p.resolve('paid'); }
    catch (e) { p.reject(new Error((e as Error).message || 'We could not confirm the payment. If money was taken, it comes back in 5–7 working days.')); }
    finally { setConfirming(null); pending.current = null; }
  };

  const onDismiss = (reason?: string) => {
    const p = pending.current; setSheet(null); pending.current = null;
    if (!p) return;
    if (reason) p.reject(new Error(`${reason}. Nothing was charged — try again or use another UPI app or card.`));
    else p.resolve('closed');
  };

  const element: ReactNode = (
    <>
      {sheet ? (
        <RazorpayCheckout visible orderId={sheet.order.orderId} amount={sheet.order.amount} keyId={sheet.order.keyId}
          description={sheet.description} prefill={{ name: profile?.name, contact: profile?.phone }}
          onSuccess={onSuccess} onDismiss={onDismiss} />
      ) : null}
      <Modal visible={confirming !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(18,20,39,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View className="items-center gap-3 rounded-3xl bg-paper px-7 py-6 dark:bg-paper-dark">
            <ActivityIndicator color={c.brand} />
            <Text className="font-jkb text-[16px] text-ink dark:text-ink-dark">Confirming your payment</Text>
            <Text className="font-jk text-center text-[13px] text-ink2 dark:text-ink2-dark">
              {confirming ? `${inr(confirming / 100)} · ` : ''}checking with Razorpay. Please keep the app open.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );

  return { pay, element, busy: sheet !== null || confirming !== null };
}
