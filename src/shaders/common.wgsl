struct Voxel { position:vec4f, velocity:vec4f, previous:vec4f, bio:vec4f }
struct Meta { rest:vec4f, physical:vec4f, actuator:vec4f, links:vec4f }
struct Creature { info:vec4f, preference0:vec4f, preference1:vec4f, controller:vec4f, center:vec4f, sensor:vec4f, stats:vec4f, lineage:vec4f }
struct Field { gravityDrag:vec4f, medium:vec4f, nutrientState:vec4f }
struct Params { clock:vec4f, counts:vec4f, mechanical:vec4f, ecology:vec4f, evolution:vec4f, random:vec4f }
@group(0) @binding(0) var<uniform> params:Params;
fn cellAt(p:vec3f)->vec3i{return clamp(vec3i(floor((p+vec3f(20,0,20))/1.25)),vec3i(0),vec3i(31,15,31));}
fn cellIndex(c:vec3i)->u32{return u32(c.x+c.y*32+c.z*512);}
fn hash(v:u32)->u32{var x=v;x=(x^(x>>16u))*0x7feb352du;x=(x^(x>>15u))*0x846ca68bu;return x^(x>>16u);}
fn rnd(v:u32)->f32{return f32(hash(v)&0x00ffffffu)/16777216.;}
fn nutrient(p:vec3f)->f32{return .48+.52*pow(.5+.5*sin(p.x*.32)*cos(p.z*.27),2.);}
