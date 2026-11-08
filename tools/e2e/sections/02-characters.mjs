import { setup, pets, cleanup } from './characters/crud.mjs';
import { ocr } from './characters/ocr.mjs';
import { quick } from './characters/quick.mjs';
import { equipment } from './characters/equipment.mjs';

export default async function run(ctx) {
    if (!ctx.want('角色')) return;
    await setup(ctx);
    await ocr(ctx);
    await pets(ctx);
    await quick(ctx);
    await equipment(ctx);
    await cleanup(ctx);
}
