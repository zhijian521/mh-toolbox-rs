//! 老库搬家：把 2026-11-03 之前落在 identifier 目录下的库搬进红线 1 的目录。
//!
//! 从 `store.rs` 独立出来的理由只有一个：这是全仓**唯一**一个零 SQL、零 `AppHandle`、
//! 纯 `std::fs` 的函数。它的三条规矩（只在目标不存在时搬 / WAL 一起搬 / 正式名
//! 要么不存在要么完整）与表结构没有任何关系，混在 `store.rs` 里读代码时要先跳过
//! 两百行与 SQL 无关的复制逻辑。别的函数没有这个性质，所以只有这一个文件。
//!
//! `store::migrate_legacy_db`（问系统要旧目录）仍留在 `store.rs`：它吃 `AppHandle`，
//! 而这里要保持「两个 `Path` 就能测」。

use std::path::Path;

use crate::store::DB_FILE;

/// 临时文件名。**带 pid**：用户双击两次时会有两个进程同时走到这里，
/// 写死的 `.tmp` 名会让后一个 `File::create` 截断前一个正在写的文件。
///
/// 进程内不需要再区分——迁移只在单线程的 `setup()` 里调一次。
fn staged_name(suffix: &str) -> String {
    format!("{DB_FILE}{suffix}.{}.tmp", std::process::id())
}

/// 从 `legacy_base` 把库（连同 `-wal`）搬到 `base`。
///
/// 来由：2026-11-03 之前的版本用 `app.path().app_data_dir()` 取目录，库文件实际落在
/// `%APPDATA%\com.zhijian.mhtoolbox.rs\mh-toolbox.db`，而红线 1 要求的是
/// `%APPDATA%\mh-tool-v2`。改路径本身是修 bug，但**不改就等于让用户已有的账本消失**，
/// 所以第一次走到新路径时先搬过来。
///
/// 四条规矩：
/// 1. **只在目标不存在时搬**。目标已经有库（哪怕只有一张空表）说明新路径已经在用了，
///    这时再从旧位置覆盖一次，会把用户新记的东西冲掉。
/// 2. **`-wal` 必须一起搬**。WAL 模式下最近的事务可能还在 `-wal` 里没 checkpoint 进主库，
///    只复制主库就是丢掉最后几笔录入。
/// 3. **正式文件名在任何时刻要么不存在、要么是完整的**，不许拿一个空库继续启动。
/// 4. **`-shm` 不搬**。它是可重建的共享内存索引，内容随时会被 SQLite 覆写；
///    复制它只是多出一个「必须和主库同期」的对象，而它一旦与主库不配套，
///    SQLite 会拒绝打开或当成损坏。
///
/// 第 3 条是靠 **先复制到 `.tmp`、全部成功后再逐个 `rename`** 做到的，不是靠「失败时把
/// 已经复制的那几个删掉」。后者必然漏一个：`std::fs::copy` 是「先 `File::create`
/// 截断目标再往里写」，写阶段失败（ENOSPC / EIO）会在正式名下留一个**半截文件**，
/// 而它并不在「已经复制成功」的集合里，删不到——下一次启动 `target.exists()` 为真就
/// 早退当作「已迁移」，一次看得见的失败变成永久的数据缺失。`rename` 是原子替换，
/// 于是那条缝隙从结构上就不存在。
///
/// 第 5 条（顺序）：**rename 是 wal → db，主库最后出现**。两个文件不是原子单位，
/// 反序让主库本身变成「迁移完成」的唯一标记——中途断电只留下「主库不存在」，
/// 下次启动照常重试；正序则可能留下「主库在、WAL 缺」，而那正是第 1 条会永久早退的状态。
///
/// 第 6 条（残留）：**rename 之前无条件删掉目标侧的 `-wal` / `-shm`**。上一轮可能崩在
/// 两次 rename 之间：目标位留下了上一轮的 `-wal`，而这一轮旧库已经没有 `-wal` 可搬。
/// 那时 rename 不会碰它，新主库旁边于是躺着一份**属于上一份数据**的 WAL——SQLite 会
/// 把那些帧 apply 进去，结果是 `database disk image is malformed`。删掉它，代价是
/// 重试时最多丢上一轮尚未 checkpoint 的那几笔（这一轮会重新复制一遍）。
///
/// 搬成功后**不删**旧文件，而是改名成 `*.migrated` 留底。不删是因为那是用户数据；
/// 改名是因为早先「旧库原样留着」会让删库重来的用户下一次启动又被搬回迁移那天的旧账
/// （`target.exists()` 只是唯一标记，旧库一直是合法源）。`.migrated` 后缀让它不再是
/// 合法源，同时还能被手工回捞——与 `roster.ts` 的「改名留底」同一条理由。
pub(crate) fn migrate_between(legacy_base: &Path, base: &Path) -> Result<(), String> {
    let target = base.join(DB_FILE);
    if target.exists() {
        return Ok(());
    }
    let legacy = legacy_base.join(DB_FILE);
    /* `APPDATA` 缺失时 `base` 本身就是 `app_data_dir()`（见 `store::base_dir` 的兜底），
     * 两者同一路径，不能自己复制自己。 */
    if !legacy.exists() || legacy == target {
        return Ok(());
    }

    std::fs::create_dir_all(base).map_err(|error| format!("建不了数据目录：{error}"))?;

    /* ---- 第一步：全部复制到 `.tmp`（正式名一个都不碰） ---- */
    let mut staged: Vec<&str> = Vec::new();
    for suffix in ["", "-wal"] {
        let from = legacy_base.join(format!("{DB_FILE}{suffix}"));
        if !from.exists() {
            continue;
        }
        let tmp = base.join(staged_name(suffix));
        if let Err(error) = std::fs::copy(&from, &tmp) {
            /* 失败的那一件本身也可能留下半截 `.tmp`，一并删（它不在 `staged` 里）。
             * 清理自身的错误用 `let _ =` 吞掉——现在要说的是**复制为什么失败**，
             * 一条「删不掉临时文件」的错误盖上去只会让人查错方向。 */
            for done in &staged {
                let _ = std::fs::remove_file(base.join(staged_name(done)));
            }
            let _ = std::fs::remove_file(&tmp);
            return Err(format!(
                "把旧数据库 {} 搬到 {} 失败，已中止启动以免覆盖原有数据；\
                 已清理本次不完整的复制，下次启动会重试：{error}",
                from.display(),
                tmp.display()
            ));
        }
        staged.push(suffix);
    }

    /* ---- 第二步：清掉目标侧残留的 WAL 两件（见第 6 条） ---- */
    for suffix in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(base.join(format!("{DB_FILE}{suffix}")));
    }

    /* ---- 第三步：逐个改名成正式名，**反序：wal → db** ----
     *
     * 改到一半失败（几乎只剩权限 / 目标被占这类可能）仍要回退：已经改成正式名的
     * 必须删掉，否则主库已就位、下次启动又早退。 */
    let mut renamed: Vec<&str> = Vec::new();
    for suffix in staged.iter().rev() {
        let tmp = base.join(staged_name(suffix));
        let to = base.join(format!("{DB_FILE}{suffix}"));
        if let Err(error) = std::fs::rename(&tmp, &to) {
            for done in &renamed {
                let _ = std::fs::remove_file(base.join(format!("{DB_FILE}{done}")));
            }
            /* 剩下的 `.tmp` 全删。已改名的那几件已经没有 `.tmp` 了，`remove_file`
             * 返回 NotFound 也无所谓——失败分支里不做区分，反正结果都是「不做」。 */
            for left in &staged {
                let _ = std::fs::remove_file(base.join(staged_name(left)));
            }
            return Err(format!(
                "把旧数据库 {} 搬到 {} 失败，已中止启动以免覆盖原有数据；\
                 已清理本次不完整的复制，下次启动会重试：{error}",
                legacy.display(),
                to.display()
            ));
        }
        renamed.push(*suffix);
    }

    /* ---- 第四步：旧库改名留底，让它不再是「合法的迁移源」 ----
     * 尽力而为：数据已经搬好了，改名失败只是少了一层保护，不该让启动失败。 */
    for suffix in ["", "-wal", "-shm"] {
        let from = legacy_base.join(format!("{DB_FILE}{suffix}"));
        if !from.exists() {
            continue;
        }
        let to = legacy_base.join(format!("{DB_FILE}{suffix}.migrated"));
        if let Err(error) = std::fs::rename(&from, &to) {
            eprintln!(
                "旧数据库 {} 改名留底失败（不影响本次启动）：{error}",
                from.display()
            );
        }
    }

    Ok(())
}

/* ======================================================================
 * 测试
 *
 * 全部是**文件语义**：造两个临时目录、看哪些名字出现、字节是不是那一份。
 * 没有 SQL、没有 `AppHandle`，所以「复制到一半失败」这种现场也能造出来
 * （往一个同名**目录**上 copy 必失败）。
 *
 * 目录名里的序号与 `store.rs` 的测试错开（那边用到 1–16），否则两个模块的测试
 * 并行跑时会撞在同一个 `%TEMP%` 目录上。
 * ==================================================================== */

#[cfg(test)]
mod tests {
    use super::*;

    /// 一次性目录，离开作用域就删。
    struct TempDir {
        path: std::path::PathBuf,
    }

    impl TempDir {
        fn new(seq: u32) -> Self {
            let path =
                std::env::temp_dir().join(format!("mh-toolbox-test-{}-{seq}", std::process::id()));
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).expect("建测试临时目录");
            Self { path }
        }

        fn base(&self) -> &std::path::Path {
            &self.path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    /// 收集目录里的文件名，用来断言「多了一个 / 少了一个」。
    fn names(dir: &std::path::Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .expect("读目录")
            .map(|entry| {
                entry
                    .expect("读目录项")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        names.sort();
        names
    }

    /// 主库 + `-wal` 两件都要落地、逐字节与源一致；`-shm` **不搬**；旧库改名留底。
    ///
    /// 只搬主库会丢掉还没 checkpoint 的那几笔，所以这里不是「多复制了一个文件」。
    /// `-shm` 反过来：搬它只是多一个必须同期的对象，它本来就会被 SQLite 重建。
    #[test]
    fn migrate_between_copies_main_and_wal_but_not_shm() {
        let legacy = TempDir::new(21);
        let base = TempDir::new(22);

        /* 三个不同内容：一旦串了文件名，字节断言会立刻发现。 */
        let sources: [(&str, &[u8]); 3] = [
            ("", b"main-db-bytes"),
            ("-wal", b"wal-bytes"),
            ("-shm", b"shm-bytes"),
        ];
        for (suffix, bytes) in sources {
            std::fs::write(legacy.base().join(format!("{DB_FILE}{suffix}")), bytes)
                .expect("写旧库文件");
        }

        migrate_between(legacy.base(), base.base()).expect("主库与 WAL 都该搬成功");

        for (suffix, bytes) in [sources[0], sources[1]] {
            let copied = std::fs::read(base.base().join(format!("{DB_FILE}{suffix}")))
                .unwrap_or_else(|error| panic!("目标里没有 {suffix}：{error}"));
            assert_eq!(copied, bytes.to_vec(), "{suffix} 的内容应与源逐字节相同");
        }

        /* 目标目录只有两件：主库 + WAL。既不该有 `-shm`，也不该有 `.tmp`。 */
        assert_eq!(
            names(base.base()),
            vec![DB_FILE.to_string(), format!("{DB_FILE}-wal")],
            "目标目录里应只有主库与 WAL"
        );

        /* 旧库不再是合法源：三条全部改名成 `.migrated`。 */
        assert_eq!(
            names(legacy.base()),
            vec![
                format!("{DB_FILE}-shm.migrated"),
                format!("{DB_FILE}-wal.migrated"),
                format!("{DB_FILE}.migrated"),
            ],
            "旧库三件都应改名留底，否则删库重来会被搬回迁移那天的旧账"
        );
        assert!(
            !legacy.base().join(DB_FILE).exists(),
            "旧主库原名必须消失，否则下次启动又会把它当成迁移源"
        );
    }

    /// 复制阶段失败必须回退：正式名下一个文件都不许留，`.tmp` 也不许留，源文件一律不动，
    /// 更不许把旧库改名（这一轮根本没迁移成功）。
    ///
    /// 制造失败的手法：把 `-wal` 的**源**做成一个目录——`std::fs::copy` 读目录必然失败。
    /// 这时 `mh-toolbox.db.<pid>.tmp` 已经是一个完整的临时文件，正好验证「本轮 staged
    /// 过的东西必须被清掉」这条。
    ///
    /// 说清一件事：真正的**写阶段**失败（ENOSPC / EIO 把 `.tmp` 写了一半）在测试里造不出来
    /// ——那要靠磁盘满或坏块。但 tmp+rename 的意义正在于此：半截文件只可能出现在 `.tmp`
    /// 名下，正式名要么不存在、要么完整，所以这条路径不需要用测试去证明。
    #[test]
    fn migrate_between_rolls_back_partial_copy() {
        let legacy = TempDir::new(23);
        let base = TempDir::new(24);

        std::fs::write(legacy.base().join(DB_FILE), b"main-db-bytes").expect("写旧主库");
        /* 源侧是个目录：复制它（或读它）一定失败。 */
        std::fs::create_dir_all(legacy.base().join(format!("{DB_FILE}-wal"))).expect("旧 WAL 位");

        let error = migrate_between(legacy.base(), base.base()).expect_err("复制目录必须失败");
        assert!(
            error.contains("已清理本次不完整的复制"),
            "文案要交代「已回退、可重试」，实际是：{error}"
        );

        /* 最强的一条断言：失败后目标目录必须是**空**的。既没有正式名（主库若留下，
         * 下次启动就会把它当成「已迁移」），也没有任何 `.tmp` 残留。 */
        let leftovers = names(base.base());
        assert!(
            leftovers.is_empty(),
            "失败后目标目录必须干净，实际留下：{leftovers:?}"
        );
        assert!(
            legacy.base().join(DB_FILE).exists(),
            "旧主库不许删：那是用户唯一的一份数据"
        );
        assert!(
            !legacy.base().join(format!("{DB_FILE}.migrated")).exists(),
            "迁移没成功就不许把旧库改名，否则下次启动再也找不到源"
        );
    }

    /// 新路径已经有库就不再搬。这一步挡的是「用旧库覆盖用户这两天新记的账」。
    #[test]
    fn migrate_between_never_overwrites_existing_target() {
        let legacy = TempDir::new(25);
        let base = TempDir::new(26);

        std::fs::write(legacy.base().join(DB_FILE), b"legacy").expect("写旧库");
        std::fs::write(base.base().join(DB_FILE), b"existing").expect("写新库");

        /* 目标已存在是**正常**情况（第二次启动就是这样），不该报错，也不该改名旧库
         * （用户还可能回退到旧版本）。 */
        migrate_between(legacy.base(), base.base()).expect("目标已存在应视为已完成");

        let kept = std::fs::read(base.base().join(DB_FILE)).expect("读新库");
        assert_eq!(kept, b"existing".to_vec(), "新路径已有的库不许被旧的覆盖");
        assert!(
            legacy.base().join(DB_FILE).exists(),
            "没搬就不许动旧库的名字"
        );
    }

    /// 目标里残留上一轮的 `-wal` / `-shm`（主库没赶上）时，重试必须能干净地落位。
    ///
    /// 这条模拟的正是「rename 反序」引入的中间态：正式 `-wal` 已改名成功、主库还叫
    /// `.tmp` 时就断电了。下次启动重来，目标位置于是有 `-wal` 而无主库
    /// ——`target.exists()` 为假，迁移会真的再跑一遍。
    ///
    /// 钉住两件事：① 残留文件不会挡住 rename（`MoveFileExW` 带 `MOVEFILE_REPLACE_EXISTING`
    /// / `rename(2)` 都覆盖已存在的目标）；② **残留的 `-shm` 必须消失**——它属于上一份
    /// 数据，留着被 SQLite 当成新主库的索引就是 `database disk image is malformed`。
    #[test]
    fn migrate_between_drops_leftover_wal_and_shm_from_interrupted_run() {
        let legacy = TempDir::new(27);
        let base = TempDir::new(28);

        std::fs::write(legacy.base().join(DB_FILE), b"legacy-db").expect("写旧主库");
        std::fs::write(legacy.base().join(format!("{DB_FILE}-wal")), b"legacy-wal")
            .expect("写旧 WAL");

        /* 上一轮只改成了 `-wal` / `-shm` 的名，主库没赶上——所以这里**不放**主库。 */
        std::fs::write(base.base().join(format!("{DB_FILE}-wal")), b"stale-wal")
            .expect("写残留 WAL");
        std::fs::write(base.base().join(format!("{DB_FILE}-shm")), b"stale-shm")
            .expect("写残留 SHM");

        migrate_between(legacy.base(), base.base()).expect("残留的 WAL / SHM 不该挡住重试");

        /* 主库最后就位，它是「迁移完成」的标记。 */
        assert_eq!(
            std::fs::read(base.base().join(DB_FILE)).expect("主库该出现"),
            b"legacy-db".to_vec(),
            "主库内容应是 legacy 那份"
        );
        assert_eq!(
            std::fs::read(base.base().join(format!("{DB_FILE}-wal"))).expect("读 WAL"),
            b"legacy-wal".to_vec(),
            "残留的 WAL 必须被 legacy 那份覆盖，不能留着 stale-wal"
        );
        assert!(
            !base.base().join(format!("{DB_FILE}-shm")).exists(),
            "残留的 SHM 必须删掉：它是上一份数据的索引，配新主库会让 SQLite 认成损坏"
        );

        /* 成功路径不该留下 `.tmp`。 */
        let leftovers: Vec<String> = names(base.base())
            .into_iter()
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "不该留 .tmp，实际：{leftovers:?}");
    }

    /// 旧库已经没有 `-wal`（上一轮崩在 rename 之间、WAL 已被搬走）而目标还有残留时，
    /// 残留必须被删掉而不是留给新主库。这是上面那条的「无 `-wal` 可覆盖」变体，
    /// 也正是 `database disk image is malformed` 的完整来路。
    #[test]
    fn migrate_between_removes_stale_wal_even_when_source_has_none() {
        let legacy = TempDir::new(29);
        let base = TempDir::new(30);

        std::fs::write(legacy.base().join(DB_FILE), b"legacy-db").expect("写旧主库");
        std::fs::write(base.base().join(format!("{DB_FILE}-wal")), b"stale-wal")
            .expect("写残留 WAL");

        migrate_between(legacy.base(), base.base()).expect("迁移");

        assert!(
            !base.base().join(format!("{DB_FILE}-wal")).exists(),
            "这一轮没有 WAL 可搬，残留的必须删掉——否则它会被 apply 到新主库上"
        );
        assert_eq!(
            names(base.base()),
            vec![DB_FILE.to_string()],
            "目标目录只该有主库"
        );
    }
}
