"""把全量霞鹜文楷裁成随包分发的子集。

    python tools/font/subset-font.py

产物覆盖 `assets/fonts/LXGWWenKaiScreen.woff2`（1.75MB），源文件是
`LXGWWenKaiScreen.full.woff2`（9.84MB）。**源文件必须留在库里**：没有它就再也
裁不出第二版，而下次想加字符（比如游戏更新了一批生僻地名）就得重新裁。

## 为什么裁

全量字体 48,338 个字形、47,883 个码位，占 9.84MB——比前端其余全部产物加起来
还大 5 倍，占安装包三分之一。其中绝大多数是繁体、日文、韩文、生僻字，本应用
一个都不会显示。

裁到「GB2312 全集 + ASCII + 中文标点 + 全角字符」后是 1.75MB，**字形的轮廓一个
比特都没变**，变的只是保留了哪些字。

## 为什么是 GB2312 全集，不是「只留源码里出现过的字」

源码里的中文字只有 1136 个，裁出来 302KB，比全集再小 1.45MB。但界面上有一整块
文字不是我们写的：**OCR 认出来的游戏文本**——任务名、NPC 名、地名，内容随游戏
版本变化，不可能提前穷举。裁剪面卡在源码用字上，等于赌「明天不会出现没预置的字」，
而漏掉的字会掉回雅黑，正好落在最显眼的那块内容上。

1.45MB 换「常用汉字全覆盖」，值得。

## 越界的字会怎样

GB2312 之外的汉字（生僻字、繁体、日文假名）回退到 `Microsoft YaHei`。这不会
缺字或乱码，只是那几个字的字形换成黑体——比整屏糊掉好得多。

## 许可

`OFL.txt` 里的 [ADDITIONAL PERMISSION] 明确允许「subsetted or converted to other
formats (e.g., WOFF/WOFF2) solely for web font delivery」，条件是不得作为可安装的
桌面字体分发。本应用只是把它内嵌进 WebView 当网页字体用，落在许可范围内，因此
**不必改字体名**。改这里的参数前先读一遍那段原文。
"""

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'assets', 'fonts', 'LXGWWenKaiScreen.full.woff2')
DST = os.path.join(ROOT, 'assets', 'fonts', 'LXGWWenKaiScreen.woff2')


def gb2312_hanzi():
    """GB2312 的 6763 个汉字：区位 16-55（一级常用）与 56-87（二级次常用）。"""
    chars = []
    for hi in range(0xB0, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.append(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError:
                pass
    return chars


def coverage():
    ascii_chars = [chr(c) for c in range(0x20, 0x7F)]
    # CJK 标点（、。《》「」…）与全角字母数字
    cjk_punct = [chr(c) for c in range(0x3000, 0x3040)]
    fullwidth = [chr(c) for c in range(0xFF01, 0xFF5F)]
    extra = list('·—…“”‘’《》【】、。，；：？！￥')
    return sorted(set(gb2312_hanzi() + ascii_chars + cjk_punct + fullwidth + extra))


def main():
    if not os.path.exists(SRC):
        sys.exit(f'找不到源字体：{SRC}')

    chars = coverage()
    text_file = os.path.join(ROOT, '.runtime', 'font-subset-chars.txt')
    os.makedirs(os.path.dirname(text_file), exist_ok=True)
    with open(text_file, 'w', encoding='utf8') as fh:
        fh.write(''.join(chars))

    print(f'字符数 {len(chars)}，开始裁剪（48k 字形的 CFF 重编译，约 5 分钟）…', flush=True)
    subprocess.run(
        [
            sys.executable,
            '-m',
            'fontTools.subset',
            SRC,
            f'--text-file={text_file}',
            f'--output-file={DST}',
            '--flavor=woff2',
            # 只留拉丁字距与连字：这是中文字体，GPOS/GSUB 的大头是竖排与异体字替换，
            # 本应用全横排，留着只是白白撑大文件。
            '--layout-features=kern,liga',
            '--verbose=0',
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    src_mb = os.path.getsize(SRC) / 1048576
    dst_mb = os.path.getsize(DST) / 1048576
    print(f'完成：{src_mb:.2f} MB → {dst_mb:.2f} MB（保留 {dst_mb / src_mb * 100:.1f}%）')


if __name__ == '__main__':
    main()
