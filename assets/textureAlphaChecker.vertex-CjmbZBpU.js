import{t as e}from"./shaderStore-D-XQlhUT.js";var t=`textureAlphaCheckerVertexShader`,n=`
precision highp float;attribute vec2 uv;varying vec2 vUv;void main() {vUv=uv;gl_Position=vec4(mod(uv,1.0)*2.0-1.0,0.0,1.0);}
`;e.ShadersStore[t]=n;var r={name:t,shader:n};export{r as TextureAlphaCheckerVertexShader};