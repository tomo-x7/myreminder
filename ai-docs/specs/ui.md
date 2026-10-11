# UI の方針(#29)

本人の希望: 情報密度はそれなりに高く、余白は少なく、色は少なく、グラデーションなし、影は極小。AI っぽい最大公約数的なデザイン(角丸の大きいカード、淡い色の面、大きなボタン、絵文字)にしない。とにかくシンプルに。

## トークン(`web/src/theme.css`)

Tailwind の既定のパレット・影・角丸は `@theme` で消してある(biome 2.2 が `--color-*: initial` を読めないので、このファイルだけ biome の対象外)。`bg-blue-600` や `rounded-xl`、`shadow-md` は**書いても効かない**。使えるのは次だけ。

| 用途 | クラス |
|---|---|
| 文字 | `text-ink`(本文・既定)/ `text-sub`(補助)/ `text-faint`(さらに弱い・空の表示) |
| 罫線 | `border-line` / `divide-line` |
| 面 | `bg-paper`(白)/ `bg-wash`(押したとき・無効の面。広い面には使わない) |
| 危険・期限切れ・致命 | `text-danger` / `border-danger` |
| 注意・未提出 | `text-warn` / `border-warn` |
| 塗り | 主要な操作のボタンと、選ばれたチップだけ `bg-ink text-paper` |
| 角丸 | `rounded-sm`(3px)と、点の `rounded-full` だけ |
| 影 | `shadow-edge`(下から出るシートの上端の線)だけ |

## 寸法

- 文字は 14px(`text-sm`)が基準。補助は 12px(`text-xs`)、見出しは `text-base`、ホームの締切だけ `text-lg`
- 余白: ページの左右 12px(`px-3`)、まとまりの間 12px(`gap-3`)、まとまりの中 4〜8px
- ボタンの高さは約 34px(`py-1.5`)。リストの行は `py-2`
- 数字は全体で `tabular-nums`、和文は `palt`

## 部品(`web/src/components/ui.tsx`)

- ボタン: `btnPrimary`(墨の塗り。1画面に1〜2個まで)/ `btnSecondary`(枠だけ)/ `btnDanger`(枠+赤い文字。塗らない)/ `btnGhost`(文字だけ)
- `chipClass(selected)`: 絞り込みや 30/60/90分 などの選択肢。丸いピルにしない
- `inputClass`、`Field`(上に小さいラベル)
- `PageHeader`(`text-base` の見出し+右に操作)、`SectionTitle`(小さい見出し+下の罫線)
- `listClass`: 罫線で区切ったリスト。カードを縦に並べる代わりに使う
- `Notice`(左の線+小さい文字。`tone` は plain / warn / danger)、`ErrorNotice`、`Tag`(小さな枠付きの札)、`Empty`
- 面を塗った箱(`bg-*-50` の囲み)は作らない。強調は左の 2px の線(`border-l-2 pl-2`)と文字の太さ・色で

## リスクの見せ方

`features/schedule/format.ts` の `RISK_STYLE`。余裕は色なし、注意は黄土、危険・致命は赤。面は塗らず、左の線と文字色だけ。

## しないこと

- 絵文字をアイコン代わりに使う(ステータスは小さな点)
- 1つの画面に色を3つ以上出す(墨・灰+赤か黄土まで)
- カードの入れ子、`rounded-full` のピル型ボタン、影
