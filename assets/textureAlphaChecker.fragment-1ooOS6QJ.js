import{t as e}from"./shaderStore-D-XQlhUT.js";var t=`textureAlphaCheckerPixelShader`,n=`
var textureSamplerSampler: sampler;var textureSampler: texture_2d<f32>;varying vUv: vec2f;@fragment
fn main(input: FragmentInputs)->FragmentOutputs {fragmentOutputs.color=vec4f(
vec3f(1.0)-vec3f(textureSample(textureSampler,textureSamplerSampler,fragmentInputs.vUv).a),
1.0
);}
`;e.ShadersStoreWGSL[t]=n;var r={name:t,shader:n};export{r as TextureAlphaCheckerPixelShader};