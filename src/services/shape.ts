/**
 * 形状兜底：把「别人写的东西」收回到契约里的形状。
 *
 * ---- 为什么在 `services/` 而不是某个 `views/<页>/` ----
 * 这几个函数原本在 `views/prices/prices.ts` 与 `views/characters/roster.ts` 里**各写了一份**
 * （2026-11-03 之前），逐字同义。第三个用它们的页面（收益 / 总览）一开工就会变成三份，
 * 而它们与页面无关、与 IO 无关，是纯规则——按 `docs/ARCHITECTURE.md` §4 那张表的划法，
 * 「前端共用的纯规则」归 `services/`（同 `ghost-parse.ts`、`ghost-model.ts`），
 * 「只服务一个页面的数据层」才归 `views/<页>/`（同 `prices-store.ts`、`roster.ts`）。
 *
 * ---- 这里装什么、不装什么 ----
 * 只装「两个以上地方会用到的、逐字相同的东西」。页面自己的字段语义（`optionalInt`、
 * `optionalText`、`asTone` 这类）留在各自的 `normalizeXxx` 旁边：它们读的是那一页的契约，
 * 搬过来只会让这一层变成第二个 `character.ts` / `prices.ts`。
 *
 * ---- 迁移块（`migrateOnce`）为什么没有一起收口 ----
 * `prices-store.ts` 与 `roster.ts` 里那两段「老 localStorage 搬进 SQLite」是同一个形状
 * （先问标记 → 有老数据就写库 → **写成功才改名留底** → 打标记）。这次**没有**抽象它：
 * 那是「搬失败会不会丢数据」的关键路径，目前没有任何测试直接覆盖，抽象错了的代价比重复大。
 * 所以要等一条能造出「写库失败」的测试之后再合并——不是漏了。
 */

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
 * 价格：有限正数，保留两位小数；认不出的按 0。
 *
 * 0 在整条链上都表示「没记价」，所以它不是一个合法的价格——`normalizePoint` 会因此
 * 把这条记录整条丢掉，而不是留一行「—」在历史里让人猜。
 */
export const amount = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
};

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
