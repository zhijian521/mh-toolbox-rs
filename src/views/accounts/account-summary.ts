/** 概览与历史共用双币种读数，金额单位、方向色和标题提示只在这里生成。 */
import type { StatItem } from '../../components/StatStrip.vue';
import { accountStatsByCurrency, type AccountEntry } from './accounts';
import { BOOK_OPTIONS, accountValueText } from './account-analysis';

export function accountSummaryBooks(entries: readonly AccountEntry[]) {
    const stats = accountStatsByCurrency(entries);
    return BOOK_OPTIONS.map(({ value: currency, label: heading }) => {
        const book = stats[currency];
        return {
            currency,
            heading,
            hint: book.count + ' 笔',
            items: [
                {
                    id: currency + '-income',
                    cap: '收入',
                    value: accountValueText(book.income, currency),
                    tone: book.income > 0 ? 'gain' : 'num',
                },
                {
                    id: currency + '-expense',
                    cap: '支出',
                    value: accountValueText(book.expense, currency),
                    tone: book.expense > 0 ? 'loss' : 'num',
                },
                {
                    id: currency + '-net',
                    cap: '差额',
                    value: accountValueText(book.net, currency),
                    tone: book.net < 0 ? 'loss' : book.net > 0 ? 'gain' : 'num',
                },
            ] satisfies StatItem[],
        };
    });
}
