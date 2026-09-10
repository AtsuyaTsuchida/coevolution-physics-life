@group(0) @binding(1) var<storage,read> terrain:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> nextTerrain:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> loads:array<atomic<i32>>;
@group(0) @binding(4) var<storage,read> voxels:array<Voxel>;
@group(0) @binding(5) var<storage,read> bodyMeta:array<Meta>;
@group(0) @binding(6) var<storage,read> field:array<Field>;
@compute @workgroup_size(128) fn clear(@builtin(global_invocation_id) id:vec3u){if(id.x<4225u){atomicStore(&loads[id.x],0);}}
@compute @workgroup_size(128) fn deposit(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=u32(params.counts.x)||params.random.y<.5){return;}let p=voxels[i].position.xyz;let g=groundSample(p.xz);let contact=clamp(1.-(p.y-g.x-.145*max(1.,bodyMeta[i].links.w))/.3,0.,1.);if(contact<=0.){return;}let f=field[cellIndex(cellAt(p))];let weight=bodyMeta[i].physical.x*max(0.,-f.gravityDrag.y)*contact*.5;let uv=clamp((p.xz+20.)/.625,vec2f(0),vec2f(63.9999));let c=vec2u(floor(uv));let t=fract(uv);let k=c.x+c.y*65u;
 atomicAdd(&loads[k],i32(weight*(1.-t.x)*(1.-t.y)*4096.));atomicAdd(&loads[k+1u],i32(weight*t.x*(1.-t.y)*4096.));atomicAdd(&loads[k+65u],i32(weight*(1.-t.x)*t.y*4096.));atomicAdd(&loads[k+66u],i32(weight*t.x*t.y*4096.));}
@compute @workgroup_size(128) fn update(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=4225u){return;}let x=i%65u;let z=i/65u;if(x==0u||x==64u||z==0u||z==64u){nextTerrain[i]=vec4f(0);return;}
 let old=terrain[i].x;let p=vec3f(f32(x)*.625-20.,old,f32(z)*.625-20.);let f=field[cellIndex(cellAt(p))];let load=f32(atomicLoad(&loads[i]))/4096.;let lap=terrain[i-1u].x+terrain[i+1u].x+terrain[i-65u].x+terrain[i+65u].x-4.*old;
 // Overdamped elastic foundation. Medium repulsion stiffens it; viscosity delays recovery.
 let stiffness=params.random.z*(1.+f.medium.z*.3);let damping=3.+12.*f.medium.x;
 var speed=clamp((3.*lap-stiffness*old-load)/damping,-.6,.6);if(params.random.y<.5){speed=clamp(-old*8.,-.6,.6);}
 let h=clamp(old+speed*params.clock.y,-1.2,0.);nextTerrain[i]=vec4f(h,(h-old)/params.clock.y,load,0.);}
