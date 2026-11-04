/**
 * 一组「按人怎么点」的语义动作，盖在 `cdp.mjs` 的原始原语之上。
 *
 * 分这一层的理由：`smoke.mjs` 里每一步都该读起来像在描述**用户做了什么**
 * （「点新角色」「填区服」「等角色页画出来」），而不是一堆 `Runtime.evaluate`
 * 字符串。选择器与标记逻辑一旦重复三遍，第四个地方就会写歪。
 *
 * ---- 标记法（`data-e2e`）----
 *
 * 按文本/属性找到元素后，给它打一个临时属性再让 `cdp.click` 按选择器点。
 * 不把元素句柄传出去，是因为 CDP 的 `objectId` 在页面重载、组件重渲染后就会失效，
 * 而字符串选择器每次点之前都重新查一次，天然是「点的那一刻的最新那个元素」。
 */

import { sleep } from './cdp.mjs';

export function createUi(cdp) {
    const q = (value) => JSON.stringify(value);

    const text = (selector = '.page-content') =>
        cdp.evaluate(`document.querySelector(${q(selector)})?.innerText ?? ''`);

    const title = () =>
        cdp.evaluate(`document.querySelector('.page-title')?.textContent?.trim() ?? ''`);

    const hash = () => cdp.evaluate('location.hash');

    const count = (selector) => cdp.evaluate(`document.querySelectorAll(${q(selector)}).length`);

    const exists = (selector) => cdp.evaluate(`!!document.querySelector(${q(selector)})`);

    /** 等一句页面表达式成立（薄薄一层透传，省得每个调用点都写 `cdp.waitFor`）。 */
    const waitFor = (expression, options) => cdp.waitFor(expression, options);

    /** 等到页面正文里出现某段文字。返回布尔，不抛——判据在调用方手里。 */
    const waitText = (needle, options = {}) =>
        cdp.waitFor(
            `(document.querySelector('.page-content')?.innerText ?? '').includes(${q(needle)})`,
            options,
        );

    /**
     * 在页面里找到**第一个**满足条件的元素并打上 `data-e2e="1"`。
     *
     * `finder` 是一段函数表达式源码，例如
     * `() => [...document.querySelectorAll('button')].find((b) => b.textContent === '保存')`。
     * 写成源码字符串而不是回调：这段代码要在**页面**里跑，回调传不过去。
     */
    const markFirst = (finder) =>
        cdp.evaluate(`(() => {
            const el = (${finder})();
            if (!el) return false;
            document.querySelectorAll('[data-e2e]').forEach((n) => n.removeAttribute('data-e2e'));
            el.setAttribute('data-e2e', '1');
            return true;
        })()`);

    const MARK = '[data-e2e="1"]';

    /** 按「元素文本」点。`exact` 是整串相等，否则包含即可。 */
    const clickText = async (selector, needle, { exact = false } = {}) => {
        const match = exact
            ? `(e.textContent || '').trim() === ${q(needle)}`
            : `(e.textContent || '').includes(${q(needle)})`;
        const found = await markFirst(
            `() => [...document.querySelectorAll(${q(selector)})].find((e) => ${match})`,
        );
        if (!found) throw new Error(`找不到含「${needle}」的 ${selector}`);
        await cdp.click(MARK);
    };

    /** 按 `aria-label` 精确点。 */
    const clickLabel = async (label) => {
        const found = await markFirst(
            `() => document.querySelector(${q(`[aria-label="${label}"]`)})`,
        );
        if (!found) throw new Error(`找不到 aria-label="${label}"`);
        await cdp.click(MARK);
    };

    /**
     * 按 `aria-label` **前缀**点。
     *
     * 速记格子的整串 label 带着单价（「60武器，单价 5万，点一下记一条」），
     * 而单价是用户的数据——用它做判据，测试就会因为「用户恰好没给这件东西定价」而红。
     */
    const clickLabelPrefix = async (prefix) => {
        const found = await markFirst(
            `() => [...document.querySelectorAll('[aria-label]')]
                .find((e) => e.getAttribute('aria-label').startsWith(${q(prefix)}))`,
        );
        if (!found) throw new Error(`找不到 aria-label 以「${prefix}」开头的元素`);
        await cdp.click(MARK);
    };

    /**
     * 在「包含某段文字的卡片」里点一个按钮。
     *
     * 列表页上的按钮全都长一样（每张卡都有「删」），只能靠卡片定位。
     * 两个都要给：`text` 按按钮文字、`label` 按 aria-label（图标按钮没有文字）。
     */
    const clickIn = async (cardSelector, needle, { text: btnText, label } = {}) => {
        if (!btnText && !label) throw new Error('clickIn 需要 text 或 label');
        const inner = label
            ? `card.querySelector(${q(`[aria-label="${label}"]`)})`
            : `[...card.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === ${q(btnText)})`;
        const found = await markFirst(`() => {
            const card = [...document.querySelectorAll(${q(cardSelector)})]
                .find((c) => (c.textContent || '').includes(${q(needle)}));
            return card ? ${inner} : null;
        }`);
        if (!found) {
            throw new Error(
                `卡片「${needle}」里找不到${label ? ` aria-label="${label}"` : `「${btnText}」按钮`}`,
            );
        }
        await cdp.click(MARK);
    };

    /** 按输入框的 `aria-label` 填值（清空后 insertText，触发 input 事件）。 */
    const fill = (label, value) => cdp.type(`input[aria-label=${q(label)}]`, value);

    const fillSel = (selector, value) => cdp.type(selector, value);

    /**
     * 把浮层收干净：上一组失败留下的弹窗遮罩会挡住左栏，之后每一次导航都连坐，
     * 于是一个真 bug 变成二十条红。四轮是上限——正常最多两层（编辑器 + 确认窗）。
     */
    const dismiss = async () => {
        const open = `!!document.querySelector('[role="dialog"], .editor, .modal-mask')`;
        for (let i = 0; i < 4; i += 1) {
            if (!(await cdp.evaluate(open))) return i;
            await cdp.key('Escape');
            await sleep(260);
        }
        return 4;
    };

    /**
     * 点左栏进某一页，**等到标题变成这一页的名字**。
     *
     * 不再用「正文超过 N 个字」当就绪判据：工具页整页只有「捉鬼助手」四个字，
     * 阈值一高就假红、一低就漏判。标题是导航自己写上去的那一个，它到了就是到了。
     */
    const goto = async (label) => {
        await dismiss();
        await clickText('nav.rail-nav .vs-cell', label, { exact: true });
        const ready = await cdp.waitFor(
            `document.querySelector('.page-title')?.textContent?.trim() === ${q(label)}`,
            { timeout: 8000 },
        );
        if (!ready) throw new Error(`点了「${label}」，标题没跟上（现在是「${await title()}」）`);
        // 标题是布局的一部分，比正文早到；给懒加载出来的正文留一拍。
        await sleep(200);
    };

    /** 导航并等正文非空（占位页也有正文，所以这是「画出来了」而不是「有数据」）。 */
    const gotoReady = async (label) => {
        await goto(label);
        const drawn = await cdp.waitFor(
            `(document.querySelector('.page-content')?.innerText ?? '').length > 0`,
            {
                timeout: 6000,
            },
        );
        return drawn;
    };

    const reload = (options) => cdp.reload(options);

    return {
        text,
        title,
        hash,
        count,
        exists,
        waitFor,
        waitText,
        markFirst,
        clickText,
        clickLabel,
        clickLabelPrefix,
        clickIn,
        fill,
        fillSel,
        dismiss,
        goto,
        gotoReady,
        reload,
    };
}
