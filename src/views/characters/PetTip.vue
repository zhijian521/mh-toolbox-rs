<script setup lang="ts">
import { computed, watch } from 'vue';
import { useAnchoredTip } from '../../composables/use-anchored-tip';
import type { Pet } from './character';

/**
 * 召唤兽资质浮片：鼠标停在列表某一行时浮出来。
 *
 * 为什么只做「悬停看资质」，不做「点开看全部」：一进游戏面板，判断一只兽值不值
 * 只看四件事——**参战等级够不够、成长多少、关键资质多少、寿命还剩多少**。
 * 技能、内丹、灵性放在同一张纸的下半截，一次给完；再往下（内丹等级、进阶路线）
 * 属于「练的时候才查」，不是账面要回答的问题。
 *
 * 落位与装备浮片共用 `useAnchoredTip`，宽度也一致（240）——两个浮片不会同时出现，
 * 宽度不同会让「换了一行」读起来像换了个界面。
 */
const props = defineProps<{
    anchor: DOMRect | null;
    pet: Pet | null;
}>();

const { el, pos, place } = useAnchoredTip();

watch(
    () => props.pet,
    (pet) => {
        if (!pet) return;
        void place(props.anchor);
    },
);

/* 资质顺序固定按游戏面板：攻、防、体、法、速、躲。
 * 不按数值排序——同一个号两次打开时顺序会变，比的是「这项够不够」，不是排名。 */
const qualities = computed(() => {
    const q = props.pet?.quality;
    if (!q) return [];
    return [
        { label: '攻击资质', value: q.attack },
        { label: '防御资质', value: q.defense },
        { label: '体力资质', value: q.hp },
        { label: '法力资质', value: q.mp },
        { label: '速度资质', value: q.speed },
        { label: '躲闪资质', value: q.dodge },
    ];
});

const skillsText = computed(() => props.pet?.skills.join(' · ') || '无');
const pillsText = computed(() => props.pet?.innerPills.join(' · ') || '无');
</script>

<template>
    <Teleport to="body">
        <div
            ref="el"
            class="pet-tip dual-rule"
            :class="{ on: pet !== null }"
            :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
            role="tooltip"
            :aria-hidden="pet === null"
        >
            <template v-if="pet">
                <div class="tip-top">
                    <span class="tip-name">{{ pet.name }}</span>
                    <span class="tip-lv num">{{ pet.level }} 级</span>
                </div>
                <div class="meta tip-line">
                    参战 {{ pet.joinLevel }} · {{ pet.element }} · 成长 {{ pet.growth }} · 寿命
                    {{ pet.life }}
                </div>

                <div class="rule"></div>
                <dl class="quality">
                    <div v-for="item in qualities" :key="item.label">
                        <dt>{{ item.label }}</dt>
                        <dd class="num">{{ item.value }}</dd>
                    </div>
                </dl>

                <div class="rule"></div>
                <dl class="attrs">
                    <div v-for="item in pet.attrs" :key="item.label">
                        <dt>{{ item.label }}</dt>
                        <dd class="num">{{ item.value }}</dd>
                    </div>
                </dl>

                <div class="rule"></div>
                <div class="line">
                    <span class="k">技能</span><span class="v">{{ skillsText }}</span>
                </div>
                <div class="line">
                    <span class="k">内丹</span><span class="v">{{ pillsText }}</span>
                </div>
                <div v-if="pet.spirit !== undefined" class="line">
                    <span class="k">灵性</span><span class="v num">{{ pet.spirit }}</span>
                </div>
            </template>
        </div>
    </Teleport>
</template>

<style scoped>
.pet-tip {
    position: fixed;
    z-index: 60;
    /* 与装备浮片同宽，两个浮片一宽一窄会读成两套东西。 */
    width: 240px;
    padding: var(--block-pad-tight);
    border: var(--w-hair) solid var(--rule-2);
    background: var(--paper);
    box-shadow: var(--shadow-lift);
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-3px);
    transition:
        opacity var(--t-tip) var(--ease-soft),
        transform var(--t-tip) var(--ease-soft),
        visibility 0s linear var(--t-tip);
    --dual-inset: 2px;
}
.pet-tip.on {
    visibility: visible;
    opacity: 1;
    transform: none;
    transition-delay: 0s;
}
/* 暗色下投影黑压黑，靠把纸面往纸白提一档表达「在上面一层」。
 * 与 `GearTip` 同一条处理（§2.4-1 的 `:global(html.dark …)` 写法）。 */
:global(html.dark .pet-tip) {
    background: color-mix(in srgb, var(--paper-2) 86%, var(--paper-base) 14%);
}

.tip-top {
    display: flex;
    align-items: baseline;
    gap: 7px;
}
.tip-name {
    color: var(--ink);
    font-size: var(--fs-md);
    letter-spacing: 0.03em;
    line-height: 1.3;
}
.tip-lv {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
}
.tip-line {
    margin-top: 2px;
    letter-spacing: 0.04em;
}
.rule {
    height: var(--w-hair);
    margin: 6px 0 5px;
    background: var(--rule-2);
    opacity: 0.7;
}

/* 资质与属性都用「标签左、数右」：六个资质的数字位数不同（1440 对 3030 对 1276），
 * 不对齐时一眼看不出哪项特别高——而那正是打开这张纸要看的东西。 */
dl {
    display: grid;
}
dl > div {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 1px 0;
    font-size: var(--fs-sm);
}
dt {
    flex: none;
    color: var(--ink-2);
}
dd {
    margin: 0 0 0 auto;
    color: var(--ink);
    white-space: nowrap;
}
/* 八项战斗属性挤成两列：单列要占 8 行，两列 4 行就给下面的技能腾出了位置。 */
.attrs {
    grid-template-columns: 1fr 1fr;
    gap: 0 12px;
    font-size: var(--fs-mini);
}
.attrs > div {
    font-size: var(--fs-mini);
}
.attrs dt {
    color: var(--muted);
}
.attrs dd {
    color: var(--ink-2);
}

.line {
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 1px 0;
    font-size: var(--fs-sm);
}
.line .k {
    flex: none;
    min-width: 30px;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.08em;
}
.line .v {
    color: var(--ink-2);
}
</style>
