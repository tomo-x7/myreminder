# 調査メモ: スケジューリング・見積もり・通知タイミング

## 検証メモ(2026-10-11)

このファイルの引用は、2026-10-11 に Crossref API・出版社ページ・arXiv・教科書(Lenstra & Shmoys『Elements of Scheduling』arXiv:2001.06005)・Buehler 1994 の本文 PDF で照合した。

- 書誌(著者・年・掲載誌・巻号頁)は Crossref で一致を確認し、DOI を併記した。一部の DOI は出版社が bot を弾く(403)ため、リンク先の表示自体は未確認。Crossref 登録は確認済み。
- 主張の内容は、本文で確認できたもの(Buehler の数値、Horn・Jackson・Moore–Hodgson・Lenstra らの結果)と、書誌・要旨・二次資料までしか確認できていないものがある。後者は該当箇所に「要旨まで」「二次資料」と書いた。
- 書籍(Conway ほか 1967、Goldratt 1997、Baker & Trietsch、BDA3)は書誌の実在と節の題名まで。ページ単位の内容は未確認。
- 訂正した箇所: Jackson 1955 の掲載先、Fischer の年(2010 → 2011)、Jørgensen 2004 の引用(主張を支持しない → 差し替え)、Williams 1992 の位置づけ、需要上限テストの出典(Liu & Layland は不適切)、BDA3 の節、Pielot 2014 の位置づけ。

## 締切スケジューリング(1台の機械のモデル)

- **EDF / ジャクソンの規則**(Jackson 1955, UCLA Management Sciences Research Project, Research Report 43。学術誌論文ではない。NTIS の技術報告: https://ntrl.ntis.gov/NTRL/dashboard/searchResults/titleDetail/AD152722.xhtml)
  - すべてのタスクに今すぐ着手できるなら、締切順(EDD)に並べると最大の遅れ(Lmax)が最小になる(1||Lmax)
  - リリース時刻があっても、分割できるなら、着手可能なタスクのうち締切が最も早いものを常に実行する EDF が 1|pmtn, r_j|Lmax の最適解(Horn 1974, *Naval Research Logistics Quarterly* 21(1), 177–185, doi:10.1002/nav.3800210113。Lenstra & Shmoys の教科書 §3.2 の注にも「Horn が preemptive EDD で解けることを指摘」とある)
- **需要上限テスト**(processor demand criterion。定期・散発タスクへの定式化は Baruah, Mok & Rosier 1990, *Proc. 11th IEEE RTSS*, 182–190, doi:10.1109/REAL.1990.128746 と Baruah, Rosier & Howell 1990, *Real-Time Systems* 2(4), 301–324, doi:10.1007/BF01995675)
  - Liu & Layland 1973(*JACM* 20(1), 46–61, doi:10.1145/321738.321743)は、締切=周期の周期タスクで EDF が使用率 ≤ 1 まで実行可能という結果で、ここで使う形のテストではない。引用から外す
  - 今のモデル(全タスクが着手可能な1回きりの仕事)では、下の式は Jackson/Horn の結果から直接導ける
  - 分割できる場合、すべての締切 d について `Σ{d_j ≤ d} 残作業_j ≤ capacity(now, d)` なら実行可能
  - capacity を「時間割・睡眠を除いた、使える分数の累積」にすれば、そのまま使える
- **ALAP = EDF を逆向きに回したもの**(Earliest Deadline Last, EDL; Chetto & Chetto 1989, "Some Results of the Earliest Deadline Scheduling Algorithm", *IEEE TSE* 15(10), 1261–1269, doi:10.1109/TSE.1989.559777。EDL が同論文由来であることは Spuri & Buttazzo 1994 などの二次資料で確認。論文本文は未読)
  - 各タスクの着手デッドラインと、締切ごとの余裕が出る
  - 注意: ALAP はすべてを締切側に寄せる。見積もりが外れると余裕がゼロになるので、**エスカレーションは P80 の見積もりで計算した着手デッドラインで判定する**
- **LLF(余裕が最小のものを優先)**
  - 理論上は最適だが、余裕が同じタスク同士で頻繁に入れ替わる
  - 人間に「これをやれ」と出す用途には向かない
- **Moore–Hodgson**(Moore 1968, *Management Science* 15(1), 102–109, doi:10.1287/mnsc.15.1.102。簡略版は Hodgson によるもので Moore の論文が帰属を述べている。Baker & Trietsch『Principles of Sequencing and Scheduling』Wiley の Alg. 2.1 は、著者サイトの講義ノート(第2版)で確認。初版の番号は未確認)
  - 遅れるタスクの「数」を最小にする
  - 手順: 締切順に並べ、遅れが出たら、それまでで一番長いタスクを落とす
  - **需要上限テストが失敗したとき、何を捨てるかの提案に使う**
  - 重みつき(1||Σw_jU_j)は NP 困難(ナップサックからの帰着は Karp 1972)だが、O(nW) の擬多項式 DP がある(W=Σw_j。Lenstra & Shmoys §5.2。重みが整数のとき)。n ≤ 30 なら十分、というのはこのアプリでの見込み
  - Moore–Hodgson 自体は重みなし、または処理時間と重みが逆順(p_i < p_j ⇒ w_i ≥ w_j)の場合に最適
- **拡張したときに何が成り立つか**:
  - 自由に分割できる、1日の作業上限がある: すべて成り立つ(上限は capacity を減らすだけ)
  - リリース時刻あり(授業の後に公開される課題など)+分割できる: EDF は最適のまま
  - リリース時刻あり+分割できない(1|r_j|Lmax): NP 困難。強い意味でも NP 困難(Lenstra, Rinnooy Kan & Brucker 1977, "Complexity of machine scheduling problems", *Annals of Discrete Mathematics* 1, 343–362, doi:10.1016/S0167-5060(08)70743-X。NP 完全性の証明が同論文由来であることは Lenstra & Shmoys の注で確認、強 NP 困難は同書 Thm 3.11)。わざと空ける必要が出ることがある
  - 最小の連続ブロックがある(まとまった時間が要る): 需要上限テストは必要条件だが十分ではない。EDF はヒューリスティックになる。n ≤ 30 なら EDF+修正パスで十分

## 製造業のディスパッチルール

- Critical Ratio = (締切 − 現在) / 残作業。ほかに最小スラック優先など
  - 出典: Panwalkar & Iskander 1977, "A Survey of Scheduling Rules", *Operations Research* 25(1), 45–61, doi:10.1287/opre.25.1.45(ディスパッチルールの概観)。Conway, Maxwell & Miller『Theory of Scheduling』Addison-Wesley 1967(2003 年 Dover 復刻)は実在するが、CR の記述箇所は未確認
  - CR の実験的評価: Berry & Rao 1975, *Management Science* 22(2), 192–201(要旨レベルの確認)
- 利点: 作業量を考慮し、リスクとして直感的に読める
- 欠点: 最適ではない。時間とともに順位が入れ替わる。capacity(睡眠・バイト)を考慮しない
- 結論: 並び順は EDF にする。CR やスラックは**表示とリスクの指標**として、壁時計ではなく「使える時間」で計算して使う

## CCPM(クリティカルチェーン)とフィーバーチャート

- 出典: Goldratt『Critical Chain』North River Press, 1997(小説形式。学生症候群の例とパーキンソンの法則への言及は二次資料で確認)
- 主張:
  - 学生症候群(ギリギリまで始めない)とパーキンソンの法則(仕事は与えられた時間いっぱいまで膨らむ)のせいで、個々の見積もりに積んだ余裕が無駄になる
  - だから余裕は個々のタスクではなく、まとめてバッファとして持つ
- フィーバーチャート: 横軸=チェーンの進捗%、縦軸=バッファの消費%。緑・黄・赤の帯で表す(ベンダー文書で確認: https://success.sciforma.com/en/2026.07/topics/user/critical-chain-monitoring)
  - 元メモにあった PMI のページ(https://www.pmi.org/learning/library/critical-chain-project-management-investigation-6380)は bot に 403 を返し、内容を確認できなかった(Wayback には 2022〜2023 のスナップショットあり)。出典としては**未確認**
- エビデンスは**弱い**:
  - 事例研究とベンダーの主張が中心
  - 批判的なレビューがある(Herroelen & Leus 2001, "On the merits and pitfalls of critical chain scheduling", *J Operations Management* 19(5), 559–577, doi:10.1016/S0272-6963(01)00054-7 / Raz, Barnes & Dvir 2003, "A Critical Look at Critical Chain Project Management", *PMJ* 34(4), 24–32, doi:10.1177/875697280303400404。書誌と題名のみ確認、本文は未読)
  - 帯の閾値は経験則
- このアプリでの使い方: 見た目の指標として借りるだけ
  - タスクごと: バッファ消費率 = (P80 着手デッドラインを過ぎてからの時間) / バッファ
  - 全体: 「山場」(余裕が最小になる締切)の余裕を見る

## 見積もり(計画錯誤への対策)

- Buehler, Griffin & Ross 1994(*JPSP* 67(3), 366–381, doi:10.1037/0022-3514.67.3.366、本文 PDF で確認): 卒論の最良見積もりは平均 33.9日、実際は 55.5日。見積もり期間内に終わったのは 29.7%(Study 1、完了した33人)
- 参照クラス予測(Flyvbjerg 2006, "From Nobel Prize to Project Management: Getting Risks Right", *PMJ* 37(3), 5–15, doi:10.1177/875697280603700302): 自分の計画ではなく、過去の実績から予測する
- **モデル**: 比率 r = 実績/見積もり は正の値で右に歪む → `y = ln r` を正規分布とみなす
  - 元メモは Jørgensen 2004 (*IEEE TSE* 30(4), doi:10.1109/TSE.2004.1274041) を「誤差が乗法的であることの支持」としていたが、同論文は見積もり区間の聞き方(min–max か超過確率か)の研究で、この主張は支持しない。削除
  - 代わりに、工数がおおむね対数正規とみなせるとする議論: Jørgensen, Halkjelsvik & Liestøl 2022, *Information and Software Technology* 143, 106784, doi:10.1016/j.infsof.2021.106784(要旨で確認)。ただし「実績/見積もり比の対数が正規」と直接検証した研究は見つけていない。**仮定として置き、自分のデータで確認する**
- **ベイズ更新**: y に正規–逆χ² の事前分布(Gelman et al., *Bayesian Data Analysis* 3rd ed., CRC Press 2013, doi:10.1201/b16018, §3.3 "Normal data with a conjugate prior distribution"、目次で確認)
  - 事前分布: μ0 ≈ ln 1.3(楽観を仮定)、σ0 ≈ 0.5、擬似観測 2〜4件
  - 計画に使うのは P80 = exp(μ + 0.84σ)。n が小さいうちは Student-t の予測分布を使う
- **カテゴリごとの縮小推定**: `μ_cat = (n·ȳ_cat + k·μ_global)/(n + k)`、k ≈ 5(BDA3 5章 階層モデル、目次で確認 / Efron & Morris 1975, "Data Analysis Using Stein's Estimator and Its Generalizations", *JASA* 70(350), 311–319, doi:10.1080/01621459.1975.10479864)。σ も同様。さらに指数重み(半減期 15〜20件)をかける
- 計画に使う見積もりの下限は、見積もり×1.0
- PERT の三点見積もりは、入力の手間に見合わない → 採用しない
- 注意:
  - 短いタスクの比率はノイズが大きい → サイズでも区分する
  - タイマーの止め忘れでデータが歪む

## 通知のタイミング

- 割り込みやすさの研究:
  - Fischer, Greenhalgh & Benford **2011**(元メモの 2010 は誤り), *MobileHCI '11*, 181–190, doi:10.1145/2037373.2037402: 通話・SMS の直後に届いた通知は、ランダムな時刻より速く反応された(要旨・二次資料で確認)。主観評価はもっと複雑で、単純に「邪魔に感じにくい」とは言えない
  - Okoshi et al. 2015, Attelia, *IEEE PerCom 2015*, 96–104, doi:10.1109/PERCOM.2015.7146515: 活動の切れ目に通知すると、ランダムより認知負荷が下がる(二次資料では 46% 減。一次の数値は未確認)。同年の UbiComp 論文(doi:10.1145/2750858.2807517)もある
  - Pielot, Church & de Oliveira 2014, *MobileHCI '14*, 233–242, doi:10.1145/2628363.2628364: 切れ目の研究ではない。通知は多くの場合数分以内に確認される、という観察研究(15人・1週間)
  - Mehrotra et al. 2016, "My Phone and Me", *CHI '16*, 1021–1032, doi:10.1145/2858036.2858566: 反応時間と邪魔さは、通知の提示方法・送り手との関係・作業の種類に左右される(要旨で確認)
- JITAI(Nahum-Shani et al. 2018, *Annals of Behavioral Medicine* 52(6), 446–462, doi:10.1007/s12160-016-9830-8)、マイクロランダム化試験(Klasnja et al. 2015, *Health Psychology* 34(Suppl), 1220–1228, doi:10.1037/hea0000305)、Thompson sampling による個人への適応(arXiv:2008.01571 = Tomkins, Liao, Klasnja & Murphy, "IntelligentPooling: practical Thompson sampling for mHealth", *Machine Learning* 110(9), 2021, doi:10.1007/s10994-021-05995-8。arXiv の要旨で確認)
  - 多人数のデータをまとめて学習する前提なので、1人だと重すぎる(IntelligentPooling は他のユーザのデータで個人の方策を学習する手法、という要旨と整合)
- 安い版(手間の小さい順):
  1. 予定に連動した固定の窓: 空き枠が始まる直前に送る。睡眠中は送らない。授業の直前・直後は避ける
  2. 通知ごとに「30分以内に作業を始めたか」を記録する
  3. データが4週間分たまったら、4〜6個の時間帯ごとに Beta–Bernoulli の Thompson sampling(減衰つき)
- 「開いた」は「作業した」ではない → 報酬は「30分以内に作業を開始した」にする
- 頻度と口調はリスクに合わせる(バンディットの出力には任せない)。1日の上限を設ける

## 「今やると生み出せる余裕」

### 流体モデルでの分析(エージェントが妥当性を確認済み)

- 締切 d_i での余裕を `s_i = capacity(now, d_i) − Σ{d_j ≤ d_i} 残作業_j` とする
- 休む代わりにタスク T を c 分やると、d_i ≥ d_T のすべての s_i が c 増える
  - → 締切が早いタスクほど有利になる(EDF と同じような順位)
  - 山場の締切より前が締切のタスク同士は、「山場の余裕」という指標では同点になる
- 差がつくのは、流体モデルでは表せない効果があるとき:
  - まとまった時間が要るタスク: 将来の空き時間は細切れになるので、大きな空きがある今やる価値が高い
  - リリース時刻
  - 1日の作業上限
  - 見積もりの不確かさ: 早く始めると不確かさが減るという情報価値がある。大きくて不確かで未着手のタスクほど高い
- 比較の基準は「休む」場合。どちらでも時間は過ぎるので、capacity が減るのは同じ

### 反実仮想の再計画(採用候補)

- 候補ごとに「次の空き時間を T に使った場合」を離散プランナーで計算し直し、辞書式で比べる:
  1. 間に合わないタスクの数(Moore–Hodgson 系で数える)
  2. 山場の余裕
  3. 正規化したストレス `Σ exp(−s_i/τ)`。s_i は1日分の capacity で割る
- 離散プランナー上での正確な限界価値なので妥当
- 計算は軽い: 候補 30 × O(n log n)
- 注意: 開くたびに推薦が入れ替わらないよう、同点は「締切が早い → 残作業が多い → ID」で決める

### 閉形式の近似(予備)

- ストレス `Σ exp(−s_i/τ)` を c で微分すると、`score(T) = Σ{i: d_i ≥ d_T} exp(−s_i/τ)`。O(n) で計算できる

### 関連する概念

- CPM の total float / free float
- criticality index(各タスクがクリティカルパス上にある確率。Van Slyke 1963, *Operations Research* 11(5), 839–860, doi:10.1287/opre.11.5.839 に遡るとされる。Williams 1992, "Criticality in stochastic networks", *JORS* 43(4), 353–357, doi:10.1057/jors.1992.50 は、この指標の限界を論じて cruciality を提案した論文。元メモは Williams を criticality index の出典としていたが誤り。要旨レベルの確認)
- slack stealing(Lehoczky & Ramos-Thuel 1992, "An optimal algorithm for scheduling soft-aperiodic tasks in fixed-priority preemptive systems", *Proc. IEEE RTSS*, 110–123, doi:10.1109/REAL.1992.242671): 締切を破らずに、今どれだけ別の作業を割り込ませられるか。原論文は固定優先度スケジューリング向けで、EDF 向けの対応物は上の EDL(Chetto & Chetto)
- CCPM の buffer penetration
