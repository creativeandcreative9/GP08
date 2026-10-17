import{t as e}from"./shaderStore-D-XQlhUT.js";var t=`textureAlphaCheckerPixelShader`,n=`
precision highp float;uniform sampler2D textureSampler;varying vec2 vUv;void main() {gl_FragColor=vec4(vec3(1.0)-vec3(texture2D(textureSampler,vUv).a),1.0);}
`;e.ShadersStore[t]=n;var r={name:t,shader:n};export{r as TextureAlphaCheckerPixelShader};