import {
  MaterialPluginBase,
  ShaderLanguage,
  type AbstractMesh,
  type Material,
  type MaterialDefines,
  type Scene,
  type UniformBuffer,
} from '@babylonjs/core';

/**
 * Per-vertex surface tags (vertex buffer `gp08Surf`, written by `MeshBatch`): what a face is made of,
 * where the colour alone cannot tell. 0 = plain.
 */
export const SURF = { plain: 0, roofTiles: 1 } as const;
export const SURF_KIND = 'gp08Surf';

/** What a whole material draws (the decal layers and the terrain are one kind each). */
const KIND: Record<string, number> = {
  townMat: 0, // buildings and props
  decal0: 1, // pads and sidewalks
  decal1: 2, // lawns and ballast
  decal2: 3, // asphalt and paths
  decal3: 4, // painted markings and petals
  terrainMat: 5,
};

const NOISE = /* glsl */ `
float gpHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float gpNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(gpHash(i), gpHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(gpHash(i + vec3(0.0, 1.0, 0.0)), gpHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(gpHash(i + vec3(0.0, 0.0, 1.0)), gpHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(gpHash(i + vec3(0.0, 1.0, 1.0)), gpHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

/**
 * Procedural surface detail for the flat vertex-coloured town: soft colour blotches and fine grain so that no
 * face is one flat colour, grime at the foot of walls, glass that reflects the sky with diagonal streaks,
 * kawara tile rows on tagged roofs, and grain/wear per ground layer. Everything fades out with distance
 * (screen-space derivatives) so it never shimmers.
 */
class SurfacePlugin extends MaterialPluginBase {
  constructor(material: Material, private readonly kind: number) {
    super(material, 'GP08Surface', 200, { GP08SURFACE: false, GP08SURF_ATTR: false }, true, true);
  }

  override getClassName(): string {
    return 'GP08SurfacePlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  override prepareDefines(defines: MaterialDefines, _scene: Scene, mesh: AbstractMesh): void {
    defines['GP08SURFACE'] = true;
    defines['GP08SURF_ATTR'] = mesh.isVerticesDataPresent(SURF_KIND);
  }

  override getAttributes(attributes: string[], _scene: Scene, mesh: AbstractMesh): void {
    if (mesh.isVerticesDataPresent(SURF_KIND)) attributes.push(SURF_KIND);
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return { ubo: [{ name: 'gp08Kind', size: 1, type: 'float' }], fragment: 'uniform float gp08Kind;' };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat('gp08Kind', this.kind);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
#ifdef GP08SURF_ATTR
attribute float ${SURF_KIND};
#endif
varying float vGp08Surf;`,
        CUSTOM_VERTEX_MAIN_END: `
#ifdef GP08SURF_ATTR
vGp08Surf = ${SURF_KIND};
#else
vGp08Surf = 0.0;
#endif`,
      };
    }
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `varying float vGp08Surf;\n${NOISE}`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
#ifdef GP08SURFACE
{
  vec3 P = vPositionW;
  vec3 N = normalW;
  float fw = length(fwidth(P)) + 1e-4;           // world units per pixel
  float fadeFine = 1.0 - smoothstep(0.35, 1.0, fw * 0.7);
  float fadeMid = 1.0 - smoothstep(0.35, 1.0, fw * 0.09);
  float big = gpNoise(P * 0.012) - 0.5;          // ~80-unit blotches
  float mid = (gpNoise(P * 0.09) - 0.5) * fadeMid;
  float fine = (gpNoise(P * 0.7) - 0.5) * fadeFine;
  vec3 col = baseColor.rgb;
  float m = 1.0;
  if (gp08Kind < 0.5) {
    m *= 1.0 + 0.07 * big + 0.045 * mid + 0.04 * fine;
    float vertical = 1.0 - abs(N.y);
    m *= mix(1.0, mix(0.84, 1.0, smoothstep(0.0, 9.0, P.y)), vertical * 0.8);
#ifdef VERTEXCOLOR
    vec3 vc = vColor.rgb;
    float glass = step(0.7, vc.b) * step(0.15, vc.b - vc.r) * step(0.35, vc.r) * step(abs(N.y), 0.3);
    if (glass > 0.5) {
      float fres = pow(1.0 - clamp(abs(dot(N, viewDirectionW)), 0.0, 1.0), 2.0);
      float s = fract((P.x + P.z) * 0.011 + P.y * 0.026);
      float streak = smoothstep(0.0, 0.025, s) * (1.0 - smoothstep(0.05, 0.11, s)) * (1.0 - smoothstep(0.5, 1.5, fw * 0.08));
      col = mix(col, vec3(0.85, 0.92, 1.0), 0.2 + 0.5 * fres) + vec3(0.22) * streak;
      m = 1.0 + 0.03 * big;
    }
#endif
    if (vGp08Surf > 0.5 && vGp08Surf < 1.5) {
      // kawara: rows parallel to the eaves, staggered seams between tiles
      float fadeTile = 1.0 - smoothstep(0.3, 0.9, fw / 3.0);
      float rowId = floor(P.y / 3.2);
      float row = fract(P.y / 3.2);
      float rowShade = mix(0.7, 1.0, smoothstep(0.0, 0.16, row)) * mix(1.0, 1.06, smoothstep(0.6, 1.0, row));
      float c2 = fract((P.x + P.z) / 2.8 + rowId * 0.5);
      float seam = smoothstep(0.0, 0.07, c2) * (1.0 - smoothstep(0.93, 1.0, c2));
      float tileVar = gpHash(vec3(floor((P.x + P.z) / 2.8 + rowId * 0.5), rowId, 3.0)) - 0.5;
      m *= mix(1.0, rowShade * mix(0.88, 1.0, seam) * (1.0 + 0.1 * tileVar), fadeTile);
    }
  } else if (gp08Kind < 1.5) {
    m *= 1.0 + 0.05 * big + 0.05 * mid + 0.08 * fine;
  } else if (gp08Kind < 2.5) {
    m *= 1.0 + 0.16 * big + 0.1 * mid + 0.1 * fine;
  } else if (gp08Kind < 3.5) {
    float grain = (gpNoise(P * 2.3) - 0.5) * (1.0 - smoothstep(0.35, 1.0, fw * 2.3));
    m *= 1.0 + 0.07 * big + 0.05 * mid + 0.14 * grain;
  } else if (gp08Kind < 4.5) {
    m *= 1.0 - 0.14 * smoothstep(0.55, 0.9, gpNoise(P * 0.35)) * fadeMid;
  } else {
    m *= 1.0 + 0.14 * big + 0.08 * mid + 0.06 * fine;
  }
  baseColor.rgb = col * m;
}
#endif`,
    };
  }
}

/** Adds the surface detail to the town materials (call once after the town is built, before rendering). */
export function applySurfaceDetail(scene: Scene): void {
  for (const m of scene.materials) {
    const kind = KIND[m.name];
    if (kind !== undefined) new SurfacePlugin(m, kind);
  }
}
