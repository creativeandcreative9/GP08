import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines.js';

/** Keep some diffuse headroom for tone mapping instead of flattening every bright normal to the same value. */
class DiffuseLighting extends MaterialPluginBase {
  private readonly style: 'cloth' | 'paving' | 'solid';
  constructor(material: Material) {
    super(material, 'GP08DiffuseLighting', 210, { GP08DIFFUSECLOTH: false, GP08DIFFUSEPAVING: false }, true, true);
    this.style = material.name === 'decal0' ? 'paving' : material.name === 'lifeMat' || material.name.startsWith('player-') ? 'cloth' : 'solid';
  }
  override prepareDefines(defines: MaterialDefines): void {
    defines['GP08DIFFUSECLOTH'] = this.style === 'cloth';
    defines['GP08DIFFUSEPAVING'] = this.style === 'paving';
  }
  override getClassName(): string { return 'GP08DiffuseLighting'; }
  override isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.GLSL; }
  override getCustomCode(type: string): { [point: string]: string } | null {
    if (type !== 'fragment') return null;
    return { CUSTOM_FRAGMENT_BEFORE_FOG: `
#ifdef EMISSIVEASILLUMINATION
vec3 gpDiffuseRaw = diffuseBase * diffuseColor + vAmbientColor;
#else
#ifdef LINKEMISSIVEWITHDIFFUSE
vec3 gpDiffuseRaw = (diffuseBase + emissiveColor) * diffuseColor + vAmbientColor;
#else
vec3 gpDiffuseRaw = diffuseBase * diffuseColor + emissiveColor + vAmbientColor;
#endif
#endif
// Below unit light this is exactly zero: night and already shaded surfaces retain their existing light.
#ifdef GP08DIFFUSECLOTH
float gpDiffuseHeadroom = .3;
#elif defined(GP08DIFFUSEPAVING)
float gpDiffuseHeadroom = .35;
#else
float gpDiffuseHeadroom = .65;
#endif
color.rgb += gpDiffuseHeadroom * max(gpDiffuseRaw - vec3(1.0), vec3(0.0)) * baseColor.rgb * baseAmbientColor;
` };
  }
}

/** Explicitly applied to opaque town/character/car materials; cutout foliage and emissive signs keep their own response. */
export function applyDiffuseLighting(material: Material): void {
  if (!material.pluginManager?.getPlugin('GP08DiffuseLighting')) new DiffuseLighting(material);
}
