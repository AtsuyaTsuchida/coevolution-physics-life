@group(0) @binding(1) var<storage,read> srcState:array<Voxel>;
@group(0) @binding(2) var<storage,read_write> dstState:array<Voxel>;
@group(0) @binding(3) var<storage,read> bodyMeta:array<Meta>;
@group(0) @binding(4) var<storage,read> field:array<Field>;
@group(0) @binding(5) var<storage,read> heads:array<i32>;
@group(0) @binding(6) var<storage,read> next:array<i32>;
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=u32(params.counts.x)){return;}var v=srcState[i];let m=bodyMeta[i];let cell=cellAt(v.position.xyz);let f=field[cellIndex(cell)];var push=vec3f(0);var hits=0.;for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){let c=cell+vec3i(x,y,z);if(any(c<vec3i(0))||any(c>vec3i(31,15,31))){continue;}var j=heads[cellIndex(c)];var visits=0u;loop{if(j<0||visits>=96u){break;}let k=u32(j);if(bodyMeta[k].physical.w!=m.physical.w){let d=v.position.xyz-srcState[k].position.xyz;let l=length(d);if(l<.29&&l>.00001){push+=d/l*(.29*pow((.29-l)/.29,max(.5,f.medium.w)))*.5*clamp(f.medium.z,0.,2.);hits+=1.;}}j=next[k];visits++;}}}}
 v.position=vec4f(v.position.xyz+push/max(1.,hits),v.position.w);v.position=vec4f(clamp(v.position.xyz,vec3f(-19.8,.145,-19.8),vec3f(19.8,19.8,19.8)),v.position.w);if(v.position.y<=.146){let delta=v.position.xyz-v.previous.xyz;let friction=clamp((.15+f.medium.y*.6)*abs(f.gravityDrag.y)*params.clock.y*params.clock.y/max(length(delta.xz),.00001),0.,1.);v.position.x-=delta.x*friction;v.position.z-=delta.z*friction;}
 let velocity=(v.position.xyz-v.previous.xyz)/params.clock.y;v.velocity=vec4f(velocity*min(1.,12./max(length(velocity),.001)),v.velocity.w);dstState[i]=v;}
