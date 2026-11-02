import { nextTick, ref } from 'vue';

/**
 * 把一张浮片钉在某个锚点旁边。
 *
 * 装备详情与召唤兽资质是两个不同的浮片，但「贴右侧 → 放不下翻左侧 → 两侧都放不下
 * 就贴边」这套落位规则一模一样。抽在这里，是因为第三条判据（§2.4-14
 * 「会不会被第二个组件用」）——现在就有第二个组件在用了。
 *
 * 为什么由浮片自己算、不由调用方算：调用方只知道「锚点是哪个格子」，
 * 而「右边装不装得下」需要浮片自己的宽度，那个宽度要等渲染之后才知道。
 * 所以 `place()` 内部先 `nextTick`。
 */
export function useAnchoredTip(edge = 8) {
    /** 浮片根元素，由模板 `ref` 绑上来。 */
    const el = ref<HTMLElement | null>(null);
    const pos = ref({ left: 0, top: 0 });

    async function place(anchor: DOMRect | null) {
        await nextTick();
        const box = el.value?.getBoundingClientRect();
        /* 还在隐藏态（`visibility: hidden`）时宽度是 0——量不到就先不定位，
         * 免得把浮片钉到 (0, 0) 再跳一次。 */
        if (!box || !anchor || box.width === 0) return;

        let left = anchor.right + edge;
        if (left + box.width > window.innerWidth - edge) {
            left = anchor.left - box.width - edge;
        }
        /* 两侧都装不下（窄窗口 + 宽浮片）就贴边：宁可压住锚点，也要让内容读全。 */
        left = Math.min(Math.max(edge, left), Math.max(edge, window.innerWidth - box.width - edge));

        /* 纵向与锚点顶边齐平，超出视口再夹回来。 */
        const top = Math.min(
            Math.max(edge, anchor.top - 2),
            Math.max(edge, window.innerHeight - box.height - edge),
        );

        pos.value = { left, top };
    }

    return { el, pos, place };
}
