@group(0) @binding(1) var<storage,read> bodyMeta:array<Meta>;
@group(0) @binding(2) var<storage,read> creatures:array<Creature>;
@group(0) @binding(3) var<storage,read_write> actuators:array<vec4f>;
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=u32(params.counts.x)){return;}let m=bodyMeta[i];let c=creatures[u32(m.physical.w)];let signal=tanh(dot(c.sensor,c.controller));let phase=m.actuator.z+signal*.8;let amplitude=clamp(m.actuator.x*params.mechanical.y*(1.+signal*.35),0.,.4);var stretch=vec3f(1);if(m.rest.w>=2.&&m.rest.w<=4.){stretch[u32(m.rest.w)-2u]+=amplitude*sin(6.2831853*m.actuator.y*params.clock.x+phase);}if(params.random.w>.5){
 let t=6.2831853*m.actuator.y*params.clock.x;let wave=sin(t+m.actuator.z);let amp=.55*params.mechanical.y;let kind=u32(m.physical.w);
 if(kind==0u){stretch=vec3f(1.+amp*wave,1./sqrt(1.+amp*wave),1./sqrt(1.+amp*wave));}
 if(kind==1u){let q=1.+amp*wave;stretch=vec3f(1.+.22*params.mechanical.y*cos(t+m.actuator.z),q,1./sqrt(q));}
 if(kind==2u){let q=1.+amp*wave;stretch=vec3f(1./sqrt(q),q,1./sqrt(q));}
 if(kind==3u){let q=1.+.6*params.mechanical.y*wave;stretch=vec3f(q,1./q,1.);}
 }actuators[i]=vec4f(stretch,abs(amplitude*6.2831853*m.actuator.y*cos(6.2831853*m.actuator.y*params.clock.x+phase))*select(0.,1.,m.rest.w>=2.&&m.rest.w<=4.));}
