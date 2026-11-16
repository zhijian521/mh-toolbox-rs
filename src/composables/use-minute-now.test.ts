import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import { useMinuteNow } from './use-minute-now';
import { useToday } from './use-today';

let scopes: EffectScope[] = [];
let win: EventTarget;
let doc: EventTarget & { visibilityState: string };

function subscribe() {
    const scope = effectScope();
    scopes.push(scope);
    return scope.run(useMinuteNow)!;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 13, 12, 34, 45));
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

describe('共享分钟时钟', () => {
    it('隐藏事件不刷新，重新可见时立即对时', () => {
        const now = subscribe();
        const before = now.value;
        vi.setSystemTime(new Date(2026, 10, 14, 9));
        doc.visibilityState = 'hidden';
        doc.dispatchEvent(new Event('visibilitychange'));
        expect(now.value).toBe(before);
        doc.visibilityState = 'visible';
        doc.dispatchEvent(new Event('visibilitychange'));
        expect(now.value).toBe(Date.now());
        expect(vi.getTimerCount()).toBe(1);
    });

    it('日期与分钟分别调度，释放一个时钟不影响另一个', () => {
        const now = subscribe();
        const dayScope = effectScope();
        scopes.push(dayScope);
        const today = dayScope.run(useToday)!;
        expect(vi.getTimerCount()).toBe(2);
        vi.advanceTimersByTime(15_100);
        expect(new Date(now.value).getMinutes()).toBe(35);
        expect(today.value).toBe('2026-11-13');
        scopes[0].stop();
        expect(vi.getTimerCount()).toBe(1);
        const stopped = now.value;
        vi.setSystemTime(new Date(2026, 10, 14, 9));
        win.dispatchEvent(new Event('focus'));
        expect(today.value).toBe('2026-11-14');
        expect(now.value).toBe(stopped);
        dayScope.stop();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('无数据变更也推进读数，多个消费者只保留一个计时器', () => {
        const first = subscribe();
        const second = subscribe();
        const before = first.value;
        expect(vi.getTimerCount()).toBe(1);
        vi.advanceTimersByTime(15_100);
        expect(first.value).toBeGreaterThan(before);
        expect(new Date(first.value).getMinutes()).toBe(35);
        expect(second.value).toBe(first.value);
        scopes[0].stop();
        expect(vi.getTimerCount()).toBe(1);
        scopes[1].stop();
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['focus', 'pageshow', 'visibilitychange'])('休眠后通过 %s 重新对时', (event) => {
        const now = subscribe();
        vi.setSystemTime(new Date(2026, 10, 14, 9));
        (event === 'visibilitychange' ? doc : win).dispatchEvent(new Event(event));
        expect(now.value).toBe(Date.now());
        expect(vi.getTimerCount()).toBe(1);
        scopes[0].stop();
        vi.setSystemTime(new Date(2026, 10, 15, 9));
        win.dispatchEvent(new Event('focus'));
        expect(new Date(now.value).getDate()).toBe(14);
        expect(subscribe().value).toBe(Date.now());
    });
});
