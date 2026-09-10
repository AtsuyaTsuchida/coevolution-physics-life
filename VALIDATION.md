# Validation record

2026-09-10 · seed 2048 · local Codex in-app browser · Apple M5 Max (40 GPU cores, Metal supported).

The implementation's WGSL was executed on hardware without a CPU-physics fallback. These are engineering checks for one seed, not proof of general speciation or long-term adaptive evolution.

## Automated checks

- TypeScript `tsc --noEmit`: passed.
- Oxlint (src / app / tests): passed.
- CPU tests: 5 / 5 passed. Coverage includes seeded initial conditions, 1,000 connectivity-preserving mutations, reciprocal constraints, birth energy transfer and death-slot reuse, and degenerate correlations.
- Vite / Vinext production build: passed.
- GPU success tests: 4 / 4 passed. All values were finite.

## 1. Muscle-only locomotion

One matched genome, zero horizontal gravity, and gravity magnitude 7. Measurements cover 14 seconds after four seconds of settling. Displacements are in world units.

|Condition|Horizontal COM displacement|Relative-shape RMS change|
|---|---:|---:|
|Muscles OFF|0.000147305|0.000229094|
|Muscles ON|0.080795740|0.122691382|

For this seed, muscle contraction produced motion through contact. No gait or movement function was supplied.

## 2. Spatial local-law response

The same genome was placed at x = −10 / +10 within one diagnostic spatial field. Controller coefficients were zeroed to exclude sensory-input differences.

|Location|Body-sampled gravity|Horizontal displacement|Shape RMS change|
|---|---:|---:|---:|
|x = −10|2.000000|0.077434205|0.044257098|
|x = +10|14.000001|0.270224036|0.200618691|

These diagnostic zones are not used in normal initial fields.

## 3. Niche formation and influence ablation

32 founders, 120 simulated seconds. Physics diversity is the normalized spatial variance defined in the README.

|Condition|Physics diversity at 120 s|
|---|---:|
|Initial / fixed laws|0.000003413622|
|Evolving laws, influence = 0|0.000009935346|
|Evolving laws, body influence = 0.3|0.001576846267|

Body influence produced approximately 158.7 times the diversity of the no-influence control. Small law mutations alone did not produce comparable spatial structure in this run.

## 4. Matched-seed ecological divergence

32 founders, initial body target 32, maximum 80 organisms, eight constraint iterations, metabolism 0.02, muscle cost 0.025, and reproduction threshold 110. The test verifies matching initial genome distributions.

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

The test also checks differences in body-size histograms and material distributions. Numerical excerpts are in `validation-evidence.json`; rerun the application tests and use Export validation JSON for complete time series.

## UI and performance observations

Observed with 240 organisms / 8,616 active voxels, a 32 × 16 × 32 field, six solver iterations, and target speed 1×. Displayed FPS was 118–120. This is rendering frequency on the Apple M5 Max, not a GPU timestamp benchmark or a guarantee of 60 FPS on other GPUs.

UI checks covered Pause/Resume, same-seed Reset (returning to 240 organisms, 8,616 voxels, mean energy 85, and t=0), the Fixed preset, Physics evolution OFF, Gravity mode, gravity arrows, and an XY field slice. Cube bodies in Material view and field slices were inspected visually. Errors are shown on screen, and non-finite observations stop the simulation.

## Interpretation and remaining validation

This run measured a loop in which organism influence structured the local field, followed by different motion, energy balances, lifecycle events, and body distributions.

Short, single-seed trajectory divergence does not prove universal adaptation of a morphology to a niche or speciation. Further work requires multiple seeds, longer runs, lineage-specific reproductive success, and more detailed controller/environment ablations.

Parallel GPU collision accumulation introduces small differences. Changes in trailing field statistics or trajectories across runs are consistent with the absence of a bitwise-determinism guarantee.

## Continuous surface rendering update

- Physics kernels, energy rules, mutation and reproduction were not changed.
- Added a closed, connected marching-tetrahedra surface per genome, regularized MLS skinning from eight nearby physical voxels, and deformed area-weighted vertex normals.
- CPU tests: 7 / 7 pass. The two new tests cover closed/connected surface topology, local bone bounds, bind-pose reconstruction, and translation invariance.
- TypeScript, scoped Oxlint, and production build pass.
- GPU/browser checks: smooth surface deformation, isolated organism inspection, live Mesh/Voxels switching, and lifecycle compaction were verified without GPU error alerts.
- During lifecycle QA, deaths reached 238. With temporary QA settings (basal and muscle cost 0, birth threshold 90, speed 4), 3 births produced new surfaces without error. These settings were then discarded by reloading the normal defaults. This is a rendering lifecycle check, not additional evidence of adaptation.
- Default mesh: 262,640 shared vertices / 524,384 triangles for 240 bodies. The initial material-view mesh run displayed approximately 118–119 FPS on the same M5 Max. This remains a frame-rate observation, not a GPU timestamp benchmark.
- The visible skin is an approximation around the physical voxels; severe folds may self-intersect. It is not a change to a continuum/FEM physics model.


## Deformable ground update — 2026-09-10

The ground GPU comparison passed 4 / 4 checks with seed 2048. The same organism was used with muscles and field evolution disabled. Each condition applied load for 12 simulated seconds, then removed the body for two seconds of recovery. Diagnostic worlds were separate from the live world.

| Condition | Maximum loaded depth | Depth after 2 s unloaded | Remaining fraction |
|---|---:|---:|---:|
| Soft: stiffness 4, viscosity 0.3 | 1.085063 | 0.115066 | 10.60% |
| Hard: stiffness 32, viscosity 0.3 | 0.201854 | 0.0000000523 | 0.000026% |
| High viscosity: stiffness 4, viscosity 3 | 0.834111 | 0.511507 | 61.32% |
| Ground deformation OFF | 0 | 0 | — |

All conditions remained finite. Minimum voxel-center clearance was at least 0.1449996 against a target of 0.145. Body center Y was −0.498355 on soft ground and 0.376319 on the flat control, confirming a contact change rather than a display-only effect. Because recovery starts from different depressions, remaining fractions compare this fixture rather than precisely measuring material constants. Results are saved in `ground-validation-evidence.json`.

The ground is an overdamped approximate-load model, without guaranteed momentum/energy conservation or faithful soil-material behavior. Rendering and contact use the same triangle interpolation, but these checks do not prove that the entire visual organism skin never intersects the ground. Earlier evolutionary results are not reused as scientific validation of the new ground model.

Regression checks: the original GPU suite with ground deformation explicitly disabled passed 4 / 4. Horizontal displacement was 0.06866537 with muscles ON and 0.00013537 with muscles OFF. Local-law response, environmental structuring, and matched-seed ecological divergence also passed. These flat-floor rerun values are recorded separately rather than replacing earlier observations. CPU tests passed 7 / 7; TypeScript, scoped lint, and production build passed. No GPU error alerts appeared.


## Four giants update — 2026-09-10

Seed 2048, four bodies with 264 active voxels, voxel spacing 0.87, and 40 constraint iterations. Muscles ON/OFF were each run for 16 simulated seconds; the final 12 seconds were compared after excluding four seconds of settling.

| Body | Horizontal path, muscles ON | Horizontal path, muscles OFF | Maximum centered voxel-motion RMS |
|---|---:|---:|---:|
| Ribbon | 1.380583 | 0.00000525 | 1.137132 |
| Crawler | 1.646815 | 0.00000703 | 1.441738 |
| Star | 0.320945 | 0.00000251 | 0.727776 |
| Roller | 2.081847 | 0.00088231 | 1.380266 |

Horizontal path sums center-of-mass travel at 0.5-second intervals; it is not net displacement. RMS includes body rotation and is not pure strain. Roller's two-marker axis accumulated 3.032969 rad (approximately 174 degrees) of net XY-projected rotation. This deforming-body marker measurement is not an exact rigid-body angle. Minimum voxel-center ground clearance was 0.434999921, consistent with the 0.435 target. GPU results remained finite. Values are saved in `showcase-validation-evidence.json`.

The new CPU test covers genome connectivity, distinct body shapes, within-body references for extended constraints, and closed enlarged skins. The combined suite passed 8 / 8. TypeScript, scoped lint, and production build passed. Switching back to colony mode restored 240 organisms / 8,616 voxels without GPU error alerts.

This observation mode uses authored shapes, muscle phases, and contact grip. Energy replenishment and disabled births/deaths are explicitly documented. Its results are not evidence of evolved locomotion or survival adaptation.

The final Four giants suite passed 4 / 4, including the net-rotation requirement. The original coevolution GPU suite also passed 4 / 4 on rerun. The final overview showed four bodies, 264 voxels, 120 displayed FPS, and no GPU error alerts. Display FPS is not a GPU timestamp benchmark.

## Wireframe update — 2026-09-10

Hardware checks confirmed line-only mesh rendering, deformation tracking, and Smooth mesh → Wireframe switching in four-body mode. The population remained four bodies / 264 voxels, with no GPU error alerts. TypeScript, scoped lint, and production build passed. Physics shaders and evolutionary rules were unchanged.
