@group(0) @binding(1) var<storage,read> srcState:array<Voxel>;
@group(0) @binding(2) var<storage,read_write> dstState:array<Voxel>;
@group(0) @binding(3) var<storage,read> bodyMeta:array<Meta>;
@group(0) @binding(4) var<storage,read> field:array<Field>;
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=u32(params.counts.x)){return;}var v=srcState[i];let m=bodyMeta[i];let f=field[cellIndex(cellAt(v.position.xyz))];let dt=params.clock.y;let drag=f.gravityDrag.w+f.medium.x*(.3+m.actuator.w*.25);v.previous=vec4f(v.position.xyz,nutrient(v.position.xyz));v.velocity=vec4f((v.velocity.xyz+f.gravityDrag.xyz*dt)/(1.+dt*(drag+m.physical.z)),v.velocity.w);v.position=vec4f(v.position.xyz+v.velocity.xyz*dt,v.position.w);dstState[i]=v;}
