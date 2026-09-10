# Coevolution of Physics and Life

WebGPU上の構造化Voxel生物と、局所物理法則の共進化を観測する研究プロトタイプ。TypeScript / WGSL / Vite（Vinext）で実装しています。

## Run

Node.js 22.13以降とpnpm、WebGPU対応GPU・ブラウザが必要です。HTTPSまたはlocalhostで開いてください。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

開発サーバーのURLを開くと240個体、約8,600 active voxelsで開始します。ドラッグで回転、ホイールでズーム。WebGPUが使用できない場合は明示的なエラーを表示し、別方式の擬似シミュレーションに置き換えません。

## Concept

生命が固定された物理世界に適応するだけでなく、身体の各部位が局所物理場に作用し、その変化した環境が次の生存・繁殖条件になります。

```text
Genome → connected morphology → muscle contraction → physical motion
   ↑                                                  ↓
reproduction ← energy balance ← local laws ← body-voxel influence
```

## Research Question

> What happens when embodied organisms do not merely adapt to a fixed physical world, but can modify and inherit the local physical conditions that constitute their evolutionary environment?

この実装でいう物理の「継承」は、場所に残存し拡散する環境状態です。物理領域が生物と同じ方式で子領域を産む、という意味ではありません。

## Voxel Creature

身体は最大8 × 8 × 8の局所格子から抽出した20〜80個のoccupied cellsです。連結した身体に6面近傍と最大20個の斜め近傍の距離拘束を形成します。26近傍によって単純な6近傍格子のせん断崩壊を軽減します。全512セルを物理計算することはありません。

材質はSoft / Rigid / Muscle X / Muscle Y / Muscle Z / Sensor / Energy Storageの7種類。密度、剛性、減衰、筋活動、栄養摂取効率が異なります。初期身体はseed付きの確率的な連結成長で生成し、種や歩容は定義していません。

## Genome

`CreatureGenome.ts` は1セルにつきoccupancy、material、stiffness、amplitude、frequency、phaseの6 floatを保持する直接encodingです。個体ごとに環境選好8値とcontroller係数4値も遺伝します。身体セルはtyped arrayであり、シミュレーションVoxelごとのJavaScript objectは生成しません。

`Mutation.ts` はVoxel追加・除去、材質、剛性、筋振幅・周波数・位相、環境選好、controllerを変更します。除去後にcoreからBFSし、分断する除去をrejectします。追加と除去を同時に行う場合も、追加後のoccupancyに対して接続性を検査します。

## Morphology

`MorphologyGenerator` interfaceと`DirectMorphologyGenerator`を分離しています。CPPN、L-System、NCA等はこのinterfaceの生成側を交換して実装できます。出力はactive metadata、adjacency、形態descriptorです。

DescriptorはVoxel数、bounding box比、露出面数、compactness、X対称性、平均剛性、材質比率、格子内重心。対称性は8セル格子の中央面に対する近似で、姿勢不変な分類器ではありません。

## GPU Simulation

固定刻み1/120秒。各stepの冒頭で地面への荷重集計・地面変形を行います。描画フレームの時間から必要なstep数を決め、1 frame最大8 stepに制限します。遅いGPUではsimulation timeがwall timeより遅くなります。速度スライダーは目標倍率です。

各stepで次を順番にdispatchします。

1. `sensors.wgsl`：Sensor材質から栄養勾配、局所重力、粘性を個体ごとに集約。
2. `actuator.wgsl`：4入力の線形controller＋tanhから振幅・位相を変調。X/Y/Z筋は該当軸のrest vectorを周期変化。
3. `voxelForces.wgsl`：Voxelの現在位置で物理場をsample。重力、drag、露出面数に依存するviscous drag、材質減衰を適用して積分。
4. `constraints.wgsl`：complianceを持つJacobi PBDを複数iteration。各bondの両端で同じdegree正規化を使い、質量で重み付け。**蓄積Lagrange multiplierを持つ完全なXPBDではありません。**
5. `spatialGrid.wgsl`：固定3D格子のheadをclearし、atomic exchangeでVoxelのlinked listを構築。
6. `collision.wgsl`：27近傍セルで異なる個体の近接Voxelを反発。地面、world bounds、局所adhesion由来のCoulomb型摩擦、速度再計算。
7. `energy.wgsl`：個体単位のGPU reduction。基礎代謝、筋活動、strain、粘性散逸、栄養摂取、重心、移動距離、局所物理平均を計算。
8. `physicsInfluence.wgsl`：各身体Voxelが占有するPhysics Cellへ、その個体の選好をfixed-point atomic加算。
9. `physicsField.wgsl`：影響を平均し、6近傍拡散とseed付き低頻度変異を適用。パラメータをclamp。

身体の移動は筋収縮、格子拘束、外力、接触から生じます。`walk` / `swim` / `crawl`等の移動コードや直接的な目的方向への推進力はありません。

### Memory layout / alignment

WGSLの`vec4f`単位（16 byte alignment）で明示的にpackしています。CPU側Float32Arrayのoffsetと対応します。

|Buffer|Stride|内容|
|---|---:|---|
|Voxel state A/B|64 B|position.xyz + voxel energy、velocity.xyz + strain、previous position.xyz + nutrient sample、cost / uptake / strain / reserved|
|Voxel metadata|64 B|rest.xyz + material、mass / stiffness / damping / creature ID、amplitude / frequency / phase / exposed faces、adjacency offset / count / grid cell / reserved|
|Adjacency|4 B|隣接active voxelのu32 index。rest lengthはmetadataのrest vectorから導出|
|Actuator|16 B|XYZ rest scale + actuation effort|
|Creature state|128 B|offset / count / energy / age、選好2 vec4、controller、center / offspring、sensor、distance / cost / local g / local viscosity、genome ID / born / generation / alive|
|Physics field A/B|48 B|gravity.xyz / drag、viscosity / adhesion / repulsion strength / falloff、nutrient availability / occupancy / last law change / reserved|
|Influence deposits|48 B|12 atomic i32。count＋8選好sum、残り予約。量子化1024単位|
|Spatial heads / next|4 B each|cell headまたはnext index。空は-1|
|Simulation uniform|96 B|6 vec4。時間・counts・mechanics・ecology・field evolution・seed|
|Camera uniform|112 B|mat4＋3 vec4|

PBD・積分・衝突はread/write分離したVoxel A/B、物理場は別のA/B。pass間はcommand encoder順序で同期します。depositsは別passでclear→atomic accumulate→field read。CPUはshader内部のworkgroupを跨ぐbarrierに依存しません。

GPU bufferはmax population × 80のcapacityを確保しますが、**先頭のactive rangeだけをdispatch・render**します。出生・死亡時のみCPUがmetadataを再packし、生存Voxel状態はGPU-to-GPU copyでcompactionします。既存個体の位置・速度をreadbackして再uploadしません。物理場は出生や世代更新で初期化しません。

個体管理は固定slot、身体active listはdense packingです。Voxel storage capacityの全512格子への拡張は不要です。現在の最大GUI設定は1,000個体（80,000 Voxel capacity）。100,000以上はcapacity設定とメモリ制限の再評価が必要です。

### CPU readback

通常はsimulation time 1秒ごとに個体summary（128 B × max count）と物理場の計測snapshot（786,432 B）を一度readbackします。地面snapshot（67,600 B）も同じタイミングで取得し、デフォルト合計約0.92 MB / simulated second。CPUがこの時点で死亡・繁殖を処理するため、反映には最大約1 simulated secondの遅延があります。各フレームの位置readbackはありません。検証時だけ単体身体の全状態をreadbackします。

将来はfield平均・分散もGPU reductionし、field全体の低頻度readbackをさらに削減できます。

## Physics Field

身体格子と完全に別の32 × 16 × 32 world grid。範囲X/Z = −20…20、Y = 0…20、セル幅1.25。各Voxelが自身の位置でnearest-cell sampleします。頭と脚が別セルにあれば異なる力を受けます。

初期場はgravity (0,−7,0)、drag .35、viscosity .3、adhesion .5付近の微小random variation。作成済みzoneはありません。場のgravity大きさは0.5…20、drag/viscosity/adhesion/repulsionは0…5、falloffは0…4に制限します。repulsionがinteraction strengthを兼ねる簡略化です。

変異は120 stepごとにhash PRNGで加え、時間依存のsin noiseで場を置き換えません。拡散は現在値の隣接平均への緩和です。生物が死んでも、改変された場はその場所に残ります。

## Coevolution

Voxel単位で物理場をsample → 運動・変形・消費が変化 → 摂食とenergy balanceが変わる → energy閾値を超えた個体が変異した子を産む → 異なる身体・筋・controller・選好の分布 → 局所場を異なる方向へ改変、という閉ループです。

生物が物理場へ作用する強さはそのcellの身体Voxel密度に依存します。特定gravityをfitnessの正解として指定しません。代謝・筋活動・変形・粘性散逸という実際の状態コストを使用します。

栄養は連続的な位置関数とGPU上のresource availabilityで構成し、占有密度によって消耗、時間とともに回復します。これは物理law evolutionのON/OFFとは独立です。地面から離れるほど摂取が減衰し、Energy Storage材質は摂取効率が高くなります。保存的な流体・化学物質輸送や閉じた熱力学系ではありません。

8秒齢以降、energy ≥ thresholdの個体から42%を子へ渡し、追加で5 energyの出生コストを引きます。capacityに空きがある場合にのみ繁殖します。死亡はenergy ≤ 0。全滅時の自動random補充、世代ごとの一括fitness選抜、手動speciesラベルはありません。

## Rendering / Controls

初期表示は連続したSmooth meshです。Body renderingから従来のVoxels表示へ切り替えられます。raw WebGPUで物理状態のGPUBufferを直接読みます。Smooth meshは全個体を一つのindexed mesh batch、Voxelsは全active cubeを一つのinstanced drawで描画します。Three.jsはcamera / orbit / cube geometryに使用。UIはReact + Shadcn controlsです。

Creature / Material / Stress / Gravity / Drag / Viscosity / Adhesion / Energy / Physics Diversityの9モード。XY / XZ / YZ slice位置、gravity arrow密度、body・sensor表示を変更可能。field sliceは指定モードのスカラー値、Material / Creature / Stressのときはgravity大きさを表示します。Physics Diversity表示は初期基準からの局所偏差で、metricsの空間分散とは異なります。Energy表示はnutrient availabilityです。

### Continuous deforming mesh

`SurfaceMesh.ts` は身体のrest positionからGaussian density fieldを作り、marching tetrahedraで閉じた表面を抽出します。正負のLaplacian smoothingで格子由来の角張りを緩和します。生成は初期化と出生時のみで、形態が変異すると子の表面も変化します。

各表面頂点を近傍8個の物理Voxelへmoving-least-squares weightsで結び付けます。`skin.wgsl` がGPU上で表面を変形し、描画shaderが変形後の三角形から滑らかな法線を再計算します。材質色とstressも補間します。物理位置をCPUへ追加readbackする処理はありません。

skin metadataは96 B/vertex、変形結果は32 B/vertex、triangle indexとnormal adjacencyはu32です。出生・死亡に伴う物理bufferの詰め直しには、creature slotから現在のvoxel offsetを参照して追従します。seed 2048の240個体で約26.3万表面頂点・52.4万三角形です。

Inspect organismで1個体を拡大・追尾し、World viewで全体表示へ戻ります。観察中は他個体と場の描画を隠しますが、全個体の物理計算は継続します。対象が死亡すると全体表示へ戻ります。Smooth meshのSensor colorsは色の強調を変更し、表面に穴を開けません。

表面Meshは描画専用で、衝突・エネルギー・遺伝子・selection pressureは既存Voxel物理のままです。Mesh FEMへ物理モデルを変更したものではありません。強い折り畳みでは表面の自己交差が起こり得ます。局所skinningは近似で、厳密な体積保存や完全な回転再現は保証しません。高個体数ではcubeよりGPUメモリ・描画負荷が増えます。

従来のVoxels表示は世界軸方向のcubeです。全volume raymarchingは未実装です。

## Metrics

毎simulated secondに記録します。生存数、active voxels、出生・死亡、平均サイズ・energy・死亡済個体の平均寿命、生存個体の平均offspring、移動距離、distance / cumulative energy expenditure、平均世代を含みます。

- Genome diversity：最大64組の隣り合う個体のoccupancy/material距離の近似。全遺伝パラメータ距離ではありません。
- Genome fingerprint：全個体の遺伝子・選好・controllerの順序非依存32bit集計hash。衝突可能性があるため、科学的同一性の証明には元genomeを使ってください。
- Morphology diversity：最大64組の正規化descriptor距離。
- Material distribution：全active voxelsに占める各材質の割合。
- Size histogram：20…80 Voxelの個体数。
- Physics diversity：Var(|gravity|)/400 + Var(drag)/25 + Var(viscosity)/25。
- Gravity / drag / viscosityの平均と分散。
- 剛性対局所gravity、サイズ対局所gravity、筋比率対局所viscosityのPearson r。個体内全Voxelのsampleを平均。分散不足はnull。

相関は因果の証明ではありません。UIの「Run 4 success tests」で対照実験を行い、ExportからJSONを保存してください。exportは初期設定、途中の設定変更時刻、全記録、現在genome、最後のfield / ground snapshot、検証結果を含みます（schemaVersion 2）。

## Experiments

A Fixed / B Slow / C Strong / D Unstableの4 preset。preset選択は現在のworldへ適用し、Resetでseedから再構築します。seed・population設定はReset時に反映されます。

組込み検証は以下を行います。

1. 単一個体で筋OFF / ON、水平gravityなし、同じseedを比較。settle 4 s後の14 sにおける水平重心移動と変形を計測。
2. 同一genomeをdiagnostic fieldの別位置（x = −10 / +10）に配置し、局所gravity 2 / 14で比較。この診断だけ人為的なfieldを使用し、通常のworld・共進化実験には持ち込みません。
3. 120 sの共進化でfield分散が増えるか確認。さらに同じ変異・拡散で**creature influence = 0**としたablationと比較し、活動由来の構造を区別。
4. 32 founders、同seed、同栄養源でFixed / Coevolutionを120 sずつ実行。初期genome hash一致と、出生・死亡、形態descriptor、body size histogram、material distribution、genome hashの分岐を検査。

全テストは同じGPU Computeコードを実行し、CPU物理による代用ではありません。パス閾値は工学的smoke testです。複数seed、複数GPU、長期間の統計的研究を代替しません。

## Performance

目標は200〜500個体、5,000〜20,000 active voxels、60 FPS。デフォルト240個体・約8,600 voxelsで実機表示を確認。FPSは描画フレーム頻度であり、GPU timestamp queryによるkernel計測ではありません。実測結果と検証seedは `VALIDATION.md` に記録します。

拘束計算はO(active voxels × 26 × iterations)、field更新はO(16,384)。衝突は27セル近傍のlinked listを参照し、各セル最大96候補で打ち切ります。局所過密時には衝突候補を省略する近似なので、全Voxel対のO(N²)走査は行いませんが、高密度時の正確性は制限されます。

## Limitations

- compliant Jacobi PBD、球状近接反発、軸方向cube表示の近似。完全XPBD、FEM、体積保存、自己衝突、損傷・破断は未実装。
- nearest-cell samplingの境界不連続。連続場・trilinear samplingへの交換余地あり。
- 環境改変には専用energy costがなく、資源は保存量ではありません。
- 能動的なfield領域同士の繁殖はなく、改変・変異・拡散・空間的残存がPhysics evolution。
- maximum capacityに到達すると繁殖が停止。長時間の種分化・open-ended evolutionを保証しません。
- seedは初期ゲノム・初期場・CPU変異・GPU hashを再現します。GPU float、parallel collision accumulationの順序、ハードウェア差により軌道のbitwise一致は保証しません。
- セル密度の高い場所ではcollision capが効きます。50,000〜100,000 Voxel域の性能は別途検証が必要です。

## Future Work

XPBD multiplier、volume/shear constraints、GPU field reductions、resource diffusion、field modification cost、非同期staging ring、GPU compaction、複数seed統計、系統樹・genome clustering、CPPN/NCA morphology generator、成長・修復・fission/fusion、predation・symbiosis、sexual reproduction。

`CreatureManager`（個体管理）、`MorphologyGenerator`（発生）、`VoxelPhysics`（Compute kernel）、`Simulation`（step・buffer寿命）、`PhysicsField`（初期場）、`Metrics`（観測）、`Renderer`を分離してあります。

## Technical references

- [WebGPU specification](https://www.w3.org/TR/webgpu/)
- [WGSL specification and alignment rules](https://www.w3.org/TR/WGSL/)
- [Three.js WebGPU renderer documentation](https://threejs.org/docs/pages/WebGPURenderer.html)

これらはAPIとメモリ設計の参照であり、このモデルの科学的妥当性の実証ではありません。

## 変形する地面

`Soft ground` は初期ON。`Ground stiffness` を下げると沈みやすくなります。地面は65 × 65頂点、64 × 64 quad / 8,192 triangles、間隔0.625の連続したheightfieldです。`Inspect organism`でも地面を表示します。初期状態では断面ヒートマップをOFFにし、凹凸と陰影を観察できます。

GPUで接触付近のVoxel質量・下向き重力から近似荷重を求め、4近傍の地面頂点へ固定小数点atomicで分配します。地面は過減衰の弾性基盤モデルです。`heightRate = (3 × neighborLaplacian − stiffness × height − load) / damping`。stiffnessは操作値 × (1 + local repulsion × 0.3)、dampingは3 + local viscosity × 12。空間の重力・粘性・反発特性が変わると、地面の変形にも反映されます。地面自体に独立した遺伝子を追加したものではありません。

高さと速度はGPUに保持し、同じ三角形補間を描画、Voxel接触、栄養摂取高度に使います。接触法線に沿った位置補正と、地面の鉛直速度に対する相対移動から摩擦を計算します。栄養の高さ減衰は絶対高度ではなく地表からの高さを使い、沈み込んだだけで摂取量が増える問題を避けます。地面のON/OFFは生物を瞬間的に押し上げず、速度制限内で平面へ戻します。完全な固定地面の比較はOFFにしてResetしてください。

これは荷重を近似する視覚・接触モデルで、保存的な土壌力学やFEMではありません。接触インパルス全体の厳密な反作用、塑性変形、掘削、横方向の地面移動はありません。境界は固定、深さは1.2、変形速度は0.6 world units/sが上限です。Voxel中心のクリアランスを保証する近似接触であり、描画用の生物skinには局所的な地面との交差が起こり得ます。地面の変形は足場を変えるため、生態の軌道も以前とは変わります。

`Test ground response` は別の診断worldで同一seed・同一bodyを使い、軟／硬、高／低粘性、接触と平面対照を比較します。12秒の荷重後にbodyを取り除き、2秒の復元を測定します。従来の`Run 4 success tests`は地面OFFを明示し、元の固定床条件を維持します。数値結果はUIとJSON exportから確認できます。
