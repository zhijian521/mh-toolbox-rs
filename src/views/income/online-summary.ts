/** 在线票据复用按日切分与历史单价快照；昨日对比只派生展示，不写回账本。 */
import type { StatItem } from '../../components/StatStrip.vue';
import { daysAgo, ledgerMoneyText, ledgerMoneyTone, parseDay } from '../../services/format';
import { ratioText } from './income';
import { minutesText, onlineTotalsOf, type ReadonlyOnlineSession } from './online';

export function onlineSummaryItems(
    sessions: readonly ReadonlyOnlineSession[],
    today: string,
    now: number,
): StatItem[] {
    const yesterday = daysAgo(1, parseDay(today));
    const current = onlineTotalsOf(sessions, today, today, now);
    const previous = onlineTotalsOf(sessions, yesterday, yesterday, now);
    return [
        {
            id: 'minutes',
            cap: '在线时长',
            value: minutesText(current.minutes),
            hint: '汇总今日已结束和正在计时的上线记录',
            sub: `昨日${minutesText(previous.minutes).replaceAll(' ', '')}`,
            delta: ratioText(current.minutes, previous.minutes),
        },
        {
            id: 'cost',
            cap: '点卡花费',
            value: ledgerMoneyText(current.cost, 'cash', { zero: 'dash' }),
            tone: ledgerMoneyTone(current.cost, 'expense'),
            sub: `昨日${ledgerMoneyText(previous.cost, 'cash', { zero: 'dash' }).replaceAll(' ', '')}`,
            delta: ratioText(current.cost, previous.cost),
        },
    ];
}
