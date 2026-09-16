// A single scene is sampled normally and through the lens. Saved objects
// therefore bend at the bubble's edge as they emerge, rather than fading
// between unrelated layers. The four photographs share one bundled texture.
export const WELCOME_GLASS_SHADER = `
uniform shader atlas;
uniform float2 size;
uniform float2 offset;
uniform float arrival;
uniform float phase;
uniform float4 paper;
uniform float4 ink;
uniform float4 amber;

float box(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float2 rotate(float2 p, float a) {
  return float2(cos(a)*p.x-sin(a)*p.y, sin(a)*p.x+cos(a)*p.y);
}
float release(float id) {
  float t = phase / 6.2831853;
  return smoothstep(0.04 + id*0.025, 0.27 + id*0.025, t)
    * (1.0-smoothstep(0.70 + id*0.018, 0.92 + id*0.012, t));
}
float3 clipping(float2 p, float2 destination, float2 halfSize, float angle, float id, float3 under) {
  float open = release(id);
  float2 center = float2(0.5, 0.47) + destination * (0.24 + open*0.76);
  center += float2(sin(phase*2.0+id), cos(phase*2.0+id))*0.008*open;
  center += offset / size.x * (0.12 + 0.09*id);
  float scale = 0.64 + 0.36*open;
  float2 q = rotate(p-center, angle*open + 0.06*sin(phase+id)) / scale;
  float shape = box(q, halfSize, 0.017);
  float shade = box(q-float2(0.004,0.015), halfSize, 0.02);
  float3 col = mix(under, float3(0.10,0.08,0.06), 0.14*(1.0-smoothstep(0.0,0.045,shade)));
  if (shape > 0.002) return col;
  float3 card = float3(0.99,0.98,0.955);
  float2 inner = halfSize - 0.009;
  float2 uv = clamp((q+inner)/(inner*2.0), 0.003, 0.997);
  float2 tile = float2(0.0);
  if (id > 0.5 && id < 1.5) tile = float2(0.0,0.5);
  if (id > 2.5 && id < 3.5) tile = float2(0.5,0.0);
  if (id > 3.5) tile = float2(0.5,0.5);
  float3 photo = atlas.eval(tile + uv*0.5).rgb;
  float photoMask = 1.0-smoothstep(-0.002,0.001,box(q,inner,0.012));
  card = mix(card,photo,photoMask);
  if (id > 1.5 && id < 2.5) {
    // A newspaper clipping: masthead, two columns, and an editorial photograph.
    card = float3(0.99,0.98,0.955);
    float header = box(q-float2(-0.015,-0.103),float2(0.075,0.009),0.002);
    float rule = box(q-float2(0.0,-0.077),float2(0.09,0.0015),0.0);
    float rows = abs(mod(q.y+0.055,0.018)-0.009)-0.0015;
    float columns = min(box(q-float2(-0.048,0.004),float2(0.039,0.062),0.0),
                        box(q-float2(0.048,0.004),float2(0.039,0.062),0.0));
    float print = min(min(header,rule),max(rows,columns));
    card = mix(card,float3(0.20,0.22,0.20),0.8*(1.0-smoothstep(-0.001,0.001,print)));
    float imageMask = 1.0-smoothstep(-0.001,0.001,box(q-float2(0.0,0.098),float2(0.089,0.024),0.002));
    card = mix(card,atlas.eval(float2(uv.x*0.5,0.67+uv.y*0.1)).rgb,imageMask);
  }
  return mix(col,card,1.0-smoothstep(-0.0015,0.0015,shape));
}
float3 scene(float2 p) {
  float3 col = paper.rgb;
  col = clipping(p,float2(-0.25,-0.19),float2(0.125,0.145),0.18,0.0,col);
  col = clipping(p,float2(0.22,-0.25),float2(0.125,0.105),-0.14,1.0,col);
  col = clipping(p,float2(-0.27,0.16),float2(0.105,0.14),0.13,2.0,col);
  col = clipping(p,float2(0.26,0.14),float2(0.115,0.13),-0.18,3.0,col);
  col = clipping(p,float2(0.04,0.31),float2(0.098,0.092),0.12,4.0,col);
  return col;
}
half4 main(float2 xy) {
  float2 p = xy/size.x;
  float2 center = float2(0.5,0.47) + offset/size.x;
  center.y += 0.008*sin(phase*2.0) + (1.0-arrival)*0.09;
  float radius = 0.238 + 0.008*sin(phase);
  float2 v = (p-center)/radius;
  float d = length(v);
  float bowl = sqrt(max(0.0,1.0-min(d*d,1.0)));
  float2 refracted = center + (p-center)*(0.79+0.37*pow(min(d,1.0),7.0));
  refracted += float2(0.007*sin(phase),-0.008)*bowl;
  float3 col = scene(p);
  float3 glass = scene(refracted);
  float rim = pow(min(d,1.0),18.0);
  float lighting = dot(v,normalize(float2(-0.65,-0.8)));
  glass = mix(glass,paper.rgb,0.055);
  glass += rim*(0.18+0.24*lighting);
  float ring = exp(-pow((d-0.975)*85.0,2.0));
  glass = mix(glass,float3(1.0),ring*(0.38+0.28*lighting));
  float glint = exp(-pow((d-0.89)*24.0,2.0)) * smoothstep(0.70,0.94,-v.y-v.x*0.4);
  glass = mix(glass,float3(1.0),glint*0.65);
  float bottom = exp(-pow((d-0.92)*40.0,2.0))*smoothstep(0.6,0.98,v.y+v.x*0.3);
  glass = mix(glass,float3(0.77,0.86,0.93),bottom*0.24);
  float shadow = (1.0-smoothstep(0.98,1.12,length(v-float2(0.01,0.035))))*0.09;
  col = mix(col,ink.rgb,shadow);
  col = mix(col,glass,1.0-smoothstep(0.99,1.005,d));
  float reveal = smoothstep(0.0,0.45,arrival);
  return half4(mix(paper.rgb,col,reveal),1.0);
}
`;
