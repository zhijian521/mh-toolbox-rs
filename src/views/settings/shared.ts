import type { ThemeMode } from '../../composables/use-theme';

/**
 * 设置页内部共享的常量与小工具。
 *
 * 主题选项被「外观」和「原子组件」两处用到——放在这里各取一份，
 * 不要在两个组件里各写一遍字面量，那样改文案会漏。
 */
export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: '跟随系统' },
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
];

/* ---------- 令牌读取 ----------
 * 「色板」和「字号阶梯」两页展示的都是 `tokens.css` 里的东西。早先两张表都是手抄的
 * （13 个颜色、8 档 px），结果是 `tokens.css` 越写越全、页面却一直停在抄的那一天——
 * `--seal` 那一组从头到尾没在色板上出现过。**需要记得两边都改的东西一定会漂。**
 *
 * 所以改成运行时读：令牌名从已加载的样式表里枚举，值套到探针元素上让浏览器算。
 * 代价是这两页只在前端跑（本来就是），收益是它们**永远等于真源**。
 *
 * 只在设置页用。业务样式不要调这里的任何函数——那是 CSS 的活。
 */

/** 枚举所有样式表里声明的 `--*` 名字，按声明顺序、同名只留第一次出现。 */
export function declaredTokens(prefix = '--'): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
            rules = sheet.cssRules;
        } catch {
            /* 跨域样式表读不到 cssRules。本站全部同源，这条只是兜底，不要当死码删。 */
            continue;
        }
        for (const rule of Array.from(rules)) {
            if (!(rule instanceof CSSStyleRule)) continue;
            const { style } = rule;
            for (let i = 0; i < style.length; i += 1) {
                const name = style.item(i);
                if (name.startsWith(prefix) && !seen.has(name)) {
                    seen.add(name);
                    names.push(name);
                }
            }
        }
    }
    return names;
}

/** 挂一枚不可见的探针元素跑一段读取，跑完摘掉。 */
function withProbe<T>(cssText: string, run: (probe: HTMLElement) => T): T {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;${cssText}`;
    document.body.append(probe);
    try {
        return run(probe);
    } finally {
        probe.remove();
    }
}

/**
 * 从候选令牌里筛出「值是颜色」的那些。
 *
 * 判据是把令牌套成 `background-color` 再读计算值：颜色会算出 `rgb()` / `rgba()`，
 * 而长度、`calc()`、`cubic-bezier()`、纯数字这些落回初始值 `transparent`。
 * 不用 `CSS.supports('color', value)`——只要值里含 `var()`，它一律返回 true，
 * `--fs-base: calc(10px * var(--fs-scale))` 会被误判成颜色。
 */
export function colorTokens(names: string[]): string[] {
    const root = getComputedStyle(document.documentElement);
    return withProbe('', (probe) =>
        names.filter((name) => {
            if (!root.getPropertyValue(name).trim()) return false;
            /* 先清空再赋：万一浏览器把无效声明当成「保持原值」，上一次的颜色会留下来。 */
            probe.style.backgroundColor = '';
            probe.style.backgroundColor = `var(${name})`;
            return getComputedStyle(probe).backgroundColor !== 'rgba(0, 0, 0, 0)';
        }),
    );
}

/** 把令牌套成 `font-size`，返回它**当前**算出来的像素值（已含 `--fs-scale`）。 */
export function tokenFontSize(name: string): number {
    return withProbe('font-size:0', (probe) => {
        probe.style.fontSize = `var(${name})`;
        return parseFloat(getComputedStyle(probe).fontSize);
    });
}
