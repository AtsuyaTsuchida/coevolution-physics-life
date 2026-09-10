struct Camera { vp:mat4x4f, eye:vec4f, visual:vec4f, options:vec4f }
struct Voxel {position:vec4f,velocity:vec4f,previous:vec4f,bio:vec4f}
struct Meta {rest:vec4f,physical:vec4f,actuator:vec4f,links:vec4f}
struct Field {gravityDrag:vec4f,medium:vec4f,nutrientState:vec4f}
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var<storage,read> voxels:array<Voxel>;
@group(0) @binding(2) var<storage,read> bodyMeta:array<Meta>;
@group(0) @binding(3) var<storage,read> field:array<Field>;
struct SkinVertex {bones0:vec4u,bones1:vec4u,weights0:vec4f,weights1:vec4f,residual:vec4f,info:vec4u}
struct SkinState {position:vec4f,pigment:vec4f}
@group(0) @binding(4) var<storage,read> skin:array<SkinVertex>;
@group(0) @binding(5) var<storage,read> skinState:array<SkinState>;
@group(0) @binding(6) var<storage,read> normalLinks:array<u32>;
@group(0) @binding(7) var<storage,read> terrain:array<vec4f>;
struct Out {@builtin(position) clip:vec4f,@location(0) color:vec3f,@location(1) world:vec3f,@location(2) normal:vec3f,@location(3) @interpolate(flat) kind:u32}
fn idx(p:vec3f)->u32{let c=clamp(vec3i(floor((p+vec3f(20,0,20))/1.25)),vec3i(0),vec3i(31,15,31));return u32(c.x+c.y*32+c.z*512);}
fn giantColor(i:u32)->vec3f{let colors=array<vec3f,4>(vec3f(.2,.85,.72),vec3f(.96,.55,.24),vec3f(.45,.61,.98),vec3f(.82,.4,.78));return colors[i%4u];}
fn ramp(t:f32)->vec3f{let x=clamp(t,0.,1.);return mix(mix(vec3f(.07,.25,.34),vec3f(.32,.73,.73),min(1.,x*2.)),vec3f(.95,.72,.4),max(0.,x*2.-1.));}
fn fieldValue(f:Field)->f32{let mode=u32(camera.visual.x);switch(mode){case 4u:{return f.gravityDrag.w/5.;}case 5u:{return f.medium.x/5.;}case 6u:{return f.medium.y/5.;}case 7u:{return f.nutrientState.x;}case 8u:{return clamp(abs(length(f.gravityDrag.xyz)-7.)/6.+abs(f.medium.x-.3)/3.,0.,1.);}default:{return length(f.gravityDrag.xyz)/15.;}}}
@vertex fn voxelVs(@location(0) p:vec3f,@location(1) n:vec3f,@builtin(instance_index) i:u32)->Out{let v=voxels[i];let m=bodyMeta[i];var o:Out;var colors=array<vec3f,7>(vec3f(.4,.77,.69),vec3f(.68,.76,.8),vec3f(.91,.64,.45),vec3f(.87,.52,.49),vec3f(.8,.67,.47),vec3f(.6,.72,.96),vec3f(.86,.79,.43));var color=colors[u32(m.rest.w)];let mode=u32(camera.visual.x);if(mode==0u){let k=m.physical.w*.618; color=mix(vec3f(.27,.66,.62),vec3f(.78,.86,.56),fract(k));}if(mode==2u){color=ramp(v.velocity.w*4.);}if(mode>=3u){color=ramp(fieldValue(field[idx(v.position.xyz)]));}if(mode==0u&&camera.eye.w>.5){color=giantColor(u32(m.physical.w));}var size=.274*max(1.,m.links.w);if(m.rest.w==5.&&camera.visual.y<.5){size=0.;}o.world=v.position.xyz+p*size;o.clip=camera.vp*vec4f(o.world,1);o.color=color;o.normal=n;o.kind=0u;if(camera.options.w>0.&&u32(camera.options.w)-1u!=u32(m.physical.w)){o.clip=vec4f(2,2,2,1);}return o;}
@vertex fn meshVs(@builtin(vertex_index) i:u32)->Out {
 let s=skin[i];let v=skinState[i];var n=vec3f(0);
 for(var k=0u;k<s.info.z;k++){let a=normalLinks[s.info.y+k*2u];let b=normalLinks[s.info.y+k*2u+1u];n+=cross(skinState[a].position.xyz-v.position.xyz,skinState[b].position.xyz-v.position.xyz);}
 var color=v.pigment.rgb;let mode=u32(camera.visual.x);
 if(camera.visual.y<.5){color=mix(color,vec3f(.4,.77,.69),v.pigment.w);}
 if(mode==0u){color=mix(vec3f(.27,.66,.62),vec3f(.78,.86,.56),fract(f32(s.info.x)*.618));}
 if(mode==2u){color=ramp(v.position.w*4.);}
 if(mode>=3u){color=ramp(fieldValue(field[idx(v.position.xyz)]));}
 if(mode==0u&&camera.eye.w>.5){color=giantColor(s.info.x);}
 var o:Out;o.world=v.position.xyz;o.clip=camera.vp*vec4f(o.world,1);o.color=color;o.normal=select(vec3f(0,1,0),n/max(length(n),.000001),length(n)>.000001);o.kind=4u;if(camera.options.w>0.&&u32(camera.options.w)-1u!=s.info.x){o.clip=vec4f(2,2,2,1);}return o;
}
fn plane(v:u32,y:f32)->vec3f{let corners=array<vec2f,6>(vec2f(-20,-20),vec2f(20,-20),vec2f(-20,20),vec2f(-20,20),vec2f(20,-20),vec2f(20,20));return vec3f(corners[v].x,y,corners[v].y);}
@vertex fn groundVs(@builtin(vertex_index) v:u32)->Out{let offsets=array<vec2u,6>(vec2u(0,0),vec2u(0,1),vec2u(1,0),vec2u(1,0),vec2u(0,1),vec2u(1,1));let quad=v/6u;let c=vec2u(quad%64u,quad/64u)+offsets[v%6u];let k=c.x+c.y*65u;let p=vec2f(c)*.625-20.;let g=groundSample(p);var o:Out;o.world=vec3f(p.x,terrain[k].x,p.y);o.clip=camera.vp*vec4f(o.world,1);o.normal=normalize(vec3f(-g.y,1.,-g.z));o.color=vec3f(.13,.24,.27);o.kind=1u;return o;}
@vertex fn sliceVs(@builtin(vertex_index) v:u32)->Out{var o:Out;var p=plane(v,.025+camera.visual.z*19.);let axis=u32(camera.visual.w);if(axis==0u){p=vec3f(-20.+camera.visual.z*40.,(p.x+20.)*.5,p.z);}if(axis==2u){p=vec3f(p.x,(p.z+20.)*.5,-20.+camera.visual.z*40.);}o.world=p;o.clip=camera.vp*vec4f(p,1);o.normal=vec3f(0,1,0);o.color=vec3f(0);o.kind=2u;return o;}
@vertex fn arrowVs(@builtin(vertex_index) v:u32,@builtin(instance_index) i:u32)->Out{let step=u32(camera.options.z);let columns=(32u+step-1u)/step;let x=i%columns*step;let z=i/columns*step;let p=vec3f(-19.375+f32(x)*1.25,1.6+camera.visual.z*15.,-19.375+f32(z)*1.25);let g=field[idx(p)].gravityDrag.xyz;let end=p+normalize(g)*clamp(length(g)*.13,.4,1.8);var q=p;switch(v){case 1u,2u,4u:{q=end;}case 3u:{q=end-normalize(g)*.22+vec3f(.15,0,0);}case 5u:{q=end-normalize(g)*.22-vec3f(.15,0,0);}default:{}}
 var o:Out;o.world=q;o.clip=camera.vp*vec4f(q,1);o.normal=vec3f(0,1,0);o.color=vec3f(.48,.81,.87);o.kind=3u;return o;}
@fragment fn fs(i:Out)->@location(0) vec4f{var color=i.color;var alpha=1.;if(i.kind==0u||i.kind==4u){let diffuse=.48+.52*max(0.,dot(normalize(i.normal),normalize(vec3f(-.4,.8,.6))));color*=diffuse;
 if(i.kind==4u){let view=normalize(camera.eye.xyz-i.world);let halfVector=normalize(view+normalize(vec3f(-.4,.8,.6)));let highlight=pow(max(0.,dot(normalize(i.normal),halfVector)),36.);let rim=pow(1.-max(0.,dot(normalize(i.normal),view)),3.);color+=vec3f(.65,.85,.83)*highlight*.28+vec3f(.12,.22,.22)*rim*.28;}
 }
 if(i.kind==1u){color*=.35+.65*max(0.,dot(normalize(i.normal),normalize(vec3f(-.6,.7,.3))));color+=vec3f(.04,.09,.085)*clamp(-i.world.y,0.,1.);let line=min(abs(fract(i.world.x)-.5),abs(fract(i.world.z)-.5));let edge=1.-smoothstep(.005,.045,line);color+=vec3f(.022,.04,.05)*edge;let major=min(abs(fract(i.world.x/5.)-.5),abs(fract(i.world.z/5.)-.5));color+=vec3f(.02,.035,.042)*(1.-smoothstep(.002,.01,major));}
 if(i.kind==2u){color=ramp(fieldValue(field[idx(i.world)]));alpha=.38;let c=fract((i.world.xz+20.)/1.25);let edge=min(min(c.x,c.y),min(1.-c.x,1.-c.y));color*=.8+.2*smoothstep(0.,.035,edge);}
 let fog=1.-exp(-length(camera.eye.xyz-i.world)*.006);color=mix(color,vec3f(.055,.102,.13),fog);return vec4f(color,alpha);}

@fragment fn wireFs(i:Out)->@location(0) vec4f {return vec4f(i.color*.85+vec3f(.15),.55);}
