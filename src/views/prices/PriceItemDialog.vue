<script setup lang="ts">
import { computed, reactive, ref, useId } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PriceField from '../../components/PriceField.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import { DEFAULT_CATEGORY, PRICE_CATEGORIES, subsOf } from './prices-catalog';
import {
    NAME_LIMIT,
    SUB_LIMIT,
    itemDraftErrors,
    retuneSub,
    toItemDraft,
    type PriceItem,
    type PriceItemDraft,
} from './prices';

/**
 * 新建 / 编辑一件物品的弹窗。
 *
 * 原先是行内表单（`PriceItemForm.vue`），用户要求所有写操作改成弹窗，于是搬进来。
 * 搬的时候没有顺手改字段：名称 / 一级 / 二级 / 初始价 / 备注 这五格，以及
 * 「初始价只在新建时出现」这条，都原样保留——那是上一版讨论过的东西，不属于这次的范围。
 *
 * ---- 二级仍是自由输入，不是下拉 ----
 * 页面上方那两个筛选下拉是「从已有数据里挑一个来看」，而这里是在**生产**数据：
 * 新玩法产出的东西未必在名单里，逼用户只能从表里选，等于让他等我们改版。
 * 所以这一格保持输入框，只在下面给一行「这一类常见：…」做提示。
 * `subsOf` 的名单与 `retuneSub` 的清空规则是同一份，两边不会打架。
 *
 * ---- 「未填」不是「填错」 ----
 * 弹窗一打开就挂红字是在用户还什么都没做的时候先告状。错误行要
 * `submitted`（点过保存）或 `touched.x`（离开过这一格）之一才亮。
 */
const props = defineProps<{
    item: PriceItem | null;
    /** 父级写盘失败时的原因（同名物品等）。留在窗内显示：关掉窗再报错，用户得重填一遍。 */
    error?: string;
    saving?: boolean;
    locked?: boolean;
    retrying?: boolean;
}>();

const emit = defineEmits<{
    save: [draft: PriceItemDraft, initialPrice: number];
    close: [];
}>();

/* 父级用 `:key` 保证换编辑对象时这个组件重建，所以草稿只需初始化读一次。 */
const draft = reactive<PriceItemDraft>(
    props.item
        ? toItemDraft(props.item)
        : { name: '', category: DEFAULT_CATEGORY, sub: '', note: '' },
);

/* 初始价只在新增时出现：改一件已有的物品顺手记个价，会把「改名字」变成一次记价，
 * 两件事混在同一个保存按钮上，用户点了才知道多了一条记录。 */
const initialPrice = ref(0);

const CATEGORY_OPTIONS = PRICE_CATEGORIES.map((name) => ({ value: name, label: name }));

/* ---------- 二级分类：预设可选，但仍然允许自己写 ----------
 * 目录里每一类都带着常见子类（与老仓 `price-catalog.js` 同一份，九类共 37 个）。
 * 只给一个空输入框的话，那些名字一个都露不出来，用户得自己记得是「高级兽决」
 * 还是「高级要诀」——这正是「默认数据」该省掉的事。
 *
 * 但**不能只剩下拉**：新玩法产出的东西未必在名单里，逼人只能从表里选，
 * 等于让他等我们改版（老仓同一份目录的头注释也这么写）。所以末尾加一项
 * 「其他（自己写）」，选中后换成输入框——用同一个 `draft.sub`，
 * 校验、`retuneSub`、存盘都不必知道现在是哪种模式。
 *
 * 打开已有物品时：它的 `sub` 若不在本类名单里（用户以前自造的），直接进自写模式，
 * 否则下拉会显示成「不分类」，看起来像把他的值吃掉了。 */
const SUB_CUSTOM = '__custom__';
const subCustom = ref(!!props.item?.sub && !subsOf(props.item.category).includes(props.item.sub));

const subOptions = computed(() => [
    { value: '', label: '不分类' },
    ...subsOf(draft.category).map((name) => ({ value: name, label: name })),
    { value: SUB_CUSTOM, label: '其他（自己写）' },
]);

const subValue = computed(() => (subCustom.value ? SUB_CUSTOM : draft.sub));

function pickSub(value: string) {
    if (value === SUB_CUSTOM) {
        subCustom.value = true;
        draft.sub = '';
        return;
    }
    subCustom.value = false;
    draft.sub = value;
}

const errors = computed(() => itemDraftErrors(draft));
const canSave = computed(() => !errors.value.name && !errors.value.sub);

const submitted = ref(false);
const touched = reactive({ name: false, sub: false });
const showNameError = computed(() => (submitted.value || touched.name) && !!errors.value.name);
const showSubError = computed(() => (submitted.value || touched.sub) && !!errors.value.sub);

/**
 * 换一级分类：顺手把不再属于新一级的二级清掉。
 * 规则与理由在 `prices.ts` 的 `retuneSub`；存盘处（`prices-store`）也拦一道，
 * 这里做是为了让它在**眼前**就消失，而不是保存之后才悄悄不见。
 */
function pickCategory(value: string) {
    if (value === draft.category) return;
    draft.sub = retuneSub(draft.sub, value);
    draft.category = value;
    /* 换了类之后回到下拉：此刻 `sub` 要么是空、要么是新类名单里还剩的那个，
     * 两种都该由下拉来显示。停在自写输入框里会是一个空白格，看着像值丢了。 */
    subCustom.value = false;
}

function submit() {
    submitted.value = true;
    if (props.saving || (!props.retrying && !canSave.value)) return;
    emit('save', { ...draft }, initialPrice.value);
}

/* 表单里三格文字输入、又没有 `type="submit"` 按钮，规范规定这种表单的隐式提交什么都不做，
 * 所以回车要自己接。只认 `input` 上的回车：焦点在「保存」上时不能再走一遍。 */
function onEnter(event: KeyboardEvent) {
    if (event.isComposing || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    submit();
}
const nameErrorId = `item-name-${useId()}`;
const subErrorId = `item-sub-${useId()}`;
</script>

<template>
    <ModalShell
        :title="item ? '修改物品' : '新增物品'"
        :width="480"
        :scroll="false"
        @close="!saving && emit('close')"
    >
        <form
            id="price-item-form"
            class="dialog-form modal-form"
            @submit.prevent="submit"
            @keydown.enter="onEnter"
        >
            <fieldset :disabled="locked" :inert="locked">
                <label class="cell cell-wide">
                    <span class="field-label">物品名称</span>
                    <input
                        v-model="draft.name"
                        class="field"
                        :maxlength="NAME_LIMIT"
                        aria-label="物品名称"
                        :aria-invalid="showNameError || undefined"
                        :aria-describedby="showNameError ? nameErrorId : undefined"
                        placeholder="高级内丹"
                        @blur="touched.name = true"
                    />
                    <span v-if="showNameError" :id="nameErrorId" class="note error">{{
                        errors.name
                    }}</span>
                </label>

                <label class="cell">
                    <span class="field-label">一级分类</span>
                    <SelectField
                        :model-value="draft.category"
                        :options="CATEGORY_OPTIONS"
                        label="物品一级分类"
                        :disabled="locked"
                        @update:model-value="pickCategory"
                    />
                </label>

                <label class="cell">
                    <span class="field-label">二级分类</span>
                    <SelectField
                        v-if="!subCustom"
                        :model-value="subValue"
                        :options="subOptions"
                        label="二级分类"
                        placeholder="不分类"
                        :disabled="locked"
                        @update:model-value="pickSub"
                    />
                    <input
                        v-else
                        v-model="draft.sub"
                        class="field"
                        :maxlength="SUB_LIMIT"
                        aria-label="自己写一个二级分类"
                        :aria-invalid="showSubError || undefined"
                        :aria-describedby="showSubError ? subErrorId : undefined"
                        placeholder="自己写一个"
                        @blur="touched.sub = true"
                    />
                    <span v-if="showSubError" :id="subErrorId" class="note error">{{
                        errors.sub
                    }}</span>
                </label>

                <div v-if="!item" class="init-price">
                    <!-- 占位符只放 `0`（组件默认）。早先这里塞了「不填就先建卡」，
                     六个中文字在数字格里被裁成「不填就先」，后面还跟着「万」，
                     读起来像两个东西撞在一起。长句该进 label 或提示行，不该进数字格。 -->
                    <PriceField v-model="initialPrice" label="初始价（可空）" size="md" stepper />
                </div>

                <label class="cell" :class="{ 'cell-wide': !!item }">
                    <span class="field-label">备注（可空）</span>
                    <input
                        v-model="draft.note"
                        class="field"
                        aria-label="备注"
                        placeholder="哪条线、什么成色"
                    />
                </label>
            </fieldset>
            <p v-if="error" class="note error dialog-error" role="alert">{{ error }}</p>
        </form>

        <template #footer>
            <PressButton
                data-modal-cancel
                :disabled="saving"
                text="取消"
                label="放弃这次编辑"
                @click="emit('close')"
            />
            <PressButton
                icon="check"
                :text="retrying ? '重试保存' : '保存'"
                label="保存这件物品"
                :disabled="saving || (!retrying && !canSave)"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
fieldset {
    display: contents;
}
/* 两列网格：名称与（编辑时的）备注通栏，其余各占一半。
 * 不用 flex + 定宽——固定比例就该用 grid 的轨道（CONVENTIONS §2.4-32），
 * 而这里要的正是「两列各半分」。 */
.dialog-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 11px 13px;
}
.cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.cell-wide {
    grid-column: 1 / -1;
}
/* 初始价占整行。**不用 `.cell` 包**：`.cell` 是「标签 + 输入」的 flex 列（竖排 + 4px 缝），
 * 而 `PriceField` 自带 label、自带横排的槽，套进去只会多一层没用的列布局。
 * 宽度也与下面那条 `.cell input { width: 100% }` 无关：本文件的样式是 scoped，
 * 选择器只命中带本组件 `data-v` 的 input，够不着子组件内部的输入框；
 * 那一个的宽度由 `PriceField` 按内容给的 inline style 定（`inputStyle`），
 * 所以「数字 + 万」本来就紧挨着，不会被撑成整行。 */
.init-price {
    grid-column: 1 / -1;
}
/* 输入格吃满自己的格子。 */
.cell input {
    width: 100%;
    min-width: 0;
}
/* 提示行只调位置，不改字号与字色（那是 `.meta` 的档）。
 * 通栏放在最后一行的下面，不占某一列的格。 */
/* 写盘失败那一句：通栏放在最后一行的下面，不占某一列的格。
 * 早先这个类叫 `.subs-hint`——那是给「这一类常见：…」那行提示用的，提示换成下拉之后
 * 名字还留着，读代码的人会以为它在管别的事。 */
.dialog-error {
    grid-column: 1 / -1;
    margin: 0;
}
</style>
