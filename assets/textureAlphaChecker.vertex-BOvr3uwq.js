import{t as e}from"./shaderStore-D-XQlhUT.js";var t=`textureAlphaCheckerVertexShader`,n=`
attribute uv: vec2f;varying vUv: vec2f;@vertex
fn main(input: VertexInputs)->FragmentInputs {vertexOutputs.vUv=vertexInputs.uv;vertexOutputs.position=vec4f(
(vertexInputs.uv % 1.0)*2.0-1.0,
0.0,
1.0
);}
`;e.ShadersStoreWGSL[t]=n;var r={name:t,shader:n};export{r as TextureAlphaCheckerVertexShader};