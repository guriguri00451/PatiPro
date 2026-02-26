/**
 * ブラウザのautoplayポリシー対策
 * 親コンポーネントで triggerUnlock() を呼ぶと、
 * onUnlock() で登録した全コールバックが実行される。
 */
let unlocked = false;
const listeners: Array<() => void> = [];

export function triggerUnlock(): void {
  if (unlocked) return;
  unlocked = true;
  listeners.forEach(fn => fn());
  listeners.length = 0;
}

export function onUnlock(fn: () => void): void {
  if (unlocked) {
    fn();
    return;
  }
  listeners.push(fn);
}
