import { dateText } from '../services/format';
import { createSharedClock } from './shared-clock';

/** 本地午夜更新，恢复窗口时重新对时。 */
export const useToday = createSharedClock(dateText, (time) => {
    const now = new Date(time);
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return midnight.getTime() - time + 20;
});
