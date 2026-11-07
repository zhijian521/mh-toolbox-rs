import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import { useToday } from './use-today';

let scopes: EffectScope[] = [];
let win: EventTarget;
let doc: EventTarget & { visibilityState: string };
function subscribe() {
    const scope = effectScope();
    scopes.push(scope);
    return scope.run(useToday)!;
}
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 30, 23, 59, 59));
    win = new EventTarget();
    doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);
});
afterEach(() => {
    scopes.forEach((scope) => scope.stop());
    scopes = [];
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('共享本地日期', () => {
    it('跨午夜、跨月自动更新，多个消费者只有一个计时器', () => {
        const first = subscribe();
        const second = subscribe();
        expect(first.value).toBe('2026-11-30');
        expect(vi.getTimerCount()).toBe(1);
        vi.advanceTimersByTime(1100);
        expect(first.value).toBe('2026-12-01');
        expect(second.value).toBe(first.value);
        scopes[0].stop();
        expect(vi.getTimerCount()).toBe(1);
        scopes[1].stop();
        expect(vi.getTimerCount()).toBe(0);
    });
    it.each(['focus', 'pageshow', 'visibilitychange'])(
        '休眠后通过 %s 恢复日期和下一次午夜计划',
        (event) => {
            const today = subscribe();
            vi.setSystemTime(new Date(2027, 0, 1, 8));
            (event === 'visibilitychange' ? doc : win).dispatchEvent(new Event(event));
            expect(today.value).toBe('2027-01-01');
            expect(vi.getTimerCount()).toBe(1);
            scopes[0].stop();
            vi.setSystemTime(new Date(2027, 0, 2));
            win.dispatchEvent(new Event('focus'));
            expect(today.value).toBe('2027-01-01');
            expect(subscribe().value).toBe('2027-01-02');
        },
    );
});
