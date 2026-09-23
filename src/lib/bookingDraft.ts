/**
 * A one-shot hand-off from the service detail page back to the open booking form:
 * "Add to my booking" parks the task here and goes back; the form picks it up when it regains focus.
 */
let pending: string | null = null;

export const requestAddTask = (slug: string) => { pending = slug; };
export const takeAddTask = () => { const s = pending; pending = null; return s; };
