# Validation record

2026-09-10 · seed 2048 · local Codex in-app browser · Apple M5 Max (40 GPU cores, Metal supported).

最終実装のWGSLを実機で実行。CPU物理へのフォールバックなし。以下は1 seedでの工学的検証結果であり、一般的な種分化や長期の適応進化を立証するものではありません。

## Automated checks

- TypeScript `tsc --noEmit`：成功。
- Oxlint（src / app / tests）：成功。
- CPU tests：5 / 5成功。初期条件のseed再現性、1,000回の接続性付き変異、拘束の相互接続、出生時energy transferと死亡slot再利用、相関の退化ケース。
- Vite / Vinext production build：成功。
- GPU success tests：4 / 4成功。すべて有限値。

## 1. Muscle-only locomotion

同一単体genome、水平重力0、gravity大きさ7。4秒settling後、14秒を測定。移動量はworld units。

|Condition|Horizontal COM displacement|Relative-shape RMS change|
|---|---:|---:|
|Muscles OFF|0.000147305|0.000229094|
|Muscles ON|0.080795740|0.122691382|

このseedでは筋収縮による接触運動を確認。歩容・移動関数は与えていません。

## 2. Spatial local-law response

同一genomeを診断用の同じ空間fieldのx = −10 / +10へ配置。controller係数を0にして感覚入力による差を除外。

|Location|Body-sampled gravity|Horizontal displacement|Shape RMS change|
|---|---:|---:|---:|
|x = −10|2.000000|0.077434205|0.044257098|
|x = +10|14.000001|0.270224036|0.200618691|

通常実験の初期場にはこの診断用zoneを使用しません。

## 3. Niche formation and influence ablation

32 founders、120 simulated seconds。Physics diversityはREADMEの正規化空間分散。

|Condition|Physics diversity at 120 s|
|---|---:|
|Initial / fixed laws|0.000003413622|
|Evolving laws, influence = 0|0.000009935346|
|Evolving laws, body influence = 0.3|0.001576846267|

生物作用ありは作用なしの約158.7倍。微小なlaw mutationだけでは同程度の空間構造になりません。

## 4. Matched-seed ecological divergence

32 founders、initial body target 32、maximum 80 creatures、8 constraint iterations、metabolism .02、muscle cost .025、reproduction threshold 110。元の初期genome分布一致をtest内で検査。

|Metric at 120 s|Fixed physics|Coevolution|
|---|---:|---:|
|Living creatures|32|36|
|Active voxels|1,007|1,131|
|Births|1|6|
|Deaths|1|2|
|Mean body size|31.468750|31.416667|
|Mean energy|39.362454|51.434132|
|Mean generation|0.031250|0.166667|
|Morphology diversity|0.059045247|0.059223625|
|Genome diversity|0.086822510|0.083143446|
|Genome fingerprint|f6dc197a|19ddc0ff|
|Gravity variance|0.000295393|0.084481080|
|Drag variance|0.000033296|0.011306842|
|Viscosity variance|0.000033582|0.022834247|

body size histogram、material distributionも異なることをtest条件で検査しています。詳細な数値の抜粋は `validation-evidence.json`、全時系列はアプリで再実行してExport validation JSONから取得できます。

## UI and performance observations

240 creatures / 8,616 active voxels、32 × 16 × 32 field、6 solver iterations、実時間1倍で動作。表示FPSは118〜120を観測。これはApple M5 Max上での描画フレーム頻度で、GPU timestampによるbenchmarkではなく、他GPUでの60 FPS保証でもありません。

Pause / Resume、同一seed Reset（240 creatures / 8,616 voxels / 85 mean energy / t=0へ復帰）、Fixed preset、Physics evolution OFF、Gravity mode、gravity arrows、XY field sliceをUI操作で確認。Material viewのcube bodiesとfield sliceを目視確認。エラーは画面に表示し、NaN観測時はsimulationを停止します。

## Interpretation and remaining validation

この実行では、生物の局所環境作用が物理場に構造を作り、そこから運動・energy収支・出生死亡・身体分布が異なる経路を辿る閉ループを測定できました。

短時間・単一seedでのtrajectory分岐は、特定形態が特定nicheに普遍的に適応したことや、種分化を証明しません。複数seed、長時間、系統別reproductive success、より詳細なcontroller / environment ablationが次の研究課題です。

GPU上のparallel衝突集計順序に由来する小差があります。再実行でfield統計の末尾や軌道が変わっても、bitwise determinismを保証していない設計上の制約です。
