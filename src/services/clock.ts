/**
 * 时刻的**输入归一**与**拆读**：`7:5` 收成 `07:30`、`07:30` 的分钟是 `30`。
 *
 * ---- 为什么不在 `views/tools/alarms.ts` 里 ----
 *
 * 这两个函数原先长在闹钟模块里，因为它们最早只服务闹钟。但「时间选择器」现在是一个
 * 通用控件（`components/TimeField.vue`），让组件反过来引一个页面模块是反向依赖；
 * 而这两条本身与闹钟无关——它们只回答「这串字是不是一个时刻」「它的分钟是几」。
 *
 * ---- 为什么与 `format.ts` 分成两份 ----
 *
 * 那边是日期（`dateText` / `parseDay` / `todayText`）与金额，要处理月份加减与月历；
 * 这边只有 24 × 60 个值，连 `Date` 都不需要。合在一起会让「改日期口径」的人
 * 翻到一堆与时刻无关的代码。
 */

/** 两位补零。拼 `HH:mm` 的两个模块（这里与 `alarms.ts` 的提醒键）共用。 */
export function pad2(value: number): string {
    return `${value}`.padStart(2, '0');
}

/**
 * 把用户敲的时间收成 `HH:mm`；认不出返回 `null`。
 *
 * 收这几类写法：`7:5`、`07:05`、`0705`、`7`（当作 `07:00`）、全角冒号。
 * 不在这里做「必须两位」的要求——手敲时间时少打一个前导零很常见，
 * 而把它拒掉只会让用户重来一遍。
 */
export function normalizeTime(raw: string): string | null {
    const text = (raw ?? '').trim().replace('：', ':');
    if (!text) return null;

    let hour: number;
    let minute: number;
    if (text.includes(':')) {
        const [h, m = '0'] = text.split(':');
        if (!/^\d{1,2}$/.test(h) || !/^\d{1,2}$/.test(m)) return null;
        hour = Number(h);
        minute = Number(m);
    } else if (/^\d{1,2}$/.test(text)) {
        hour = Number(text);
        minute = 0;
    } else if (/^\d{3,4}$/.test(text)) {
        const padded = text.padStart(4, '0');
        hour = Number(padded.slice(0, 2));
        minute = Number(padded.slice(2));
    } else {
        return null;
    }

    if (hour > 23 || minute > 59) return null;
    return `${pad2(hour)}:${pad2(minute)}`;
}

/**
 * 取 `HH:mm` 的分钟两位（`00:30` → `30`，`07:05` → `05`）。
 *
 * 「每小时的第几分」在界面与卡片上都只显示这一半：小时那一半是占位的 `00`，
 * 原样印出来会被读成「定在半夜十二点半」。
 *
 * **补零**：卡片上写成 `:5` 看着像少了半个字，而输入格里 `05` 也比 `5` 更像一个时刻。
 */
export function minuteText(time: string): string {
    const minute = Number(time.split(':')[1] ?? '');
    return Number.isFinite(minute) ? pad2(minute % 60) : '00';
}
