import { type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { inr } from '@/lib/format';
import type { Coupon, PartnerDoc } from '@/lib/types';
import { Eyebrow, Tiny } from './ui';

export function Panel({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <View
      className={`gap-2.5 rounded-2xl border border-line2 bg-paper p-4 dark:border-line2-dark dark:bg-paper-dark ${wide ? 'w-full' : 'min-w-[260px] flex-1'}`}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </View>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="min-w-full overflow-hidden rounded-xl border border-line2 dark:border-line2-dark">
        <View className="flex-row bg-sunk dark:bg-sunk-dark">
          {head.map((h) => (
            <View key={h} className="w-[128px] px-3 py-2.5">
              <Text className="text-[9.5px] font-jkx uppercase tracking-wider text-ink3 dark:text-ink3-dark">{h}</Text>
            </View>
          ))}
        </View>
        {rows.length === 0 ? (
          <View className="px-3 py-4"><Tiny>Nothing here yet.</Tiny></View>
        ) : null}
        {rows.map((r, i) => (
          <View key={i} className="flex-row border-t border-line2 dark:border-line2-dark">
            {r.map((cell, j) => (
              <View key={j} className="w-[128px] justify-center px-3 py-2.5">
                {typeof cell === 'string' ? (
                  <Text className="font-jk text-[12px] text-ink2 dark:text-ink2-dark" numberOfLines={2}>{cell}</Text>
                ) : cell}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function Bars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <View className="h-12 flex-row items-end gap-1">
      {values.map((v, i) => (
        <View
          key={i}
          className={`flex-1 rounded-t ${i >= values.length - 2 ? 'bg-brand' : 'bg-brand-soft dark:bg-brand-softdark'}`}
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </View>
  );
}

/** Verification state of an expert, as ops needs to see it. */
export function kycBadge(p: PartnerDoc): { tone: 'ok' | 'warn' | 'crit' | 'neutral' | 'brand'; label: string } {
  if (p.bot) return { tone: 'neutral', label: 'demo' };
  if (p.suspended) return { tone: 'crit', label: 'suspended' };
  if (p.verified) return { tone: 'ok', label: 'verified' };
  const s = p.kyc?.status ?? 'not_started';
  return s === 'submitted' ? { tone: 'warn', label: 'to review' } : s === 'rejected' ? { tone: 'crit', label: 'sent back' } : { tone: 'neutral', label: 'signing up' };
}

/** One line that says what a coupon does. */
export const couponSummary = (c: Coupon) =>
  `${c.type === 'percent' ? `${c.value}% off${c.maxDiscount ? ` up to ${inr(c.maxDiscount)}` : ''}` : `${inr(c.value)} off`}`
  + `${c.minOrder ? ` · min ${inr(c.minOrder)}` : ''}${c.firstOrderOnly ? ' · first booking' : ''} · ${c.perUserLimit ?? 1}× per customer`;
