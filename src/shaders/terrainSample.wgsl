// Same triangle interpolation as the rendered heightfield (64 x 64 quads).
fn groundSample(p:vec2f)->vec4f {
 let uv=clamp((p+20.)/.625,vec2f(0),vec2f(63.9999));let c=vec2u(floor(uv));let t=fract(uv);let i=c.x+c.y*65u;
 let a=terrain[i];let b=terrain[i+1u];let d=terrain[i+65u];let e=terrain[i+66u];
 var h=a.x+(b.x-a.x)*t.x+(d.x-a.x)*t.y;var dx=(b.x-a.x)/.625;var dz=(d.x-a.x)/.625;var speed=a.y+(b.y-a.y)*t.x+(d.y-a.y)*t.y;
 if(t.x+t.y>1.){h=e.x+(d.x-e.x)*(1.-t.x)+(b.x-e.x)*(1.-t.y);dx=(e.x-d.x)/.625;dz=(e.x-b.x)/.625;speed=e.y+(d.y-e.y)*(1.-t.x)+(b.y-e.y)*(1.-t.y);}
 return vec4f(h,dx,dz,speed);
}
