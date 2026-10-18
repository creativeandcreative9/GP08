import{c as e}from"./index-CJkbrCW7.js";import{a as t,i as n,o as r}from"./mmd-DntZAX0X.js";function i(e){return e.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`)}var a=class extends r{isCompatible(t){switch(t){case e.GLSL:return!0;default:return!1}}getCustomCode(e){if(e===`vertex`){let e={};return e.CUSTOM_VERTEX_DEFINITIONS=t,e[`!${i(`finalWorld=finalWorld*influence;`)}`]=`
${n}
finalWorld=(finalWorld*influence);
`,e}if(e===`fragment`){let e={};e.CUSTOM_FRAGMENT_DEFINITIONS=`
#if defined(SPHERE_TEXTURE) && defined(NORMAL)
uniform sampler2D sphereSampler;
#endif
#ifdef TOON_TEXTURE
uniform sampler2D toonSampler;
#endif
`,e[`!${i(`#if defined(REFLECTIONMAP_SPHERICAL) || defined(REFLECTIONMAP_PROJECTION) || defined(REFRACTION) || defined(PREPASS)
uniform mat4 view;
#endif`)}`]=`
#if defined(REFLECTIONMAP_SPHERICAL) || defined(REFLECTIONMAP_PROJECTION) || defined(REFRACTION) || defined(PREPASS)
uniform mat4 view;
#elif defined(NORMAL) && defined(SPHERE_TEXTURE)
uniform mat4 view;
#endif
`,e.CUSTOM_FRAGMENT_MAIN_BEGIN=`
#ifdef TOON_TEXTURE
vec3 toonNdl;
#endif
`,e[`!${i(`vec3 diffuseColor=vDiffuseColor.rgb;`)}`]=`
#ifdef APPLY_AMBIENT_COLOR_TO_DIFFUSE
vec3 diffuseColor=clamp(vDiffuseColor.rgb+vAmbientColor,0.0,1.0);
#else
vec3 diffuseColor=(vDiffuseColor.rgb);
#endif
`,e[`!${i(`float alpha=vDiffuseColor.a;`)}`]=`
#ifdef CLAMP_ALPHA
float alpha=clamp(vDiffuseColor.a,0.0,1.0);
#else
float alpha=vDiffuseColor.a;
#endif
`,e[`!${i(`baseColor=texture2D(diffuseSampler,vDiffuseUV+uvOffset);`)}`]=`
#if defined(DIFFUSE) && defined(TEXTURE_COLOR)
baseColor=texture2D(diffuseSampler,(vDiffuseUV+uvOffset));baseColor.rgb=mix(
vec3(1.0),
baseColor.rgb*textureMultiplicativeColor.rgb,
textureMultiplicativeColor.a
);baseColor.rgb=clamp(
baseColor.rgb+(baseColor.rgb-vec3(1.0))*textureAdditiveColor.a,
0.0,
1.0
)+textureAdditiveColor.rgb;
#else
baseColor=texture2D(diffuseSampler,(vDiffuseUV+uvOffset));
#endif
`,e[`!${i(`struct lightingInfo
{`)}`]=`
struct lightingInfo {
#ifdef TOON_TEXTURE
#ifndef NDOTL
float ndl;
#endif
float isToon;
#endif
`,e[`!${i(`result.diffuse=ndl*diffuseColor*attenuation;`)}`]=`
#ifdef TOON_TEXTURE
result.diffuse=diffuseColor*attenuation;result.ndl=ndl;result.isToon=1.0;
#elif defined(IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED) 
result.diffuse=diffuseColor*attenuation;
#else
result.diffuse=(ndl*diffuseColor*attenuation);
#endif
`,e[`!${i(`diffuseBase+=info.diffuse*shadow;`)}`]=`
#ifdef TOON_TEXTURE
toonNdl=vec3(clamp(info.ndl*shadow,0.02,0.98));toonNdl.r=texture2D(toonSampler,vec2(0.5,toonNdl.r)).r;toonNdl.g=texture2D(toonSampler,vec2(0.5,toonNdl.g)).g;toonNdl.b=texture2D(toonSampler,vec2(0.5,toonNdl.b)).b;
#ifdef TOON_TEXTURE_COLOR
toonNdl=mix(
vec3(1.0),
toonNdl*toonTextureMultiplicativeColor.rgb,
toonTextureMultiplicativeColor.a
);toonNdl=clamp(
toonNdl+(toonNdl-vec3(1.0))*toonTextureAdditiveColor.a,
0.0,
1.0
)+toonTextureAdditiveColor.rgb;
#endif
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#elif defined(IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED)
diffuseBase+=info.diffuse;
#else
diffuseBase+=(info.diffuse*shadow);
#endif
`;let t=`
#ifdef EMISSIVEASILLUMINATION
vec3 finalDiffuse=clamp(diffuseBase*diffuseColor+vAmbientColor,0.0,1.0)*baseColor.rgb;
#else
#ifdef LINKEMISSIVEWITHDIFFUSE
vec3 finalDiffuse=clamp((diffuseBase+emissiveColor)*diffuseColor+vAmbientColor,0.0,1.0)*baseColor.rgb;
#else
vec3 finalDiffuse=clamp(diffuseBase*diffuseColor+emissiveColor+vAmbientColor,0.0,1.0)*baseColor.rgb;
#endif
#endif
`;return e[`!${i(t)}`]=`
#ifdef APPLY_AMBIENT_COLOR_TO_DIFFUSE
#ifdef EMISSIVEASILLUMINATION
vec3 finalDiffuse=clamp(diffuseBase*diffuseColor,0.0,1.0)*baseColor.rgb;
#else
#ifdef LINKEMISSIVEWITHDIFFUSE
vec3 finalDiffuse=clamp((diffuseBase+emissiveColor)*diffuseColor,0.0,1.0)*baseColor.rgb;
#else
vec3 finalDiffuse=clamp(diffuseBase*diffuseColor+emissiveColor,0.0,1.0)*baseColor.rgb;
#endif
#endif
#else
${t.replace(`diffuseBase`,`(diffuseBase)`)}#endif
`,e.CUSTOM_FRAGMENT_BEFORE_FOG=`
#if defined(NORMAL) && defined(SPHERE_TEXTURE)
vec3 viewSpaceNormal=normalize(mat3(view)*vNormalW);vec2 sphereUV=viewSpaceNormal.xy*0.5+0.5;vec4 sphereReflectionColor=texture2D(sphereSampler,sphereUV);
#ifdef SPHERE_TEXTURE_COLOR
sphereReflectionColor.rgb=mix(
vec3(1.0),
sphereReflectionColor.rgb*sphereTextureMultiplicativeColor.rgb,
sphereTextureMultiplicativeColor.a
);sphereReflectionColor.rgb=clamp(
sphereReflectionColor.rgb+(sphereReflectionColor.rgb-vec3(1.0))*sphereTextureAdditiveColor.a,
0.0,
1.0
)+sphereTextureAdditiveColor.rgb;
#endif
sphereReflectionColor.rgb*=diffuseBase;
#ifdef SPHERE_TEXTURE_BLEND_MODE_MULTIPLY
color*=sphereReflectionColor;
#elif defined(SPHERE_TEXTURE_BLEND_MODE_ADD)
color=vec4(color.rgb+sphereReflectionColor.rgb,color.a);
#endif
#endif
`,e}return null}getUniforms(e){return{...super.getUniforms(e),fragment:`
#if defined(DIFFUSE) && defined(TEXTURE_COLOR)
uniform vec4 textureMultiplicativeColor;uniform vec4 textureAdditiveColor;
#endif
#if defined(SPHERE_TEXTURE) && defined(SPHERE_TEXTURE_COLOR)
uniform vec4 sphereTextureMultiplicativeColor;uniform vec4 sphereTextureAdditiveColor;
#endif
#if defined(TOON_TEXTURE) && defined(TOON_TEXTURE_COLOR)
uniform vec4 toonTextureMultiplicativeColor;uniform vec4 toonTextureAdditiveColor;
#endif
`}}};export{a as MmdPluginMaterial};