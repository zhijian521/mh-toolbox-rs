/**
 * 角色完整修改、单件装备与单只召唤兽共用固定尺寸。
 * 右栏宽度由 tokens.css 的 --char-editor-w 提供，超出内容在详情区滚动。
 * 高度随可用视口收窄，避免切分区或增删属性时弹窗跳动。
 */
export const EDITOR_W = 900;
export const EDITOR_H = 'min(740px, calc(100vh - 48px))';
