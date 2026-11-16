import { createSharedClock } from './shared-clock';

/** 只刷新读数，不触发业务数据写入。 */
export const useMinuteNow = createSharedClock(
    (now) => now,
    (now) => 60_000 - (now % 60_000) + 20,
);
