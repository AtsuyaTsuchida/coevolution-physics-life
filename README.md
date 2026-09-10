# Coevolution of Physics and Life

A research prototype for structured voxel organisms and evolving local physical conditions, implemented with WebGPU, TypeScript, WGSL, and Vite (Vinext).

## Run

Requires Node.js 22.13 or later, pnpm, and a WebGPU-capable browser and GPU. Open the application over HTTPS or localhost.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

The application starts in **Four giants**, an observation mode with four large organisms. Select **World mode → Coevolution colony** for the original population of 240 organisms and approximately 8,600 active voxels. Drag to orbit and scroll to zoom. If WebGPU is unavailable, the application displays an error rather than substituting a different simulation.

## Concept

Organisms interact with local physical conditions through their bodies. The modified environment then affects movement, energy balance, survival, and reproduction.

```text
Genome → connected morphology → muscle contraction → physical motion
   ↑                                                  ↓
reproduction ← energy balance ← local laws ← body-voxel influence
```

## Research Question

> What happens when embodied organisms do not merely adapt to a fixed physical world, but can modify and inherit the local physical conditions that constitute their evolutionary environment?

Here, physical “inheritance” means environmental state that persists at a location and diffuses through space. Physical regions do not reproduce by producing offspring regions.

## Voxel Creature

In colony mode, each body contains 20–80 occupied cells drawn from a local 8 × 8 × 8 lattice. Distance constraints connect face neighbors and up to 20 diagonal neighbors. This 26-neighbor structure reduces the shear collapse of a face-only lattice. Only occupied cells are simulated, not all 512 potential cells. Four giants uses the larger bodies and extended constraints described below.

Seven materials are available: Soft, Rigid, Muscle X, Muscle Y, Muscle Z, Sensor, and Energy Storage. They differ in density, stiffness, damping, actuation, and nutrient uptake. Colony founders use seeded stochastic connected growth, without predefined species or gaits.

## Genome

`CreatureGenome.ts` directly encodes six floats per cell: occupancy, material, stiffness, amplitude, frequency, and phase. Each organism also inherits eight environmental preferences and four controller coefficients. Body cells use typed arrays rather than a JavaScript object per simulated voxel.

`Mutation.ts` changes voxel occupancy, material, stiffness, muscle amplitude/frequency/phase, preferences, and controller coefficients. A breadth-first search from the core rejects removals that disconnect the body. When addition and removal occur together, connectivity is checked against the occupancy after addition.

## Morphology

The `MorphologyGenerator` interface is separate from `DirectMorphologyGenerator`. Alternative generators such as CPPNs, L-systems, or NCAs can replace the generation stage. Outputs are active metadata, adjacency, and morphology descriptors.

Descriptors include voxel count, bounding-box ratios, exposed faces, compactness, X symmetry, mean stiffness, material fractions, and lattice center of mass. Symmetry is measured relative to the middle plane of the eight-cell lattice; it is not a pose-invariant classifier.

## GPU Simulation

The fixed timestep is 1/120 second. Ground loading and deformation run at the start of each step. Frame timing determines the number of steps, capped at eight per frame. On slower GPUs, simulated time may advance more slowly than wall time. The speed slider specifies a target multiplier.

After ground updates, each step dispatches these kernels in order:

1. `sensors.wgsl`: aggregates nutrient gradients, local gravity, and viscosity from sensor voxels.
2. `actuator.wgsl`: modulates amplitude and phase using a four-input linear controller followed by tanh. Axis-specific muscles periodically change rest-vector scales. Four giants uses authored coordinated contractions.
3. `voxelForces.wgsl`: samples the field at each voxel, applies gravity, drag, exposure-dependent viscous drag and material damping, then integrates motion.
4. `constraints.wgsl`: performs multiple compliant Jacobi PBD iterations, with mass weighting and symmetric degree normalization at both bond endpoints. **This is not full XPBD with accumulated Lagrange multipliers.**
5. `spatialGrid.wgsl`: clears the fixed 3D grid and builds voxel linked lists using atomic exchange.
6. `collision.wgsl`: applies repulsion between nearby voxels of different organisms across 27 neighboring cells, resolves ground and world bounds, applies adhesion-dependent Coulomb-like friction, and recomputes velocity.
7. `energy.wgsl`: reduces basal, muscle, strain and viscous costs, nutrient uptake, center of mass, distance, and local physical statistics per organism.
8. `physicsInfluence.wgsl`: deposits each organism’s preferences into occupied physics cells using fixed-point atomics.
9. `physicsField.wgsl`: averages influences, applies six-neighbor diffusion and seeded low-frequency mutation, and clamps parameters.

Motion arises from muscle contractions, constraints, external forces, and contact. There are no direct `walk`, `swim`, or `crawl` translation functions or target-directed propulsion forces.

### Memory layout and alignment

Data is explicitly packed in 16-byte-aligned WGSL `vec4f` units, matching CPU Float32Array offsets.

| Buffer | Stride | Contents |
|---|---:|---|
| Voxel state A/B | 64 B | Position and voxel energy; velocity and strain; previous position and nutrient sample; cost, uptake, strain, reserved |
| Voxel metadata | 64 B | Rest position and material; mass, stiffness, damping, creature ID; amplitude, frequency, phase, exposed faces; adjacency offset/count, lattice cell, body scale |
| Adjacency | 4 B | Neighbor active-voxel u32 index; rest length is derived from metadata |
| Actuator | 16 B | XYZ rest scales and actuation effort |
| Creature state | 128 B | Offset/count/energy/age; two preference vectors; controller; center/offspring; sensors; distance/cost/local gravity/viscosity; genome ID/birth time/generation/alive |
| Physics field A/B | 48 B | Gravity/drag; viscosity/adhesion/repulsion/falloff; nutrient availability/occupancy/latest law change/reserved |
| Influence deposits | 48 B | Twelve atomic i32 values: count, eight preference sums, and reserved entries; quantization factor 1024 |
| Spatial heads / next | 4 B each | Cell head or next index; −1 means empty |
| Simulation uniform | 96 B | Six vectors containing time, counts, mechanics, ecology, field evolution, seed, and ground/mode settings |
| Camera uniform | 112 B | Matrix and three vectors |

Integration, constraints, and collision use separate read/write voxel buffers. The field has its own pair of buffers. Command-encoder ordering synchronizes passes. Deposits use separate clear, atomic accumulation, and field-read passes; cross-workgroup synchronization is not assumed within a dispatch.

Colony buffers reserve maximum population × 80 voxels, but **only the active range is dispatched and rendered**. On births and deaths, the CPU repacks metadata and compacts survivor states through GPU-to-GPU copies. Existing positions and velocities are not read back and uploaded again. Generational changes do not reset the field.

Organisms occupy stable slots, while body voxels use dense packing. The colony UI supports up to 1,000 organisms, or 80,000 voxel capacity. Capacities above 100,000 require a memory-limit review.

### CPU readback

Once per simulated second, the application reads organism summaries (128 B × maximum count), the field snapshot (786,432 B), and the ground snapshot (67,600 B). This totals approximately 0.92 MB per simulated second with the 240-organism colony configuration. Birth and death processing can therefore lag by up to one simulated second. There is no per-frame position readback. Diagnostic experiments additionally read full body states.

Field mean/variance reductions on the GPU could further reduce snapshot traffic.

## Physics Field

The field is a separate 32 × 16 × 32 world grid spanning X/Z = −20…20 and Y = 0…20, with cell width 1.25. Each body voxel samples its nearest field cell independently, so different parts of the body can experience different forces.

Initial conditions have small random variations around gravity (0, −7, 0), drag 0.35, viscosity 0.3, and adhesion 0.5. No physical zones are authored in the normal world. Gravity magnitude is clamped to 0.5–20; drag, viscosity, adhesion, and repulsion to 0–5; and falloff to 0–4. Repulsion also serves as interaction strength in this simplified model.

A hash PRNG introduces mutation every 120 steps. The field is not replaced by time-dependent sine noise. Diffusion relaxes values toward neighboring averages. Modified conditions persist after an organism dies.

## Coevolution

The colony loop connects voxel-level field sampling, motion and deformation, energy expenditure and uptake, reproduction above an energy threshold, inherited mutation, and subsequent changes to local physical conditions.

Influence depends on body-voxel density in each field cell. No particular gravity value is declared an optimal fitness target. Costs depend on actual metabolic, muscle, strain, and viscous state.

Nutrients combine a continuous spatial function with GPU resource availability. Occupancy depletes availability and time restores it, independently of the physics-evolution toggle. Uptake decreases with height above the ground; Energy Storage material increases uptake efficiency. This is neither conservative fluid/chemical transport nor a closed thermodynamic system.

After age eight seconds, an eligible parent transfers 42% of its energy to its child and pays an additional five-unit birth cost. Reproduction requires free capacity. Organisms die at energy ≤ 0. There is no automatic replacement after extinction, batch selection by generation, or manual species labeling. Four giants disables this lifecycle for observation.

## Rendering and Controls

The initial body style is **Smooth mesh**. **Body rendering** also provides **Voxels** and **Wireframe**. Raw WebGPU reads physical GPU buffers directly. Smooth surfaces share one indexed mesh batch; voxel cubes use an instanced draw. Three.js provides camera, orbit controls, and cube geometry. The UI uses React and Shadcn controls.

Nine visualization modes cover Creature, Material, Stress, Gravity, Drag, Viscosity, Adhesion, Energy, and Physics Diversity. Controls include XY/XZ/YZ slices, slice position, gravity-vector spacing, bodies, and sensors. The field slice shows the selected scalar, defaulting to gravity magnitude for Creature, Material, and Stress. Physics Diversity coloring represents local deviation from the initial reference, not the spatial variance metric. Energy coloring shows nutrient availability.

### Continuous deforming mesh

`SurfaceMesh.ts` builds a Gaussian density field from rest positions and extracts a closed surface using marching tetrahedra. Alternating positive and negative Laplacian smoothing reduces lattice corners. Surfaces are generated at initialization and birth; mutated offspring receive a new surface.

Each surface vertex binds to eight nearby physical voxels using regularized moving-least-squares weights. `skin.wgsl` deforms the surface on the GPU. The rendering shader recomputes smooth normals from deformed triangles and interpolates material colors and stress. Skinning does not add CPU position readback.

Skin metadata uses 96 B per vertex, deformed state 32 B per vertex, and u32 triangle/normal-adjacency indices. Stable creature slots resolve current voxel offsets after compaction. The seed-2048 colony has about 262,640 surface vertices and 524,384 triangles.

**Inspect organism** follows one organism; **World view** returns to the full world. Inspection hides other bodies and field overlays while all physics continues. If the target dies, the camera returns to the world. Sensor colors changes emphasis without making holes.

The organism surface is visual geometry over voxel physics, not a continuum/FEM body. Severe folding can cause self-intersections. Local skinning does not guarantee exact volume preservation or rotational reconstruction. Smooth meshes require more rendering memory and work than cubes. The voxel view uses world-axis-aligned cubes. Full-volume raymarching is not implemented.

### Wireframe

Wireframe draws only the triangle edges, deduplicated so each edge is drawn once. Faces are omitted and rear edges remain visible. It uses the same deformed GPU vertices as Smooth mesh, so style changes preserve the ongoing physical state. Ground rendering remains visible.

## Metrics

Metrics are recorded each simulated second: population, active voxels, births/deaths, mean size and energy, mean lifetime of deceased organisms, mean offspring of survivors, movement distance, distance per cumulative energy expenditure, and mean generation.

- Genome diversity: approximate occupancy/material distance for up to 64 adjacent organism pairs, not all inherited parameters.
- Genome fingerprint: order-independent 32-bit aggregate hash of genes, preferences, and controllers. Hash collisions are possible; use original genomes for scientific identity checks.
- Morphology diversity: normalized descriptor distance for up to 64 pairs.
- Material distribution: fraction of active voxels in each material.
- Size histogram: colony body-size bins spanning 20–80 voxels.
- Physics diversity: Var(|gravity|)/400 + Var(drag)/25 + Var(viscosity)/25.
- Gravity, drag, and viscosity means and variances.
- Pearson correlations for stiffness versus local gravity, size versus local gravity, and muscle fraction versus local viscosity. Samples are averaged over each body; insufficient variance returns null.

Correlation does not establish causation. Use **Run 4 success tests** for controls. JSON exports include initial settings, timed parameter changes, records, current genomes, latest field/ground snapshots, and validation results (schema version 2).

## Experiments

Four presets provide Fixed, Slow, Strong, and Unstable physical evolution. Presets affect the current world; Reset reconstructs it from the seed. Seed and population changes take effect on Reset.

The original GPU validation suite uses a flat floor and performs:

1. A single matched-seed organism with muscles OFF/ON and no horizontal gravity. Measure displacement and deformation for 14 seconds after four seconds of settling.
2. The same genome at x = −10/+10 in a diagnostic field with local gravity magnitudes 2/14. These authored zones are used only in this diagnostic.
3. A 120-second field-diversity comparison, including an influence = 0 ablation with matching mutation and diffusion.
4. Fixed versus coevolving environments for 120 seconds with 32 matched founders and matching nutrients. Check initial genome hashes and divergence in lifecycle, morphology, size histogram, material distribution, and genome fingerprint.

Tests run the actual GPU compute kernels. Their thresholds are engineering smoke tests, not substitutes for multiple seeds, GPUs, or long-term statistical research.

## Performance

The colony target is 200–500 organisms, 5,000–20,000 active voxels, and 60 FPS. The 240-organism configuration has been observed on hardware. Display FPS measures rendering frequency, not kernel timing through GPU timestamp queries. See `VALIDATION.md` for measured runs and seeds.

Colony constraint work is O(active voxels × 26 × iterations); field updates are O(16,384). Collision searches 27 neighboring linked lists with a limit of 96 candidates per cell. This avoids an all-pairs O(N²) scan but omits candidates in crowded cells, limiting dense-contact accuracy.

## Limitations

- Compliant Jacobi PBD and spherical proximity repulsion are approximations. Full XPBD, FEM, exact volume preservation, self-collision, damage, and fracture are not implemented.
- Nearest-cell sampling has boundary discontinuities; trilinear sampling is a possible extension.
- Environmental modification has no dedicated energy cost, and resources are not conserved.
- Physical regions do not reproduce; physical evolution means modification, mutation, diffusion, and spatial persistence.
- Reproduction stops at capacity. Long-term speciation and open-ended evolution are not guaranteed.
- Seeds reproduce initial genomes, fields, CPU mutation, and GPU hashes. Floating-point behavior, parallel collision order, and hardware differences prevent guaranteed bitwise trajectories.
- Performance at 50,000–100,000 voxels requires separate validation.

## Future Work

XPBD multipliers, volume/shear constraints, GPU field reductions, resource diffusion, field-modification costs, asynchronous staging rings, GPU compaction, multi-seed statistics, lineage trees, genome clustering, CPPN/NCA morphology, growth, repair, fission/fusion, predation, symbiosis, and sexual reproduction.

Modules separate organism management (`CreatureManager`), development (`MorphologyGenerator`), compute kernels (`VoxelPhysics`), stepping and buffer lifetimes (`Simulation`), initial fields (`PhysicsField`), observation (`Metrics`), and rendering (`Renderer`).

## Technical References

- [WebGPU specification](https://www.w3.org/TR/webgpu/)
- [WGSL specification and alignment rules](https://www.w3.org/TR/WGSL/)
- [Three.js WebGPU renderer documentation](https://threejs.org/docs/pages/WebGPURenderer.html)

These inform API and memory design; they are not evidence for this model’s scientific validity.

## Deformable Ground

**Soft ground** starts enabled. Lower **Ground stiffness** produces deeper depressions. The heightfield has 65 × 65 vertices, 64 × 64 quads, 8,192 triangles, and spacing 0.625. It remains visible during inspection. Field slices start hidden so surface shape and lighting are visible.

The GPU approximates contact loads from nearby voxel mass and downward gravity, distributing them to four ground vertices through fixed-point atomics. The ground is an overdamped elastic foundation:

```text
heightRate = (3 × neighborLaplacian − stiffness × height − load) / damping
stiffness = controlValue × (1 + localRepulsion × 0.3)
damping = 3 + localViscosity × 12
```

Changing local gravity, viscosity, and repulsion changes the ground response. The ground has no separate genome.

Height and velocity remain on the GPU. Rendering, voxel contact, and nutrient height attenuation use the same triangle interpolation. Contact correction follows the surface normal; friction uses motion relative to the ground’s vertical velocity. Nutrient attenuation uses height above the surface so sinking alone does not increase uptake. Disabling soft ground returns it gradually to a plane within the speed limit. For a strictly flat control, disable it and Reset.

This is an approximate visual/contact model, not conservative soil mechanics or FEM. It does not reproduce full contact reaction impulses, plasticity, excavation, or lateral soil motion. Boundaries are fixed; depth is limited to 1.2 and vertical speed to 0.6 world units per second. Contact constrains voxel centers, but visual skin may locally intersect the ground. Changing the supporting surface also changes ecological trajectories.

**Test ground response** uses separate diagnostic worlds with the same seed and body. It compares stiffness, viscosity, contact, and a flat control. The body loads the ground for 12 seconds, then is removed for two seconds of recovery measurement. Results are available in the UI and JSON export.

## Four Giants

Four authored connected genomes generate Ribbon (32 voxels), Crawler (88), Star (56), and Roller (88). The total is 264 physical voxels, with spacing 0.87—three times the colony spacing. Mass and density remain model values; this is not a physically scaled material specimen. This mode reserves 4 × 512 voxel capacity and processes only active voxels.

Up to 124 neighboring constraints and 40 solver iterations support the bodies. Coordinated muscles produce traveling waves, alternating leg extensions, radial flexion, and circumferential contraction. Contact grip also follows muscle phase. Translation and rotation are not directly keyframed. Compensating stretch components approximate volume retention, without guaranteeing conservation. Folding and skin self-intersection remain possible.

Use **Ribbon**, **Crawler**, **Star**, or **Roller** to follow a body, and **World view** for the full scene. Each body has a distinct color. Ground contact uses the enlarged voxel radius. Energy is replenished every step, and births and deaths are disabled for continuous observation. These are authored bodies and gaits, not evolved behaviors. Field evolution starts disabled but can be enabled. Switching World mode reinitializes the world.

**Test four-body motion** runs muscles ON/OFF for 16 seconds each and compares the final 12 seconds. It measures cumulative horizontal center-of-mass travel at 0.5-second intervals (not net displacement), maximum centered voxel-motion RMS (including rotation), and changes in a two-marker axis. Roller additionally requires more than 90 degrees of net XY-projected marker rotation. This is a deforming-body marker measure, not an exact rigid-body orientation. Minimum voxel-center clearance above the ground is also checked.
