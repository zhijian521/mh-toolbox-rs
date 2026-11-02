<script setup lang="ts">
import CostSwitch from '../../../components/CostSwitch.vue';
import PressButton from '../../../components/PressButton.vue';
import type { AttrGroup, ExpRow } from '../character';

/**
 * 属性分区：四组 + 经验一行。
 *
 * 编辑器里**单列竖排**，不像卡内那样两行两列：卡内是「读」，两列 20 行一眼扫得完；
 * 这里是「写」，每行有三个输入格加一个开关，两列并排时只剩 330px，格与格要互相挤。
 * 录入时是一组一组往下填的，竖排正好对得上这个顺序。
 *
 * 数组走 `v-model`（绑的就是草稿里那一个）：增删要写回数组本身，只读 prop 过不了
 * `vue/no-mutating-props`。没有第二份副本——这一层没有保存动作，回传无从谈起。
 */
const groups = defineModel<AttrGroup[]>({ required: true });
const experience = defineModel<ExpRow>('experience', { required: true });

function addRow(group: AttrGroup) {
    group.rows.push({ label: '', value: '' });
}

function removeRow(group: AttrGroup, index: number) {
    group.rows.splice(index, 1);
}

/* 开关只能给 `boolean`，而契约里这一项是 `boolean | undefined`（没标过就没这个键）。
 * `undefined` 在 JSON 里活不下来，所以「关」要写回 `undefined` 而不是 `false`——
 * 否则每个角色每条属性都会多出一个 `strong: false`，序列化后体积翻倍还看不出区别。 */
function setStrong(row: { strong?: boolean }, value: boolean) {
    row.strong = value || undefined;
}
</script>

<template>
    <div class="attr-editor">
        <section v-for="(group, gi) in groups" :key="gi" class="attr-group">
            <div class="group-head">
                <span class="section-mark"></span>
                <input
                    v-model="group.title"
                    class="field group-title"
                    aria-label="分组名"
                    placeholder="分组名"
                />
                <PressButton
                    icon="add"
                    text="加一行"
                    label="给这一组加一行"
                    @click="addRow(group)"
                />
            </div>

            <div v-for="(row, ri) in group.rows" :key="ri" class="erow">
                <input
                    v-model="row.label"
                    class="field label-field"
                    aria-label="项目名"
                    placeholder="项目"
                />
                <input
                    v-model="row.value"
                    class="field num value-field"
                    aria-label="数值"
                    placeholder="数值"
                />
                <input
                    v-model="row.sub"
                    class="field sub-field"
                    aria-label="后缀"
                    placeholder="后缀"
                />
                <CostSwitch
                    :model-value="row.strong === true"
                    off-label="不标"
                    on-label="标出"
                    @update:model-value="setStrong(row, $event)"
                />
                <PressButton icon="trash" label="删掉这一行" @click="removeRow(group, ri)" />
            </div>
        </section>

        <!-- 经验不占四组的位置：它没有「项目名」，只有两个数（当前 / 升级所需）。 -->
        <section class="attr-group">
            <div class="group-head">
                <span class="section-mark"></span>
                <span class="group-title-static">经验</span>
            </div>
            <div class="erow">
                <input
                    v-model="experience.value"
                    class="field num exp-field"
                    aria-label="当前经验"
                    placeholder="当前经验，如 3,777.2万"
                />
                <span class="slash">/</span>
                <input
                    v-model="experience.need"
                    class="field num exp-field"
                    aria-label="升级所需经验"
                    placeholder="升级所需"
                />
                <span class="hint">填了「升级所需」卡上才画进度</span>
            </div>
        </section>
    </div>
</template>

<style scoped>
/* 单列：四组竖排，每组占满整行宽度。理由见脚本头注释。 */
.attr-editor {
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.group-head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 6px;
}
/* 「加一行」推到行尾：组名只有 160 宽，按钮紧跟其后会在中间留出一大片空，
 * 看上去像「按钮掉在了半路」。同一组里的操作放在同一侧，扫视时不用来回找。 */
.group-head .press-btn:last-child {
    margin-left: auto;
}
/* 组名当输入框用，但读起来要是**标题**而不是「一格待填」：去掉边框与底色，
 * 只留一段墨字。焦点时才浮出输入格——不聚焦时它是标题，聚焦时才承认自己是输入框。 */
.group-title {
    width: 160px;
    height: 24px;
    padding: 0 4px;
    border-color: transparent;
    background: none;
    font-size: var(--fs-sm);
    letter-spacing: 0.06em;
}
.group-title:hover {
    border-color: var(--rule-2);
}
/* 「经验」这一组的组名是死的（它不叫别的名字），所以给一个和输入框同高的静态块，
 * 位置才对得上上面四组的输入框。 */
.group-title-static {
    padding: 0 4px;
    font-size: var(--fs-sm);
    letter-spacing: 0.06em;
    line-height: 24px;
}
/* 项目名与后缀定宽，**数值那格吃剩下的**：三格全定宽时一行只占 400 左右，
 * 而面板有 690 宽——行右侧空出一大片，行尾的删与组头的「加一行」两条右缘对不齐，
 * 读起来像两个不相干的控件。数值格子放宽之后，一行正好从左撑到右，
 * 也放得下「3,777.2万」这种长值。 */
.label-field {
    width: 120px;
}
.value-field {
    flex: 1;
    min-width: 108px;
}
.sub-field {
    width: 80px;
}
.exp-field {
    width: 180px;
}
.slash {
    color: var(--muted);
}
/* 开关比别处窄一点：它在一行里只交代「这一项要不要标朱」，不该和数值抢宽度。 */
.erow :deep(.cost-switch) {
    flex: none;
}
.erow :deep(.cost-opt) {
    padding: 3px 6px;
}
</style>
