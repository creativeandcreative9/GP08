import { applyDiffuseLighting } from './diffuse-lighting';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { type AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { type Material } from '@babylonjs/core/Materials/material.js';
import { type MaterialDefines } from '@babylonjs/core/Materials/materialDefines.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { type UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';

/**
 * Per-vertex surface tags (vertex buffer `gp08Surf`, written by `MeshBatch` and by the indexed quads of `HB`): what a
 * face is made of, where the colour alone cannot tell. 0 = plain. The tens digit of the stored value is the long axis of
 * the piece (see `MeshBatch.axis`), so a tag is always 0-9.
 *  - roofTiles: kawara rows parallel to the eaves
 *  - tile:      glazed wall tiles in running bond with grout (mansions, bank, shop bases)
 *  - panel:     large cladding / curtain-wall panels with open joints and bolts
 *  - siding:    lapped horizontal boards (apartments)
 *  - shutter:   rolling shutter slats
 *  - corrugated: vertical ribbed sheet metal
 *  - concrete:  board-marked concrete with form-tie holes
 *  - stone:     ashlar blocks of random course height (plinths, steps)
 */
// 100 is a finish flag, outside the 0–39 kind/axis values: painted metal bypasses colour-based wood/petal patterns.
export const SURF = { plain: 0, roofTiles: 1, tile: 2, panel: 3, siding: 4, shutter: 5, corrugated: 6, concrete: 7, stone: 8, bark: 9, paintedMetal: 100, roundedFoliage: 200 } as const;
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
// distance (world units) from x to the nearest multiple of period
float gpDist(float x, float period) {
  float f = fract(x / period);
  return min(f, 1.0 - f) * period;
}
// 1 inside a groove of width w centred on d = 0, softened over one pixel footprint fw
float gpGroove(float d, float w, float fw) {
  return 1.0 - smoothstep(w * 0.5, w * 0.5 + fw, d);
}
/**
 * Wall materials chosen by the surface tag (SURF): kind 2 tile, 3 panel, 4 siding, 5 shutter, 6 corrugated metal,
 * 7 concrete, 8 stone. u runs along the wall, y is the height (on a top face: x and z). Every pattern fades to its
 * average tone once its cells get close to a pixel, so nothing shimmers in the distance.
 */
void gpTagged(float kind, vec3 P, vec3 N, float fw, bool top, inout vec3 col, inout float m) {
  float u = abs(N.x) > abs(N.z) ? P.z : P.x;
  float y = P.y;
  if (top) { u = P.x; y = P.z; }
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  if (kind > 8.5) {
    // Cherry bark: long broken fissures, grey-brown plates and fine horizontal lenticels.
    // World-space grain continues across the smooth trunk rings and fades below a pixel.
    float grain = gpNoise(P * vec3(0.8, 0.055, 0.8));
    float crease = 1.0 - smoothstep(0.18, 0.28, grain);
    float fade = 1.0 - smoothstep(0.2, 1.1, fw);
    float row = floor(y / 2.8);
    float dash = smoothstep(0.55, 0.72, gpNoise(vec3(u * 0.6, row * 5.0, 18.0)));
    float line = gpGroove(gpDist(y + gpNoise(P * 0.07) * 0.6, 2.8), 0.16, fw) * dash;
    col = mix(col, vec3(0.34, 0.29, 0.28), 0.42 * line * fade);
    m *= 1.0 + (0.32 * (grain - 0.5) - 0.28 * crease + 0.14 * line) * fade + 0.08 * (gpNoise(P * 0.012) - 0.5);
  } else if (kind < 2.5) {
    // glazed tiles in running bond, 6 x 2.8 units (the real ones are far smaller, but this is what reads at street level)
    float tw = 6.0;
    float th = 2.8;
    float row = floor(y / th);
    float off = mod(row, 2.0) * tw * 0.5;
    float fade = 1.0 - smoothstep(0.18 * th, 0.6 * th, fw);
    float line = max(gpGroove(gpDist(u + off, tw), 0.34, fw), gpGroove(gpDist(y, th), 0.3, fw));
    vec3 grout = mix(col * 0.66, vec3(0.8, 0.78, 0.74), smoothstep(0.5, 0.3, lum));
    float tone = gpHash(vec3(floor((u + off) / tw), row, 11.0)) - 0.5;
    float fy = fract(y / th);
    col = mix(col, grout, 0.8 * line * fade + 0.12 * (1.0 - fade));
    m *= 1.0 + (0.1 * tone + 0.05 * (smoothstep(0.0, 0.25, fy) - smoothstep(0.75, 1.0, fy))) * fade;
  } else if (kind < 3.5) {
    // cladding panels 18 wide, as tall as a storey (36, the joint lines meet the floors at y = 4 + 36 k), open joints and bolts
    float pw = 18.0;
    float ph = 36.0;
    float dxp = gpDist(u, pw);
    float dyp = gpDist(y - 4.0, ph);
    float fade = 1.0 - smoothstep(0.1 * ph, 0.35 * ph, fw);
    float joint = max(gpGroove(dxp, 0.5, fw), gpGroove(dyp, 0.6, fw));
    float bolt = gpGroove(length(vec2(dxp - 2.4, dyp - 2.6)), 0.7, fw);
    float pid = gpHash(vec3(floor(u / pw), floor((y - 4.0) / ph), 21.0)) - 0.5;
    col = mix(col, col * 0.6, 0.85 * joint * fade + 0.05 * (1.0 - fade));
    col *= 1.0 - 0.25 * bolt * fade;
    m *= 1.0 + 0.06 * pid * fade;
  } else if (kind < 4.5) {
    // lapped boards 3.6 high: each casts a shadow on the one below, the lower lip catches the light; butt joints every 36
    float bh = 3.6;
    float row = floor(y / bh);
    float fy = fract(y / bh);
    float fade = 1.0 - smoothstep(0.2 * bh, 0.6 * bh, fw);
    float lip = 1.0 - smoothstep(0.0, 0.1, fy);
    float shadow = smoothstep(0.78, 1.0, fy);
    float joint = gpGroove(gpDist(u + gpHash(vec3(row, 5.0, 1.0)) * 36.0, 36.0), 0.3, fw);
    m *= 1.0 + (0.07 * lip - 0.2 * shadow - 0.14 * joint) * fade - 0.04 * (1.0 - fade);
  } else if (kind < 5.5) {
    // rolling shutter: slats 1.1 high, each with a lit upper half and a dark gap
    float sh = 1.1;
    float fy = fract(y / sh);
    float fade = 1.0 - smoothstep(0.25 * sh, 0.7 * sh, fw);
    float gap = 1.0 - smoothstep(0.0, 0.14 + fw / sh, fy);
    m *= 1.0 + (0.14 * (fy - 0.5) - 0.3 * gap) * fade - 0.04 * (1.0 - fade);
    m *= 1.0 + 0.06 * (gpNoise(vec3(u * 0.35, y * 0.05, 3.0)) - 0.5);
  } else if (kind < 6.5) {
    // corrugated sheet metal: ribs 3 apart
    float fade = 1.0 - smoothstep(0.35, 0.9, fw);
    m *= 1.0 + 0.17 * sin(u * 2.0943951) * fade;
    m *= 1.0 + 0.1 * (gpNoise(vec3(u * 0.05, y * 0.02, 8.0)) - 0.5);
  } else if (kind < 7.5) {
    // board-marked concrete: form panels 24 x 12, tie holes on a 12-unit grid, streaks and mottling
    float cw = 24.0;
    float ch = 12.0;
    float fade = 1.0 - smoothstep(0.1 * ch, 0.4 * ch, fw);
    float joint = max(gpGroove(gpDist(u, cw), 0.26, fw), gpGroove(gpDist(y, ch), 0.26, fw));
    float hole = gpGroove(length(vec2(gpDist(u - 6.0, 12.0), gpDist(y - 6.0, 12.0))), 0.9, fw);
    float pid = gpHash(vec3(floor(u / cw), floor(y / ch), 31.0)) - 0.5;
    float mott = gpNoise(vec3(u * 0.09, y * 0.09, 3.0)) - 0.5;
    float streak = gpNoise(vec3(u * 0.45, y * 0.02, 1.0)) - 0.5;
    col = mix(col, col * 0.62, (0.5 * joint + 0.7 * hole) * fade);
    m *= 1.0 + (0.06 * pid + 0.1 * mott) * fade + 0.07 * streak;
  } else {
    // ashlar: courses 6.5 high, blocks 11-17 wide, each course shifted by its own amount
    float ch = 6.5;
    float row = floor(y / ch);
    float bw = 11.0 + 6.0 * gpHash(vec3(row, 1.0, 2.0));
    float off = gpHash(vec3(row, 3.0, 4.0)) * bw;
    float fade = 1.0 - smoothstep(0.1 * ch, 0.45 * ch, fw);
    float line = top ? 0.0 : gpGroove(gpDist(y, ch), 0.42, fw);
    float joint = max(line, gpGroove(gpDist(u + off, bw), 0.42, fw));
    float tone = gpHash(vec3(floor((u + off) / bw), row, 7.0)) - 0.5;
    float speck = (gpNoise(P * 1.3) - 0.5) * (1.0 - smoothstep(0.2, 0.55, fw * 1.6));
    col = mix(col, col * 0.58, 0.85 * joint * fade + 0.06 * (1.0 - fade));
    m *= 1.0 + 0.16 * tone * fade + 0.1 * speck;
  }
}
`;

/**
 * Material patterns are keyed by the albedo (vertex colour) of a surface, so builders get them by choosing the
 * colour of the material they mean (hue in degrees, saturation and value 0-1):
 *  - wood:      hue 14-46, saturation 0.3-0.85, value 0.16-0.9 (grain runs along a box's long axis, or up a cylinder)
 *  - brick:     hue < 14 or > 350, saturation 0.5-0.78, value 0.4-0.82, on walls (running bond with light mortar)
 *  - plaster:   saturation < 0.3, value > 0.62, on walls (fine speckle and rain streaks)
 *  - foliage:   hue 78-150, saturation > 0.3 (leafy dapple with sparkles)
 *  - blossom:   hue > 320 or < 12, saturation 0.06-0.6, value > 0.62 (petal dapple)
 *  - glass:     bluish, value high (sky reflection and streaks)
 * Roof tiles are the exception: they come from the tag SURF.roofTiles (see MeshBatch.gable).
 *
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
    float svr = floor(vGp08Surf + 0.5);
    float sv0 = svr - floor(svr * 0.1 + 0.01) * 10.0; // the surface kind without the long-axis digit
#ifdef VERTEXCOLOR
    vec3 vc = vColor.rgb;
    float glass = step(0.7, vc.b) * step(0.15, vc.b - vc.r) * step(0.35, vc.r) * step(abs(N.y), 0.3);
    if (vGp08Surf >= 199.5) {
      // Clipped shrubs have a continuous rounded silhouette and quiet leaf-scale variation.
      m *= 1.0 + .04 * big + .008 * fine;
    } else if (vGp08Surf >= 99.5) {
      // Painted metal bypasses colour-based wood, foliage, blossom and building patterns.
      m *= 1.0 + .02 * big + .015 * fine;
    } else if (glass > 0.5) {
      float fres = pow(1.0 - clamp(abs(dot(N, viewDirectionW)), 0.0, 1.0), 2.0);
      float s = fract((P.x + P.z) * 0.011 + P.y * 0.026);
      float streak = smoothstep(0.0, 0.025, s) * (1.0 - smoothstep(0.05, 0.11, s)) * (1.0 - smoothstep(0.5, 1.5, fw * 0.08));
      col = mix(col, vec3(0.85, 0.92, 1.0), 0.2 + 0.5 * fres) + vec3(0.22) * streak;
      m = 1.0 + 0.03 * big;
    } else {
      // material patterns keyed by the albedo (the town is flat-coloured): wood, brick, plaster, foliage, blossom
      float mx = max(vc.r, max(vc.g, vc.b));
      float mn = min(vc.r, min(vc.g, vc.b));
      float sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
      float hue = 0.0;
      if (mx > mn + 1e-4) {
        if (mx == vc.r) hue = mod((vc.g - vc.b) / (mx - mn), 6.0);
        else if (mx == vc.g) hue = (vc.b - vc.r) / (mx - mn) + 2.0;
        else hue = (vc.r - vc.g) / (mx - mn) + 4.0;
        hue *= 60.0;
      }
      float sv = floor(vGp08Surf + 0.5);
      float axis = floor(sv * 0.1 + 0.01);
      float vert = 1.0 - smoothstep(0.45, 0.8, abs(N.y)); // 1 on walls, 0 on tops
      if (sv0 > 1.5) {
        // a tagged wall material (tile, panel, siding, shutter, corrugated metal, concrete, stone): see gpTagged
        if (vert > 0.5 || sv0 > 7.5) gpTagged(sv0, P, N, fw, vert < 0.5, col, m);
      } else if (hue > 14.0 && hue < 46.0 && sat > 0.3 && sat < 0.85 && mx > 0.16 && mx < 0.9) {
        // wood: grain stretched along the piece's long axis (or along the face when the axis is unknown)
        vec3 sc = vec3(1.1);
        if (axis > 0.5) {
          if (axis < 1.5) sc.x = 0.05; else if (axis < 2.5) sc.y = 0.05; else sc.z = 0.05;
        } else if (abs(N.y) > 0.6) sc.x = 0.05;
        else if (abs(N.x) > abs(N.z)) sc.z = 0.05;
        else sc.x = 0.05;
        float g1 = gpNoise(P * sc) - 0.5;
        float g2 = (gpNoise(P * sc * 3.1 + 7.7) - 0.5) * (1.0 - smoothstep(0.2, 0.55, fw * 3.4));
        float ring = smoothstep(0.62, 0.8, gpNoise(P * sc * 0.45 + 3.3));
        // Broad contrast reads as stains on a shaded board. Keep it quiet and use fine, flowing grain.
        float along = P.x;
        float across = abs(N.y) > .6 ? P.z : P.y;
        if (axis > 1.5 && axis < 2.5) { along = P.y; across = abs(N.x) > abs(N.z) ? P.z : P.x; }
        else if (axis > 2.5 || (axis < .5 && abs(N.x) > abs(N.z) && abs(N.y) < .6)) { along = P.z; across = abs(N.y) > .6 ? P.x : P.y; }
        float grainFade = 1.0 - smoothstep(.08, .35, fw);
        float grain = sin(across * 18.0 + gpNoise(vec3(along * .035, across * .08, 13.0)) * 6.0);
        m *= 1.0 + .075 * g1 + .03 * g2 - .015 * ring + .018 * grain * grainFade;
      } else if ((hue < 14.0 || hue > 350.0) && sat > 0.5 && sat < 0.78 && mx > 0.4 && mx < 0.82 && vert > 0.5) {
        // brick: running bond, 21 x 8 cm bricks, light mortar, tone varying brick by brick
        float u = abs(N.x) > abs(N.z) ? P.z : P.x;
        float rowf = P.y / 2.6;
        float row = floor(rowf);
        float bu = (u + mod(row, 2.0) * 4.0) / 8.0;
        vec2 f = vec2(fract(bu), fract(rowf));
        float mortar = max(step(f.x, 0.06), step(f.y, 0.12));
        float tone = gpHash(vec3(floor(bu), row, 5.0)) - 0.5;
        float fadeB = 1.0 - smoothstep(0.35, 0.8, fw * 0.4);
        col = mix(col, vec3(0.78, 0.75, 0.69), mortar * 0.8 * fadeB);
        m *= 1.0 + 0.18 * tone * fadeB;
      } else if (sat < 0.3 && mx > 0.62 && vert > 0.5) {
        // plaster and panels: fine speckle, soft vertical rain streaks that are stronger higher up
        float speck = (gpNoise(P * 1.9) - 0.5) * (1.0 - smoothstep(0.2, 0.55, fw * 1.9));
        float streak = gpNoise(vec3(P.x * 0.45, P.y * 0.035, P.z * 0.45)) - 0.5;
        m *= 1.0 + 0.07 * speck + 0.1 * streak * smoothstep(8.0, 60.0, P.y);
      } else if (hue > 78.0 && hue < 150.0 && sat > 0.3) {
        // foliage: leafy dapple with bright sparkles and dark gaps
        float fadeL = 1.0 - smoothstep(0.2, 0.6, fw * 1.2);
        float n1 = gpNoise(P * 0.9);
        float n2 = gpNoise(P * 2.3 + 4.1);
        m *= (0.84 + 0.32 * n1) * (1.0 + (smoothstep(0.76, 0.92, n2) * 0.22 - smoothstep(0.42, 0.22, n2) * 0.16) * fadeL);
      } else if ((hue > 320.0 || hue < 12.0) && sat > 0.06 && sat < 0.6 && mx > 0.62) {
        // cherry blossom: petal-sized dapple, white sparkles and deeper pink pockets
        float fadeL = 1.0 - smoothstep(0.2, 0.6, fw * 1.4);
        float n1 = gpNoise(P * 0.55);
        float n2 = gpNoise(P * 1.7 + 9.3);
        m *= (0.88 + 0.22 * n1) * (1.0 + (smoothstep(0.74, 0.9, n2) * 0.2 - smoothstep(0.46, 0.26, n2) * 0.12) * fadeL);
        col = mix(col, vec3(1.0, 0.95, 0.97), smoothstep(0.8, 0.95, n2) * 0.35 * fadeL);
      }
    }
#endif
    if (sv0 > 0.5 && sv0 < 1.5) {
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
    // Small running-bond paving slabs, with narrow worn joints and a varied stone tone.
    float row = floor(P.z / 5.5);
    float off = mod(row, 2.0) * 4.0;
    float joint = max(gpGroove(gpDist(P.x + off, 8.0), 0.14, fw), gpGroove(gpDist(P.z, 5.5), 0.14, fw));
    float fade = 1.0 - smoothstep(0.7, 2.5, fw);
    float tile = gpHash(vec3(floor((P.x + off) / 8.0), row, 4.0)) - 0.5;
    m *= 1.0 + (0.07 * tile - 0.14 * joint) * fade;
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

/** A new vertex-coloured material can use the same wood, plaster and worn-surface detail as the town. */
export function applySurfaceDetailTo(material: Material): void {
  new SurfacePlugin(material, 0);
}

/** Adds the surface detail to the town materials (call once after the town is built, before rendering). */
export function applySurfaceDetail(scene: Scene): void {
  for (const m of scene.materials) {
    const kind = KIND[m.name];
    if (kind !== undefined) new SurfacePlugin(m, kind);
    if (m.name === 'townMat' || m.name === 'decal0') applyDiffuseLighting(m);
  }
}
