@group(0) @binding(1) var<storage,read> voxels:array<Voxel>;
@group(0) @binding(2) var<storage,read> bodyMeta:array<Meta>;
@group(0) @binding(3) var<storage,read_write> creatures:array<Creature>;
@group(0) @binding(4) var<storage,read> field:array<Field>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=u32(params.counts.y)||creatures[i].lineage.w<.5){return;}let c=creatures[i];var s=vec4f(0);var n=0.;for(var j=u32(c.info.x);j<u32(c.info.x+c.info.y);j++){if(bodyMeta[j].rest.w!=5.){continue;}let p=voxels[j].position.xyz;let f=field[cellIndex(cellAt(p))];let g=vec3f(nutrient(p+vec3f(.2,0,0))-nutrient(p-vec3f(.2,0,0)),f.gravityDrag.y/20.,nutrient(p+vec3f(0,0,.2))-nutrient(p-vec3f(0,0,.2)));s+=vec4f(g,f.medium.x/5.);n+=1.;}creatures[i].sensor=s/max(1.,n);}
