/**
 * A one-shot hand-off from the service detail page back to the open booking form:
 * "Add to my booking" parks the task here and goes back; the form picks it up when it regains focus.
 */
let pending: string | null = null;

export const requestAddTask = (slug: string) => { pending = slug; };
export const takeAddTask = () => { const s = pending; pending = null; return s; };

/**
 * The coupon page hands its choice back to the review screen the same way:
 * an applied coupon, or null when she removed it. Undefined means "nothing changed".
 */
export type PickedCoupon = { code: string; title: string; amount: number };
let coupon: PickedCoupon | null | undefined;
export const pickCoupon = (c: PickedCoupon | null) => { coupon = c; };
export const takeCoupon = () => { const c = coupon; coupon = undefined; return c; };
