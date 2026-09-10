struct Deposit {values:array<atomic<i32>,12>}
@group(0) @binding(1) var<storage,read> voxels:array<Voxel>;
@group(0) @binding(2) var<storage,read> bodyMeta:array<Meta>;
@group(0) @binding(3) var<storage,read> creatures:array<Creature>;
@group(0) @binding(4) var<storage,read_write> deposits:array<Deposit>;
@compute @workgroup_size(128) fn clear(@builtin(global_invocation_id) id:vec3u){if(id.x>=16384u){return;}for(var j=0u;j<12u;j++){atomicStore(&deposits[id.x].values[j],0);}}
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=u32(params.counts.x)){return;}let c=creatures[u32(bodyMeta[i].physical.w)];let k=cellIndex(cellAt(voxels[i].position.xyz));atomicAdd(&deposits[k].values[0],1);for(var j=0u;j<4u;j++){atomicAdd(&deposits[k].values[j+1u],i32(round(c.preference0[j]*1024.)));atomicAdd(&deposits[k].values[j+5u],i32(round(c.preference1[j]*1024.)));}}
