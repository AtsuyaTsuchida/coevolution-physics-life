@group(0) @binding(1) var<storage,read> srcState:array<Voxel>;
@group(0) @binding(2) var<storage,read_write> heads:array<atomic<i32>>;
@group(0) @binding(3) var<storage,read_write> next:array<i32>;
@compute @workgroup_size(128) fn clear(@builtin(global_invocation_id) id:vec3u){if(id.x<16384u){atomicStore(&heads[id.x],-1);}}
@compute @workgroup_size(128) fn build(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=u32(params.counts.x)){return;}next[i]=atomicExchange(&heads[cellIndex(cellAt(srcState[i].position.xyz))],i32(i));}
