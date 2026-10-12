# 仕様: 見積もり・キャパ・スケジューラ・余裕リスト(`worker/src/planner/`)

issue #12 で確定した仕様。実装は #13(見積もり・キャパの学習)、#14(スケジューラ)、#15(余裕リスト)で行う。背景は [plan.md](../plan.md) §3.3〜§3.6 と [research/algorithms.md](../research/algorithms.md)。

## 共通の約束

- ファイルの分担: #13 = `estimate.ts`・`usual-capacity.ts` / #14 = `capacity.ts`・`schedule.ts` / #15 = `slack-gain.ts`。共通の型は `types.ts`

- **純粋関数のみ**: DB・現在時刻・乱数に触れない。`now` などはすべて引数で渡す
- 時刻は epoch ミリ秒(`Ms`)、長さは分(`Minutes`)
- 区間は半開区間 `[start, end)`
- 日付の境界は JST(+09:00 固定)
- **活動日**: 起床時刻から次の起床時刻までを1日とみなす(睡眠が 1:00–8:00 なら、0:30 は前の日に属する)。キャパは活動日ごとに数える
- 出力の並びは決定的にする(同点は ID で決める)。開くたびに結果が変わらないように
- テスト(vitest)は各ファイルの隣に `*.test.ts` で置く。下の「テストケース」はすべて実装する
- 目標: タスク30件・14日分で、余裕リストの計算まで含めて Worker の CPU 10ms に十分収まる

```ts
type Ms = number;
type Minutes = number;
type Interval = { start: Ms; end: Ms };
type Category = "report" | "exercise" | "quiz" | "presentation" | "other";
```

## 1. 見積もり(`estimate.ts`、#13 → #36 で課題ごとに)

#13 では「種類 × サイズ」ごとの一律の倍率だった。#36 で、同じ繰り返し・同じ科目の実績を優先して使い、見積もりの数字をどれだけ信じるかも学習するようにした。

### 入力

```ts
type Sample = {
	category: Category;
	courseId: string | null;
	seriesId: string | null;
	estimateMin: Minutes; // 登録時の見積もり(> 0)
	actualMin: Minutes; // 確定済みの作業記録の合計(> 0)
	completedAt: Ms;
};

/** 予測したいタスクの属性 */
type EstimateKey = { category: Category; courseId: string | null; seriesId: string | null };

type Prior = { mu0: number; sigma0: number; kappa0: number; nu0: number };
const DEFAULT_PRIOR: Prior = { mu0: Math.log(1.3), sigma0: 0.5, kappa0: 3, nu0: 3 };

type EstimateOptions = {
	halfLife: number; // 既定 15(新しい順に数えて15件で重みが半分)
	shrinkK: number; // 既定 5(下の段階の推定を上の段階に寄せる強さ)
	clip: [number, number]; // 既定 [0.2, 5](比率の外れ値を切る。止め忘れ対策。倍率もこの範囲に収める)
	slopePrior: number; // 既定 2·(ln 2)² ≈ 0.96(傾きを 1 に寄せる強さ。「見積もりが2倍違うサンプル2件」ぶん)
};
```

### 段階(似ている順)

| 段階 | キー | 対象のサンプル |
|---|---|---|
| `global` | なし | すべて |
| `category` | 種類 | 同じ種類 |
| `course` | 種類 × 科目 | 同じ種類で同じ科目(科目なしのタスクはこの段階を飛ばす) |
| `series` | 繰り返し | 同じシリーズ(繰り返しでないタスクはこの段階を飛ばす) |

上から順に、1つ上の段階の事後分布を事前分布にして更新する。サンプルが0件の段階は飛ばす(上の段階の値をそのまま使う)。サンプルは複数の段階に重ねて数える(入れ子の縮小推定の近似)。

### 処理

1. 各サンプル: `x = ln(見積もり)`、`r = ln(clamp(実績/見積もり, clip))`
2. 重み: `completedAt` の新しい順に並べ、i 番目(0 始まり)の重みを `w_i = 0.5^(i / halfLife)` とする(すべての段階で同じ重み)
3. **傾き b**(見積もりの数字をどれだけ信じるか): `ln 実績 ≈ 切片 + b · ln 見積もり`
   - b = 1: 実績は見積もりに比例する(一律の倍率。#13 と同じ)
   - b = 0: 実績は見積もりの数字によらない(その科目の課題はいつも同じくらい)
   - 求め方: `course` のキー(種類 × 科目。科目なしは「科目なし」で1つ)でまとめ、まとまりの中の重みつき平均からの差 `dx = x − x̄`、`dy = (x + r) − ȳ` で、`b = (Σw·dx·dy + slopePrior·1) / (Σw·dx² + slopePrior)`。[0, 1] に収める
   - まとまりの中で見積もりが全部同じ(繰り返しの回など)なら、そのまとまりは b に効かない。データが少ないうちは b ≈ 1
4. **基準の見積もり** `c` = 全サンプルの x の重みつき平均(サンプルが0件なら `ln 60`)
5. 各サンプルの値 `z = r − (b − 1)·(x − c)`(基準の見積もり c のときの ln 比率に直したもの。b = 1 なら z = r)
6. 段階ごとに z の重みつきの正規–逆χ² 更新(BDA3 §3.3 の式で、n の代わりに Σw を使う)
   - `n = Σw`、`z̄ = Σw·z / n`、`S = Σw·(z − z̄)²`
   - `κn = κ0 + n`、`μn = (κ0·μ0 + n·z̄) / κn`、`νn = ν0 + n`
   - `νn·σn² = ν0·σ0² + S + (κ0·n / κn)·(z̄ − μ0)²`
   - `global` の事前分布は `DEFAULT_PRIOR`。下の段階の事前分布は、上の段階の事後分布の `(μn, σn)` に `κ0 = ν0 = shrinkK`
7. **予測**: 一番下の段階の事後分布で、Student-t(自由度 νn、位置 μn、尺度 `σn·√(1 + 1/κn)`)
   - 倍率(分位 q) = `exp(μn + t_νn(q)·尺度 + (b − 1)·(ln 見積もり − c))`。clip の範囲に収める
   - **下限 ×1.0 はやめた**(#36)。実績が見積もりより短い傾向がはっきりしていれば、見積もりより短く計画する。P80 を使うので、それでも保守的

### 例

科目 A・演習で「見積もり 1h → 実績 30m」が3件。次の課題の見積もりが 30m:

- 3件とも見積もりが同じなので b はデータから決まらず ≈ 1。予測の中心は 18m(科目 A の比率 0.5 だけなら 15m だが、3件では上の段階の 1.3 倍にまだ引き戻される)、P80 は 28m
- 科目 A で見積もりを変えても実績がほとんど変わらないことがわかってくると b が下がり、予測は「いつもの 30m」に寄る

### 出力

```ts
function fitEstimateModel(samples: Sample[], prior?: Prior, opts?: Partial<EstimateOptions>): EstimateModel;

/** 計画に使う倍率(P80 なら q = 0.8)。clip の範囲 */
function planningMultiplier(model: EstimateModel, key: EstimateKey, estimateMin: Minutes, q?: number): number;

/** 一番下の段階の予測分布の尺度(ln 比率の単位)。余裕リストの「見積もりが不確か」に使う */
function uncertainty(model: EstimateModel, key: EstimateKey): number;

/** 予測に使った一番下の段階と、その段階のサンプル数。サンプルが0件なら { level: "prior", count: 0 } */
function estimateBasis(model: EstimateModel, key: EstimateKey): { level: "prior" | "global" | "category" | "course" | "series"; count: number };

/** 入力欄に出す過去の実績: series → course → category の順で、サンプルのある一番下の段階の新しい順 limit 件 */
function referenceSamples<T extends Sample>(samples: T[], key: EstimateKey, limit: number): { level: "series" | "course" | "category" | null; items: T[] };
```

- 残りの P80 = `残りの名目 × planningMultiplier`
  - 残りの名目 = `見積もり × (1 − 直近の進捗)`
  - 進捗は作業中を終えたときの 0 / 0.25 / 0.5 / 0.75 / 1
- 学習に使うのは、`submitted` か `done` になり、見積もりがあり、確認待ちの作業記録を含まないタスクだけ(どのタスクを渡すかは呼び出し側が選ぶ)

### 入力欄の実績(参照クラス)

`GET /api/estimates/reference?category=&courseId=&seriesId=`(courseId・seriesId は省略可)→ `{ level: "series" | "course" | "category" | null, items: [{ taskId, title, estimateMin, actualMin, completedAt }] }`。`referenceSamples(…, 3)` の結果。学習と同じサンプルを使う。

画面は見積もりの欄の下に `実績 1h10m・50m・45m(情報倫理・レポート)` と出す。段階の名前は series = `同じ繰り返し`、course = `科目名・種類`、category = `種類`。サンプルがなければ何も出さない。

### テストケース

- サンプルが0件 → 事前分布だけで決まる(P80 ≈ 1.3 × exp(t₃(0.8) × 0.5 × √(4/3)) ≈ 2.29。キーによらない)
- 比率がすべて 1.0 のサンプルが多数 → 倍率は 1.0 付近
- 比率がすべて 0.5 のサンプルが多数 → 倍率は 1.0 を下回る(下限 ×1.0 はない)。clip の下限 0.2 は下回らない
- 比率 20 のサンプル → 5 に切られる
- サンプルがない段階 → 上の段階の値になる
- 新しいサンプルほど効く: 古い比率 2.0 ×10件+新しい比率 1.0 ×10件 → 中心は 1.0 寄り
- 段階のサンプルが少ないうちは上に寄り、増えるにつれてその段階の値に近づく(series・course それぞれ)
- 科目 A の比率 0.5 と科目 B の比率 2.0 → 同じ種類でも科目で倍率が分かれる
- 同じシリーズの実績が3件あれば、同じ科目の別の課題より、そのシリーズの値に近い
- 傾き: 実績が見積もりに比例するデータ → b ≈ 1。見積もりによらず実績が一定のデータ(まとまりの中で見積もりが違う)→ b は 0 に近づく。[0, 1] に収まる
- 上の「例」: 見積もり 1h → 実績 30m ×3件(同じ科目)のあと、見積もり 30m の予測の中心(q = 0.5)は 30m より短い
- `estimateBasis` は一番下のサンプルのある段階と件数を返す
- `referenceSamples` は series → course → category の順に探し、新しい順に limit 件
- 入力の並びに依らない(completedAt で新旧を決める)。不正なサンプル(0以下・NaN)は無視する。q を上げると倍率が増える

### 実装で決めた細部(#13)

- サンプルがない段階は、上の段階の事後分布をそのまま使う(n = 0 で更新すると自由度と尺度が変わってしまうため)
- 見積もりか実績が有限の正の数でないサンプルは捨てる
- t 分布の分位点は近似式ではなく、正則化不完全ベータ関数を二分法で解いて求める(非整数の自由度も扱える)
- #36: completedAt が有限でないサンプルも捨てる。同時刻のサンプルは種類・科目・シリーズ・見積もり・実績の順で並べ、重みの順位が入力の並びに依らないようにする
- #36 でサイズ(s / m / l)の区分はやめた。見積もりの長さによる違いは傾き b で連続的に扱う

## 2. キャパ(#13 と #14)

### 2.1 普段のキャパの学習(`usual-capacity.ts`、#13)

```ts
type DailyWork = { day: string /* 活動日 YYYY-MM-DD(JST) */; minutes: Minutes; holiday: boolean };
type UsualCapacity = { weekday: Minutes; holiday: Minutes };

function learnUsualCapacity(
	days: DailyWork[],
	opts?: { windowDays?: number /* 28 */; q?: number /* 0.75 */; minWorked?: Minutes /* 30 */; m?: number /* 3 */; defaults?: UsualCapacity /* {180, 300} */; floor?: Minutes /* 60 */ },
): UsualCapacity;
```

- 直近 `windowDays` 日のうち、`minutes >= minWorked` の日(作業した日)だけを使う
- 平日と休日を別々に扱い、分位点 `q` を取る
- データが少ないときは初期値に寄せる: `cap = (n·Q + m·default) / (n + m)`(n はその種別の作業した日数)
- `floor` を下回らない
- 休日 = 土日(祝日は扱わない。必要になったら呼び出し側で `holiday` を立てる)
- 実装で決めた細部(#13):
  - 期間は、入力の最新の `day` から遡って `windowDays` 日。入力にない日も期間には数える
  - `minutes >= minWorked` を作業した日とする
  - 分位点は線形補間(type 7)
  - 作業した日がなければ初期値を返す。floor は寄せた後の値にも初期値にもかける
  - 分単位に丸めない

### 2.2 使える時間(`capacity.ts`、#14)

```ts
type SleepWindow = { startMin: number; endMin: number }; // JST の0時からの分。日をまたいでよい(例: 60〜480)

type CapacityInput = {
	now: Ms;
	horizonDays: number; // 14
	busy: Interval[]; // 時間割(展開済み)・予定
	sleep: SleepWindow;
	usual: UsualCapacity;
	workedToday: Minutes; // 今の活動日にすでに作業した分(作業記録の合計)
};

type Capacity = {
	free: Interval[]; // 本気のキャパ: 起きていて予定のない時間(now 以降)
	days: { start: Ms; end: Ms; holiday: boolean; usualCap: Minutes }[]; // 活動日の一覧。今日の usualCap は max(0, cap − workedToday)
};

function buildCapacity(input: CapacityInput): Capacity;
/** [now, t) で使える分数。mode = "usual" なら活動日ごとに min(usualCap, その日の free ∩ [now, t)) を足す */
function capacityUntil(cap: Capacity, t: Ms, mode: "usual" | "hard"): Minutes;
```

- 睡眠時間帯はどちらのキャパにも含めない(徹夜を構造的に禁止する)
- 普段のキャパの「活動日のどの時間を使うか」は位置に依存させない。`capacityUntil` は上の min の式で数える。具体的な配置は §3 の ALAP が決める

### テストケース

- 睡眠時間帯が0時をまたぐ / またがない
- 予定と睡眠が重なる
- `workedToday` が今日のキャパを超えても0未満にならない
- 学習: 作業しなかった日を無視する / 平日と休日を分ける / 作業した日が2日だけなら初期値に寄る / floor
- `capacityUntil` は t について単調非減少で、`usual <= hard` が常に成り立つ

## 3. スケジューラ(`schedule.ts`、#14)

### 入力

```ts
type PlanTask = {
	id: string;
	dueAt: Ms;
	releaseAt?: Ms; // これより前は着手できない
	remainingP80: Minutes; // 0 のタスクは呼び出し側で除く
	minBlock: Minutes; // 既定 30
	plannedStartAt?: Ms; // 本人が決めた着手時刻(実装意図)
	uncertain?: boolean; // 区分の不確かさが大きく、まだ作業記録がない(余裕リストの理由付け用)
};

type PlanInput = {
	now: Ms;
	tasks: PlanTask[];
	capacity: Capacity;
	marginRatio: number; // おすすめ着手時刻のマージン。既定 0.5(残りの P80 の半分、最低30分)
};
```

### 処理

1. **期限切れ**(`dueAt <= now`)は計画から外し、`overdue` として返す
2. **締切ごとの余裕**(需要上限テスト): タスクを締切順に並べ、締切ごとに次を計算する
   - `s_i(mode) = capacityUntil(d_i, mode) − Σ{d_j ≤ d_i} remainingP80_j`
   - mode は `usual` と `hard` の両方
3. **タスクごとの余裕**: `slack_T(mode) = min{i: d_i ≥ d_T} s_i(mode)`
   - EDL では、締切が早いタスクは T より前に置かれる。だから T の着手デッドラインの余裕は、T 以降のすべての締切の余裕の最小になる
4. **山場** = `s_i(usual)` が最小の締切。タスクがなければ `null`
5. **配置**(ALAP / EDL):
   - 締切が遅い順にタスクを取り、締切(と後ろに置いたタスクの開始)から逆向きに使える時間を詰める
   - 普段のモードでは、活動日ごとの usualCap を超えて置かない
   - 長さが `minBlock` 未満の空き(タスクの残りが minBlock 未満なら、その残りの長さ未満の空き)は使わない
   - `releaseAt` より前には置かない
   - 置ききれなければ、そのモードでの `latestStart = null`
   - **需要上限テストは通るのに配置で置ききれない**場合(minBlock や releaseAt が原因)は、`placementFailed` を立てる
6. **着手デッドライン**: 置いたブロックのうち最初の開始時刻。usual と hard の両方を出す
7. **おすすめ着手時刻**: `latestStart(usual)` から、普段のキャパで `max(30, marginRatio × remainingP80)` 分ぶん遡った時刻
   - 遡れない場合は `now`
   - 本人の `plannedStartAt` があり、`latestStart(usual)` 以前なら、通知にはそちらを使う(この関数は両方返す)
8. **リスクレベル**(上から順に判定し、最初に当てはまったもの):

| リスク | 条件 |
|---|---|
| `critical` | `slack(hard) < 0`、または `latestStart(hard) == null`、または `dueAt − now <= 3h` |
| `danger` | `slack(usual) < 0`(本気が必要)、または `latestStart(usual) == null`、または `latestStart(usual) − now <= 24h` |
| `watch` | `slack(usual) < 2 × remainingP80` |
| `relaxed` | それ以外 |

- `dueAt − now <= 3h` は、未提出かどうかに関係なく critical にする。提出済みのタスクは、呼び出し側で計画に渡さない

9. **捨てる候補**(Moore–Hodgson): hard のキャパで、どこかの `s_i(hard) < 0` のときだけ計算する
   - 締切順にタスクを足していく
   - 累積の作業が `capacityUntil(d_k, "hard")` を超えたら、それまでで一番 remainingP80 が大きいタスクを外し、候補に入れる
   - 同点は締切が遅い方 → ID の順で外す

### 出力

```ts
type Risk = "relaxed" | "watch" | "danger" | "critical";

type PlanOutput = {
	tasks: {
		id: string;
		slackUsual: Minutes;
		slackHard: Minutes;
		latestStartUsual: Ms | null;
		latestStartHard: Ms | null;
		recommendedStart: Ms | null;
		blocks: Interval[]; // 普段のモードで置けたらその配置、置けなければ本気のモードの配置
		needsFullEffort: boolean; // 普段は無理で本気なら間に合う
		placementFailed: boolean;
		risk: Risk;
	}[];
	deadlines: { dueAt: Ms; slackUsual: Minutes; slackHard: Minutes }[];
	bottleneck: { dueAt: Ms; slackUsual: Minutes } | null;
	overdue: string[];
	dropCandidates: string[]; // 本気でも無理なときだけ中身が入る
};

function plan(input: PlanInput): PlanOutput;
```

### テストケース

- タスクなし → `tasks` は空、`bottleneck` は null
- 期限切れ → `overdue` に入り、需要上限テストには含まれない
- 1件でちょうど収まる → slack 0、risk は danger 以上
- 同じ締切のタスクが2件
- 普段は無理・本気なら可 → `needsFullEffort`、risk は danger
- 本気でも無理 → critical、`dropCandidates` に一番長いタスクが入る
- minBlock がどの空きより長い → `placementFailed`、risk は danger 以上
- releaseAt が着手デッドラインより後 → そのモードで `latestStart` が null
- 締切が遅いタスクを足しても、締切が早いタスクの slack は増えない(単調性)
- 同じ入力なら出力が完全に一致する(決定性)
- 睡眠時間帯にブロックが置かれない

### 実装で決めた細部(#14)

- **呼び出し側は `horizonDays` を、最も遅い締切をカバーするまで伸ばす(最低14日)**。範囲の外の締切は使える時間が数えられず、余裕が誤ってマイナスになるため
- 範囲は `[now, now + horizonDays·DAY)`。`days` には、今が睡眠中でも今の活動日を含める
- 平日か休日かは、活動日の始まり(起床時刻)の JST の日付で決める(土曜 8:00〜日曜 8:00 は休日)
- 睡眠の `startMin == endMin` は睡眠なし。`startMin > endMin` は0時をまたぐ
- 同じ締切は `deadlines` で1件にまとめる。山場が同点なら締切が早い方
- 配置は (締切, ID) の降順で処理する。後ろのタスクが minBlock のせいで使わなかった短い空きを、前のタスクが使うことがある。同じタスクの隣接ブロックはまとめる
- `placementFailed` は、どちらかのモードで slack ≥ 0 なのに配置できなかったとき
- `needsFullEffort` は、普段のモードがだめ(slack < 0 か配置失敗)で、本気のモードは大丈夫なとき
- `recommendedStart` は `latestStartUsual` から、普段のモードで配置した後に残った各活動日のキャパを、日の終わり側から遡って消費して求める(`capacityUntil` の差で遡ると、min の式が日の前半にキャパを寄せるため不自然になる)。遡りきれなければ `now`
- `blocks` は、普段のモードで置けたらその配置、だめなら本気のモードの配置、どちらもだめなら空。2つのモードは独立に計算する
- 余裕は 1e-6 に丸める。配置は整数のミリ秒で行う
- Moore–Hodgson の同点は、remainingP80 が大きい → 締切が遅い → ID が小さい の順で外す。`dropCandidates` は外した順

## 4. 余裕リストのスコア(`slack-gain.ts`、#15)

### 入力と処理

```ts
type SlackGainInput = {
	capacityInput: CapacityInput; // now' = now + spareMin で buildCapacity をやり直すため、組み立て前の入力を渡す
	tasks: PlanTask[]; // 計画に含まれる全タスク(候補だけではない)
	marginRatio: number; // plan() にそのまま渡す
	candidateIds: string[]; // 余裕リストの対象(risk が relaxed のタスク)
	spareMin: Minutes; // 次の空き時間の長さ(既定: 次の予定までの時間、上限90。30/60/90 から選べる)
	tau?: number; // ストレスの尺度。既定 1(活動日1日分の普段のキャパで正規化した単位)
};
```

- **基準(休んだ場合)**: `now' = now + spareMin` として計画し直す。時間は過ぎ、何も進まない
- **候補 T をやった場合**: 同じ `now'` で、T の `remainingP80` から `min(spareMin, remainingP80)` を引いて計画し直す
- `workedToday` はどちらも増やさない。余裕リストでやった分は「計画の外の時間」とみなす
  - 実際に作業した後の再計画では、作業記録に入るので数える
- 評価は辞書式で、基準との差を取る:
  1. 間に合わないタスクの数の減少。数えるのは「usual のキャパで Moore–Hodgson が外すタスク」+「残りを plan() で計画しても usual のモードで置けないタスク(minBlock・releaseAt・1日のキャパが原因)」。前者だけだと流体の量なので、まとまった時間が要るタスクの効果が現れない
  2. 山場の余裕(`bottleneck.slackUsual`)の増加
  3. ストレス `Σ_i exp(−(s_i(usual) / D) / tau)` の減少。D は今後の活動日の usualCap の平均
- 並び順: 1 の減少が大きい順 → 2 の増加が大きい順 → 3 の減少が大きい順 → 締切が早い順 → remainingP80 が多い順 → ID

### 出力

```ts
type SlackGain = {
	id: string;
	infeasibleDelta: number; // 負なら改善
	bottleneckDeltaMin: Minutes; // 正なら改善。表示に使う(「山場の余裕 +60分」)
	stressDelta: number;
	reason: "big_block" | "uncertain" | "before_peak" | "earliest";
};
function slackGain(input: SlackGainInput): SlackGain[]; // 並べ替え済み
```

`reason` の決め方(上から順に判定):

| reason | 条件 | 表示 |
|---|---|---|
| `big_block` | `minBlock >= 60` で、かつ今後の本気のキャパのうち minBlock 以上の連続した空きが、全体の半分未満 | まとまった時間が要るので、大きく空いている今やる価値が高い |
| `uncertain` | `uncertain == true` | 見積もりが読めないので、早めに手を付けると読みが当たる |
| `before_peak` | 山場があり、`dueAt <= bottleneck.dueAt` | 山場の手前 |
| `earliest` | それ以外 | 締切が早い |

### テストケース

- 流体の性質: minBlock がすべて小さく、releaseAt なしの場合
  - 締切が早い候補ほど `bottleneckDeltaMin` が大きいか等しい
  - 山場以前の候補同士は `bottleneckDeltaMin` が等しく、締切順に並ぶ
- 残りが spareMin より少ない候補 → 改善量は残りの分で頭打ちになる
- 将来の空きが細切れで、minBlock 120 の候補がある → 締切の早い小さなタスクより上に来ることがある(`big_block`)
- 候補が空 → 空配列
- 決定性

### 実装で決めた細部(#15)

- `now'` が次の活動日に入ったら、作り直すキャパの `workedToday` は 0 にする(どちらの分岐でも増やさない)
- 候補に `releaseAt` があるときは、空き時間のうち `releaseAt` より後の分だけを作業として数える
- 候補を終えてタスクがなくなり山場が null になったら、`bottleneckDeltaMin` はやった作業の分とする
- D は `now'` で作ったキャパの活動日の usualCap の平均(下限 1)。両方の分岐で同じ D を使う
- `before_peak` は今の計画(`now` 時点、全タスク)の山場で判定する
- `big_block` は `now'` のキャパで、`now'` から min(候補の締切, 範囲の終わり) までの空きを見る
- 並べ替えの前に、`bottleneckDeltaMin` を 1e-6、`stressDelta` を 1e-9 に丸める
- **近道(CPU のため)**: 休んだ場合の基準で間に合わないタスクが0なら、候補ごとに計画し直さず、締切ごとの余裕(需要上限テスト)だけを計算し直す。間に合わないタスクの数は0のまま
  - 根拠: 残りを減らすと各締切の需要は減るだけなので、Moore–Hodgson は何も外さない。配置も、減らしたぶん場所が空くだけ
  - 候補ごとに計画し直す版(`exact: true`)とランダムな 400 ケースで一致することをテストで確かめている
  - 計測(手元の Node): 30 タスク・120日で 9ms → 1.4ms、50 タスク・180日で 31ms → 2.8ms(計画+余裕リスト一式)

## 4.5 計画サービス(`services/planning.ts`、#27)での組み立て

DB の内容から planner の入力を作るときのルール。

- `sessions.progress` は 0〜100 の整数(25/50/75/100)。§1 の「0 / 0.25 / …」はこれを 100 で割った値
- 計画に入れるのは `todo` と `doing` で、残りが 0 より大きいもの。`done` は残り 0 とみなして計画から外す(提出確認は通知側で扱う)。`submitted` と `done` は見積もりの学習にだけ使う
- 範囲は「開いているタスクの最も遅い締切 + 1日」、最低14日、**最大180日**(年の打ち間違いで計算が膨らまないように)。180日より先のタスクは計画にも応答にも含めない
- 普段のキャパの学習は、閉じた確認済みの作業記録を活動日ごとに集計する。**今の活動日は含めない**(途中なので P75 を下げてしまう)。前日に 0 分の行を必ず足し、28日の期間を今日から数えるようにする
- `workedToday` は、閉じた確認済みの記録+作業中の記録(今まで)を、今日の起床時刻〜今に切り詰めて足す
- 残りの進捗は、確認済みの記録のうち progress を持つ最新のものを使う(なければ 0%)
- `marginRatio` は 0.5
- 余裕リストの `spareMin` の既定は、次の空き時間の長さ(30〜90分に丸める)

## 5. この仕様で決めたこと(plan.md の未決だった点)

- 普段のキャパは「作業した日の P75、平日/休日別、初期値 180/300 分に m = 3 で寄せる、下限 60 分」
- 余裕リストでやった分は、スコア計算では普段のキャパの消費に数えない。実際の再計画では数える
- 需要上限テストは流体(分割自由)で計算し、minBlock と releaseAt は配置の段階でだけ考慮する。両者が食い違ったら `placementFailed` で知らせる
- 期限切れのタスクは計画から外し、`overdue` として別に扱う
