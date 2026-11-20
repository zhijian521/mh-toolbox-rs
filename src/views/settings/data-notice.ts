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
