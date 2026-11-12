<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import AppIcon from '../../../components/AppIcon.vue';
import PressButton from '../../../components/PressButton.vue';
import PetDetailForm from './PetDetailForm.vue';
import PetScreenshot from '../ocr/PetScreenshot.vue';
import PetImage from '../PetImage.vue';
import { applyPetPanel, emptyPet, type PetPanelResult } from '../ocr/pet-panel';
import type { Pet } from '../pets';
import { focusInput } from '../focus-input';

const emit = defineEmits<{ busy: [value: boolean] }>();

/** 左侧目录与分区导航常驻，右侧只编辑选中的召唤兽，长详情独立滚动。 */
const pets = defineModel<Pet[]>({ required: true });
const reading = ref(false);
function setBusy(value: boolean) {
    reading.value = value;
    emit('busy', value);
}
function recognize(result: PetPanelResult) {
    if (current.value) pets.value[selected.value] = applyPetPanel(current.value, result);
}
const selected = ref(0);
const revision = ref(0);
const current = computed(() => pets.value[selected.value] ?? null);
const form = ref<HTMLElement | null>(null);
const petName = (pet: Pet) => pet.name.trim() || '未命名';

function addPet() {
    pets.value.push({ ...emptyPet(), name: '' });
    selected.value = pets.value.length - 1;
    revision.value++;
}

function removeAt(index: number) {
    pets.value.splice(index, 1);
    if (index < selected.value) selected.value -= 1;
    selected.value = Math.max(0, Math.min(selected.value, pets.value.length - 1));
    revision.value++;
}
async function focusName(index: number) {
    if (!pets.value[index]) return;
    selected.value = index;
    await nextTick();
    await focusInput(form, 'input[aria-label="召唤兽名称"]');
}
defineExpose({ focusName });
</script>

<template>
    <div class="pet-editor">
        <PetScreenshot
            :key="`${selected}:${revision}`"
            :disabled="!current"
            @recognize="recognize"
            @busy="setBusy"
        >
            <template #navigation>
                <slot name="tabs" />
                <div class="pet-list-head">
                    <span
                        >召唤兽 <span class="pet-count">{{ pets.length }}</span></span
                    >
                </div>
                <nav class="pet-grid" aria-label="召唤兽列表">
                    <button
                        v-for="(pet, index) in pets"
                        :key="index"
                        class="pet-choice"
                        type="button"
                        :class="{ selected: index === selected }"
                        :aria-label="`编辑第 ${index + 1} 只召唤兽：${petName(pet)}`"
                        :aria-pressed="index === selected"
                        :disabled="reading"
                        :title="`${petName(pet)} · ${pet.level} 级`"
                        @click="selected = index"
                    >
                        <PetImage :name="pet.portrait || ''" kind="portrait" />
                        <span class="pet-mark" aria-hidden="true"></span>
                        <span class="pet-name">{{ petName(pet) }}</span>
                    </button>
                    <button
                        class="pet-add"
                        type="button"
                        aria-label="新增召唤兽"
                        title="新增召唤兽"
                        :disabled="reading"
                        @click="addPet"
                    >
                        <span class="pet-add-icon" aria-hidden="true">
                            <AppIcon name="add" />
                        </span>
                        <span class="pet-mark" aria-hidden="true"></span>
                        <span class="pet-name">新增</span>
                    </button>
                </nav>
            </template>

            <section v-if="current" ref="form" class="pet-block">
                <PetDetailForm
                    :key="selected"
                    :model-value="current"
                    @update:model-value="pets[selected] = $event"
                >
                    <!-- 删除这一只放在名字输入右边（2026-11-10 用户：左栏去掉删除按钮，
                         「删除按钮添加在右侧召唤兽详情的名字输入的后面」）。它读的是**当前选中**
                         那一只，不再像上一版那样每格各留一枚压在角落。 -->
                    <template #name-extra>
                        <PressButton
                            icon="trash"
                            :label="`删除第 ${selected + 1} 只召唤兽：${petName(current)}`"
                            :disabled="reading"
                            @click="removeAt(selected)"
                        />
                    </template>
                </PetDetailForm>
            </section>
            <div v-else class="pet-empty well upright">暂无召唤兽，点击左侧“新增”开始记录</div>
        </PetScreenshot>
    </div>
</template>

<style scoped>
.pet-editor {
    display: flex;
    flex: 1;
    height: 100%;
    min-width: 0;
    min-height: 0;
}
.pet-list-head {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.pet-count {
    margin-left: 6px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
/* 左栏是**一格格图标**，照装备页那十二部位（2026-11-10 用户：「召唤兽列表页修改为和
 * 装备差不多的图标格子」）。上一版是一只一条「票」：30 的头像 + 名字 + 等级横排，四五只
 * 就占满左栏，把下面的截图挤没了。
 *
 * 2026-11-10 第二轮（用户）：「图标现在太小了，增大一点，去掉等级和删除按钮，只保留图标
 * 和名字，还有选择的下划线展示在头像下面，名字展示在下划线下面」。于是这一格从上到下
 * 只剩三件——**头像 / 那道朱印 / 名字**，等级与删按钮都撤了（等级看右侧表单，删除挪到
 * 名字输入右边）。印**常驻**、只换颜色，切换选中时这一格高度不动。
 *
 * 六列与装备格同数：左半栏 400 宽、六列 gap 4 → 每格约 63.3，图 52 两侧各留 5.6，
 * 与那边「块 48 在 63.3 的格里」同一个比例，两页并排翻是同一套格子。
 * 行按内容取高（只数不固定，不像装备正好十二件），不写死 `grid-template-rows`。 */
.pet-grid {
    display: grid;
    flex: none;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 4px;
    max-height: 208px;
    min-height: 0;
    overflow-y: auto;
}
/* 已有召唤兽与末尾新增格共用一套尺寸；新增格中间是加号，不伪装成召唤兽头像。 */
.pet-choice,
.pet-add {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* 5 是图—印、印—名字两道同一个气口，三件均匀分开。 */
    gap: 5px;
    min-width: 0;
    padding: 6px 2px;
    border: var(--w-hair) solid transparent;
    border-radius: var(--r-2);
    background: transparent;
    color: var(--ink);
    text-align: center;
    cursor: pointer;
}
/* 悬停只把这一格提成一张纸，**不发朱**——朱专指「当前这一只」。 */
.pet-choice:hover:not(:disabled),
.pet-add:hover:not(:disabled) {
    border-color: var(--rule-2);
    background: var(--paper-2);
}
.pet-choice:focus-visible,
.pet-add:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.pet-choice:disabled,
.pet-add:disabled {
    cursor: wait;
}
/* 新增格的加号盒与头像同为 52×52，虚线只表达“这里可以加一只”。 */
.pet-add-icon {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border: var(--w-hair) dashed var(--rule-2);
    border-radius: var(--r-3);
    color: var(--muted);
    --icon-size: calc(22px * var(--fs-scale));
}
.pet-add:hover:not(:disabled) .pet-add-icon {
    border-color: var(--ochre);
    color: var(--ink);
}
/* 52 的头像给一块**凸起的纸**，与装备格里那块白盘同一套棱（那边由 `PressTile` 给，
 * 这里只有一张图，四条棱直接写在图块上；块面两个主题两个方向，理由同 `gear-pane.css`）。
 *
 * 多带一层 `.pet-image` 是为压过 `PetImage` 自己的 `.portrait { --pet-icon-size: 48px }`：
 * 两条 scoped 之后都是 0-2-0，打平就成了「谁后注入谁赢」。52 是这一格能放下的上限——
 * 六列每格约 70，两侧各留 9；再大就要缩回五列，与装备页那套格子对不上了。 */
.pet-choice :deep(.pet-image.portrait) {
    --pet-icon-size: 52px;
    border-radius: var(--r-3);
    background: light-dark(var(--paper), color-mix(in srgb, var(--paper-2) 84%, var(--ink)));
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 1px 0 0 color-mix(in srgb, var(--bevel-hi) 62%, transparent),
        inset -1px 0 0 color-mix(in srgb, var(--rule-2) 46%, transparent),
        inset 0 -2px 0 color-mix(in srgb, var(--rule-2) 76%, transparent),
        0 2px 0 var(--shadow),
        0 4px 7px -3px var(--shadow-lg);
}
/* 选中 / 未选中都占这 22×2：只换底色，不换占位——否则切换时下面那行名字上下跳 2px。
 * 位置就在图的正下方，与装备部位格、卡内页签同一个记号。 */
.pet-mark {
    width: 22px;
    height: 2px;
    border-radius: 1px;
    background: transparent;
}
.pet-choice.selected .pet-mark {
    background: var(--cinnabar);
}
/* 名字在最下面，走满一行，太长就省略——不换行，否则格子会被两行字顶高。 */
.pet-name {
    width: 100%;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-mini);
    text-overflow: ellipsis;
    white-space: nowrap;
}
.pet-block,
.pet-empty {
    flex: 1;
    min-width: 0;
    min-height: 0;
    border-radius: var(--r-2);
    overflow: hidden;
}
.pet-block {
    display: flex;
    flex-direction: column;
}
.pet-empty {
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: var(--fs-sm);
}
</style>
