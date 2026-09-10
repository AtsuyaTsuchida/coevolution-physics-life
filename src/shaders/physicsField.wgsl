struct Deposit {values:array<i32,12>}
@group(0) @binding(1) var<storage,read> srcState:array<Field>;
@group(0) @binding(2) var<storage,read_write> dstState:array<Field>;
@group(0) @binding(3) var<storage,read> deposits:array<Deposit>;
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=16384u){return;}var f=srcState[i];let cell=vec3i(i32(i%32u),i32(i/32u%16u),i32(i/512u));let dt=params.clock.y;let count=f32(deposits[i].values[0]);
 // Resource depletion continues in the fixed-physics control as well.
 f.nutrientState.x=clamp(f.nutrientState.x+dt*(.12*(1.-f.nutrientState.x)-.006*count),.03,1.);
 if(params.evolution.w>.5){var a=vec4f(0);var b=vec4f(0);var n=0.;for(var axis=0u;axis<3u;axis++){for(var s=-1;s<=1;s+=2){var c=cell;c[axis]+=s;if(any(c<vec3i(0))||any(c>vec3i(31,15,31))){continue;}let other=srcState[cellIndex(c)];a+=other.gravityDrag;b+=other.medium;n+=1.;}}f.gravityDrag+=(a/n-f.gravityDrag)*params.evolution.z*dt;f.medium+=(b/n-f.medium)*params.evolution.z*dt;
 if(count>0.){var target0=vec4f(0);var target1=vec4f(0);for(var j=0u;j<4u;j++){target0[j]=f32(deposits[i].values[j+1u])/(1024.*count);target1[j]=f32(deposits[i].values[j+5u])/(1024.*count);}let rate=1.-exp(-params.evolution.x*dt*min(count,12.)*.2);f.gravityDrag=mix(f.gravityDrag,target0,rate);f.medium=mix(f.medium,target1,rate);}
 let tick=u32(params.clock.z);if(tick%120u==0u){let seed=u32(params.random.x)+i*13u+tick*671u;let mutation=params.evolution.y;f.gravityDrag+=vec4f(rnd(seed),rnd(seed+1u),rnd(seed+2u),rnd(seed+3u))*2.*mutation-vec4f(mutation);f.medium+=vec4f(rnd(seed+4u),rnd(seed+5u),rnd(seed+6u),rnd(seed+7u))*2.*mutation-vec4f(mutation);}
 let gravity=f.gravityDrag.xyz;let mag=max(length(gravity),.0001);f.gravityDrag=vec4f(gravity/mag*clamp(mag,.5,20.),clamp(f.gravityDrag.w,0.,5.));f.medium=clamp(f.medium,vec4f(0),vec4f(5,5,5,4));}
 f.nutrientState.y=count;f.nutrientState.z=length(f.gravityDrag-srcState[i].gravityDrag)+length(f.medium-srcState[i].medium);dstState[i]=f;}
