struct Voxel {position:vec4f,velocity:vec4f,previous:vec4f,bio:vec4f}
struct Meta {rest:vec4f,physical:vec4f,actuator:vec4f,links:vec4f}
struct Creature {info:vec4f,preference0:vec4f,preference1:vec4f,controller:vec4f,center:vec4f,sensor:vec4f,stats:vec4f,lineage:vec4f}
struct SkinVertex {bones0:vec4u,bones1:vec4u,weights0:vec4f,weights1:vec4f,residual:vec4f,info:vec4u}
struct SkinState {position:vec4f,pigment:vec4f}
@group(0) @binding(0) var<storage,read> voxels:array<Voxel>;
@group(0) @binding(1) var<storage,read> bodyMeta:array<Meta>;
@group(0) @binding(2) var<storage,read> creatures:array<Creature>;
@group(0) @binding(3) var<storage,read> skin:array<SkinVertex>;
@group(0) @binding(4) var<storage,read_write> deformed:array<SkinState>;
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=arrayLength(&skin)){return;}let s=skin[i];let offset=u32(creatures[s.info.x].info.x);var p=s.residual.xyz;var color=vec3f(0);var stress=0.;var sensor=0.;var sum=0.;let palette=array<vec3f,7>(vec3f(.4,.77,.69),vec3f(.68,.76,.8),vec3f(.91,.64,.45),vec3f(.87,.52,.49),vec3f(.8,.67,.47),vec3f(.6,.72,.96),vec3f(.86,.79,.43));for(var k=0u;k<8u;k++){let localIndex=select(s.bones0[k%4u],s.bones1[k%4u],k>=4u);let w=select(s.weights0[k%4u],s.weights1[k%4u],k>=4u);let index=offset+localIndex;p+=voxels[index].position.xyz*w;let influence=max(0.,w);let material=u32(bodyMeta[index].rest.w);color+=palette[material]*influence;stress+=voxels[index].velocity.w*influence;sensor+=select(0.,influence,material==5u);sum+=influence;}deformed[i].position=vec4f(p,stress/max(.001,sum));deformed[i].pigment=vec4f(color/max(.001,sum),sensor/max(.001,sum));}
