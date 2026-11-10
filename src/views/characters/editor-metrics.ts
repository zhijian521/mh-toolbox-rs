/**
 * 角色相关弹窗的共用尺寸。
 *
 * 900 = 左截图 400 + 右详情 460 + 描边 / 内边距 / gap，算式见 CharacterEditor.vue。
 * 右栏宽度共用 tokens.css 的 --char-editor-w，三个弹窗的外宽只在这里维护。
 *
 * 两个常量分两档：
 * - `EDITOR_W` 给数字（`ModalShell` 按 px 处理）；
 * - `EDITOR_MIN_H` 给整段 CSS 值（要跟着视口走，`ModalShell` 原样交出去）。
 *
 * 「定高」与「下限」**不能统一**：`CharacterEditor` 传 `height`（切分区时尺寸不跳），
 * 两个快速修改窗传 `min-height`（内容长了跟着长）。`ModalShell.vue` 对两者分开处理。
 */
export const EDITOR_W = 900;
export const EDITOR_MIN_H = 'min(740px, calc(100vh - 48px))';
