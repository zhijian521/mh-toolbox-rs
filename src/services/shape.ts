/** 跨页共用的纯数据归一工具；具体字段的有效性由业务模块决定。 */

/**
 * 对象守卫。数组也是 `typeof 'object'`，所以这里只挡 `null`——调用方要数组就用 `rows`。
 */
export const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * 文本：认不出就是空串，**并去掉首尾空白**。
 *
 * 用于「用户填进输入框、读回来要当值用」的字段（价格表的名称、备注、分类）：
 * 首尾空格在那边没有意义，留着还会让 `name.trim() === target` 这类判重失手。
 */
export const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * 文本，但**原样保留**（不 trim）。
 *
 * 名册那边用它：卡面上的名字、属性值都是「用户写什么就显示什么」，早先的实现也没 trim，
 * 顺手统一成 `text` 就等于悄悄改了一处读数据的语义——那类改动最难在事后认出来。
 * 两个函数并排放，是为了让「要不要 trim」成为一个必须显式选择的事。
 */
export const rawText = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * 整数：`NaN` / `Infinity` 一律变 0。
 *
 * 时间戳与「等级 / 攻击 / 上限」这类格子共用它。`NaN` 参与排序会让整列顺序变成
 * undefined 行为（比较函数返回 `NaN` 时 V8 视作 0，看起来「偶尔乱序」，最难查）；
 * 而 `NaN` / `Infinity` 存进 JSON 会变成 `null`，读回来再算就是另一个故事。
 *
 * 取整用 `Math.round` 而不是 `| 0`：后者对超过 2^31 的时间戳会溢出成负数。
 */
export const stamp = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;

/** 可选整数：保留实际的 0，缺失或非有限数返回 undefined。 */
export const optionalInt = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;

/** 数组：认不出就是空数组。名字取「行」是因为两个调用方读的都是「一串记录」。 */
export const rows = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * 新 id：`<prefix>-<uuid>`。
 *
 * 前缀分开（`item-` / `pt-` / `char-`）是为了直接看存储里那坨 JSON 时，一眼认得出
 * 哪个字符串是什么东西。`randomUUID` 在 WebView2 与 Node 19+ 都有，
 * 老环境回落到时间戳 + 随机后缀——那条路只保证「够随机」，不保证全局唯一，
 * 所以调用方永远要把它当**新建**用，不能拿它去覆盖已有记录。
 */
export function makeId(prefix: string): string {
    const uuid = globalThis.crypto?.randomUUID?.();
    return uuid
        ? `${prefix}-${uuid}`
        : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
