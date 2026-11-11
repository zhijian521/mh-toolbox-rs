<script setup lang="ts">
import { computed } from 'vue';
import MeterBar from '../../../components/MeterBar.vue';
import GroupHead from '../../../components/GroupHead.vue';
import NumTag from '../../../components/NumTag.vue';
import { expPercent, type AttrGroup, type ExpRow } from '../character';
import type { QuickTarget } from '../quick/quick-target';
import { quickRowBinds, useQuickable } from '../quick-row';

/**
 * 卡内「属性」页。2026-11-05 从 `CharacterCard.vue` 拆出来：那张卡一个文件装六个分区，
 * 561 行模板 + 982 行样式，改哪一页都要在同一份文件里找。
 *
 * 拆的**界线是分区**：这个文件连同它自己的 `<style scoped>` 只认「五组属性 + 经验条」，
 * 卡头、页签、滚动容器仍留在 `CharacterCard.vue`。样式跟着模板走是关键——
 * 父组件的 `scoped` 样式够不到子组件的内部元素，所以搬模板必须连样式一起搬。
 *
 * ---- `editable`：同一页，读数变成可改的格（2026-11-07）----
 * 截图识别的弹窗右边要的是「认完之后的样子」，而认错的那几个数**必须当场能改**。
 * 原先的做法是在弹窗左栏另排二十四个输入格——同一批数在屏幕上出现两遍，
 * 改哪一边都得先想「另一边会不会覆盖我」。现在只有一份：卡上那枚签自己变成格子，
 * 材质沿用编辑页同一套（`.field.num-slot`，52 × 18），所以「能改」这件事不用再解释。
 *
 * 只开**数字**这几格：名称、等级、门派、帮派是卡头的事，不在这页上，也就不在这页改。
 *
 * 抛上去的键是**这一页自己的叫法**（属性行就是行名），经验那两个叫
 * `experience.value` / `experience.need`——不叫 `expValue` / `expNeed`，那是识别层的词，
 * 卡不该认识它。怎么翻译由弹窗那一层管。
 *
 * ---- `tabbed`：这一页是不是「某个页签下面的面板」----
 * 只影响 ARIA。卡上有六个页签时它是 `tabpanel`，`aria-labelledby` 指着那枚页签；
 * 截图识别的预览卡**不画页签条**（只展示属性这一页），这时它既没有页签可指、也不该
 * 自称 tabpanel——`tabpanel` 必须在一个 `tablist` 里，否则读屏会念一个不存在的页签组。
 * 所以那时降级成 `region`，名字由 `aria-label` 给。
 */
const props = withDefaults(
    defineProps<{
        groups: AttrGroup[];
        experience: ExpRow;
        editable?: boolean;
        tabbed?: boolean;
        /**
         * 点一行就开「快速修改」（`quick/QuickEdit.vue`）。
         *
         * 与 `editable` **互斥**：那一态里每一格已经是输入框，再叠一层「点了弹窗」
         * 就成了「点输入框弹出另一个输入框」。所以下面用 `quickable` 一处判断，
         * 而不是两处各写一遍条件（写两遍迟早有一处忘了改）。
         */
        quick?: boolean;
    }>(),
    { editable: false, tabbed: true, quick: false },
);

const emit = defineEmits<{
    'edit-value': [key: string, value: string];
    quick: [target: QuickTarget];
}>();

/* 卡上（只读、非预览）才可点。截图识别那张预览卡两边都不满足。 */
const quickable = useQuickable(props);

function openAttr(label: string) {
    if (!quickable.value) return;
    emit('quick', { kind: 'attr', label });
}

function openExp() {
    if (!quickable.value) return;
    emit('quick', { kind: 'exp' });
}

/**
 * 失焦（`change`）与 Enter 才写回，不在每次按键时写。
 *
 * 与 `NumberField` 同一条理由：值是**父级现算出来的**（`applyAttrPanel` → 卡片），
 * 每敲一个字符就往回写，父级会把它规整一遍再渲染回来，光标就跳到末尾。
 * 这里连 `v-model` 都不能用——绑的是 prop 里的字符串，不是本组件的状态。
 */
function commit(key: string, event: Event) {
    const input = event.target as HTMLInputElement;
    emit('edit-value', key, input.value.trim());
}

/* 经验条的两个值：百分比在 `character.ts` 里算（纯函数、有单测），这里只负责文案。
 * 两者都没填就不显示文字——一根空轨道配一个空字符串会把这一行压成一条灰线。 */
const expPercentValue = computed(() => expPercent(props.experience.value, props.experience.need));

const expText = computed(() => {
    const { value, need } = props.experience;
    if (value && need) return `${value} / ${need}`;
    return value || need;
});
</script>

<template>
    <section class="pane" :role="tabbed ? 'tabpanel' : 'region'">
        <!-- 两行两列：上排资源 / 名望，下排战斗 / 加点。顺序来自数据
             （`attrGroups`），这里只给网格——按列排会让下排两组被上一组的
             长短拖着错位，按行排才能「上下两排各自顶对齐」。 -->
        <div class="attr-layout">
            <div
                v-for="group in groups"
                :key="group.title"
                class="attr-group"
                :class="{ wide: group.wide }"
            >
                <GroupHead>{{ group.title }}</GroupHead>
                <!-- 一行一张**小一号**的票：名目在左、读数在右，28 高。
                     属性这一页要塞 20 项、排成 11 个视觉行（资源 4 / 名望 3 /
                     战斗 6 / 加点 5 / 潜能通栏 1），只有 28 装得进 493 的版心
                     ——42 的票会让这一页溢出 100 多（算式见 CONVENTIONS §2.4-43）。
                     不再画引导点线：票里名目吃满中间、签贴右缘，两端本来就对齐，
                     那串点只在这张 177 宽的列里剩十来颗。
                     空值画一个淡「—」：一行里只有一个空档时，「没填」读起来像
                     「值恰好很短」。 -->
                <dl class="slip-rows sm">
                    <!-- 只读时这一行整条是可点的「快速修改」入口：票面就是落点，
                         不必再加一枚按钮——一枚 28 高的票里再塞图标，名目就没地方了。
                         `role` / `tabindex` 只在可点时给：不可点的行自称按钮，
                         读屏会把二十行都念成「按钮」，Tab 也会在每个上面停一下。 -->
                    <div
                        v-for="row in group.rows"
                        :key="row.label"
                        class="slip-row sm"
                        :class="{ blank: !row.value, quickable }"
                        v-bind="
                            quickRowBinds(
                                quickable,
                                () => openAttr(row.label),
                                `快速修改 ${row.label}`,
                            )
                        "
                    >
                        <dt class="slip-name">{{ row.label }}</dt>
                        <dd class="attr-val">
                            <!-- 可改的那一态：签的落点上换成一枚**同一尺寸**的格
                                 （材质与编辑页的数值格是同一份 `.field.num-slot`），
                                 所以「这枚签能点」不用再加提示字。 -->
                            <input
                                v-if="editable"
                                class="field num num-slot attr-field slip-input"
                                :value="row.value"
                                :aria-label="row.label"
                                @change="commit(row.label, $event)"
                                @keydown.enter="commit(row.label, $event)"
                            />
                            <NumTag v-else class="slip-val">
                                <span class="lv">{{ row.value || '—' }}</span>
                            </NumTag>
                        </dd>
                    </div>
                </dl>
            </div>
        </div>

        <!-- 经验单独一行：它是这一屏唯一有分母的数（离下一级还有多远），
             混在资源那五行里只是第六个数字。
             可点时整条（连同进度条）都是落点：经验条是这一行最大的目标，
             让它单独不可点会读成「条只是装饰」。 -->
        <div
            class="exp-row"
            :class="{ quickable }"
            v-bind="quickRowBinds(quickable, openExp, '快速修改经验')"
        >
            <GroupHead>经验</GroupHead>
            <!-- 可改时文字让位给两格输入，**条留着**：数一改，条当场动一下，
                 比任何「已保存」的提示都直接。 -->
            <MeterBar :percent="expPercentValue" label="经验进度" :text="editable ? '' : expText" />
            <span v-if="editable" class="exp-edit">
                <input
                    class="field num num-slot exp-field"
                    :value="experience.value"
                    aria-label="当前经验"
                    @change="commit('experience.value', $event)"
                    @keydown.enter="commit('experience.value', $event)"
                />
                <span class="exp-slash">/</span>
                <input
                    class="field num num-slot exp-field"
                    :value="experience.need"
                    aria-label="升级所需经验"
                    @change="commit('experience.need', $event)"
                    @keydown.enter="commit('experience.need', $event)"
                />
            </span>
        </div>
    </section>
</template>

<style scoped src="./attr-pane.css"></style>
