import { POINT_LIMIT } from '../prices/prices';

export function truncationNote(truncation: { points: number; items: number } | undefined): string {
    if (!truncation || truncation.points <= 0) return '';
    const { points, items } = truncation;
    return (
        `其中 ${points} 条价格超出单件 ${POINT_LIMIT} 条的上限（涉及 ${items} 件物品）：` +
        `导入后会按每件最新的 ${POINT_LIMIT} 条保留，更早的那 ${points} 条会在下次保存时丢失。`
    );
}

/** 整本替换后重载所有领域单例，回执与备份位置跨重载保留一次。 */
const NOTICE_KEY = 'mh-data-notice';
const WARNING_KEY = 'mh-data-warning';

export function reloadWithDataNotice(text: string, warning = '', hash?: string) {
    try {
        sessionStorage.setItem(NOTICE_KEY, text);
        sessionStorage.setItem(WARNING_KEY, warning);
    } catch {
        // 账本已替换；存储不可用时仍重载，避免继续操作旧内存数据。
    }
    if (hash) location.hash = hash;
    location.reload();
}

export function takeDataNotice(): { text: string; warning: string } {
    try {
        const text = sessionStorage.getItem(NOTICE_KEY) ?? '';
        const warning = sessionStorage.getItem(WARNING_KEY) ?? '';
        sessionStorage.removeItem(NOTICE_KEY);
        sessionStorage.removeItem(WARNING_KEY);
        return { text, warning };
    } catch {
        return { text: '', warning: '' };
    }
}
