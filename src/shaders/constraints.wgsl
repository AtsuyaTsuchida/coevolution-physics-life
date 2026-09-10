@group(0) @binding(1) var<storage,read> srcState:array<Voxel>;
@group(0) @binding(2) var<storage,read_write> dstState:array<Voxel>;
@group(0) @binding(3) var<storage,read> bodyMeta:array<Meta>;
@group(0) @binding(4) var<storage,read> adjacency:array<u32>;
@group(0) @binding(5) var<storage,read> act:array<vec4f>;
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=u32(params.counts.x)){return;}var v=srcState[i];let m=bodyMeta[i];var correction=vec3f(0);var stress=0.;let n=u32(m.links.y);for(var k=0u;k<n;k++){let j=adjacency[u32(m.links.x)+k];let other=bodyMeta[j];let d=v.position.xyz-srcState[j].position.xyz;let len=max(length(d),.00001);let restVector=(m.rest.xyz-other.rest.xyz)*(.5*(act[i].xyz+act[j].xyz));let restLength=length(restVector);let error=len-restLength;let inv=1./m.physical.x;let invOther=1./other.physical.x;let stiff=min(m.physical.y,other.physical.y);let alpha=(1.-stiff)*.00001/(params.clock.y*params.clock.y);correction-=d/len*error*inv/(inv+invOther+alpha)/max(1.,max(m.links.y,other.links.y));stress+=abs(error)/max(restLength,.001);}
 v.position=vec4f(v.position.xyz+correction * params.mechanical.x,v.position.w);v.velocity.w=stress/max(1.,f32(n));dstState[i]=v;}
