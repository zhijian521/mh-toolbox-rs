<script setup lang="ts">
import PageShell from '../components/PageShell.vue';
import CharacterCard from './characters/CharacterCard.vue';
import { CHARACTERS } from './characters/mock';

/**
 * 角色页 —— 名册。
 *
 * **这一版只有版式**：数据写死在 `./mock.ts`，页头的两个按钮和空位卡都停在
 * 「还点不动」的状态，没有任何 IPC、没有存储、没有识别。先把三张卡放进真实窗口里
 * 看比例与密度，定下来之后再接 `characters` 的数据。
 *
 * 卡宽写死 360 而不是 `minmax(…, 1fr)`：一用伸缩列，三张卡会随窗口各自拉宽到 600+，
 * 又回到「一条横贯屏幕的长卡」——游戏里的人物面板从来不是那个比例。
 * 1280 窗口下三张正好排满（360 × 3 + 16 × 2 ＝ 1112，内容区约 1121），
 * 1024 下排两张、第三张换行，页面纵向滚动。
 */
</script>

<template>
    <PageShell title="角色" desc="演示数据 · 先定版式，功能随后">
        <template #actions>
            <button class="btn" type="button" disabled>识别游戏窗口</button>
            <button class="btn primary" type="button" disabled>＋ 新角色</button>
        </template>

        <div class="roster">
            <CharacterCard
                v-for="character in CHARACTERS"
                :key="character.id"
                :character="character"
            />

            <!-- 空位卡与角色卡同高：名册的行高由最高那张决定，缺一角会让整行看着没排完。 -->
            <button class="char-blank" type="button" disabled>
                <span class="plus">＋</span>
                <span class="blank-text">新角色</span>
            </button>
        </div>
    </PageShell>
</template>

<style scoped>
.roster {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 16px;
    width: 100%;
}

.char-blank {
    display: grid;
    place-items: center;
    /* 两行居中：不写 `align-content` 会按 stretch 把两行各拉一半，
     * 看起来是上下两个孤零零的字。 */
    align-content: center;
    gap: 8px;
    flex: none;
    width: 360px;
    height: 480px;
    border: var(--w-hair) dashed var(--rule-2);
    background: none;
    color: var(--muted);
    font-family: var(--font-ui);
    cursor: pointer;
    transition: color var(--t-quick) var(--ease-soft);
}
.char-blank:hover:not(:disabled) {
    border-color: var(--cinnabar);
    color: var(--cinnabar);
}
/* 演示阶段它还点不动。禁用态**不改透明度**：这不是「不可用的控件」，
 * 是「还没接上的入口」，变淡会让人以为这一格是坏的。 */
.char-blank:disabled {
    cursor: default;
}
.char-blank .plus {
    /* 那个「+」没有对应的字号档，但必须跟着 `--fs-scale` 走：
     * 写死 26px 时「较大」档下它会显得比旁边的说明字还小。 */
    font-size: calc(var(--fs-xl) + 4px);
    line-height: 1;
}
.char-blank .blank-text {
    font-size: var(--fs-sm);
    letter-spacing: 0.1em;
}
</style>
