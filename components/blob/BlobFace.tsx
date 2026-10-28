import React, { useId, useMemo } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient as SvgRadialGradient,
  Stop,
} from 'react-native-svg';

export type MoodState =
  | 'calm'
  | 'happy'
  | 'excited'
  | 'focused'
  | 'stressed'
  | 'sad'
  | 'guilty'
  | 'hat'
  /** US ball cap: navy fitted (Yankees-style colorway); no team or league marks. */
  | 'cap'
  /** Royal crown overlay (gold); distinct from top hat. */
  | 'crown'
  /** Simple five-point classic crown (solid gold). */
  | 'crown2'
  | 'sunglasses'
  | 'purple_sunglasses'
  /** Cartoon mustache — anchored above the mouth. */
  | 'mustache'
  /** Short black beard under the mouth (happy-face layout). */
  | 'beard'
  /** Pink ribbon bow on the forehead above the brows. */
  | 'bow'
  /** Stylized long upper eyelashes (SVG); stacks under glasses overlays. */
  | 'long_lashes'
  /**
   * Cropped happy-mouth PNG over the face (for alignment checks; auto-cropped from the happy texture).
   */
  | 'mouth_overlay'
  /** Same mouth asset as {@link mouth_overlay}, nudged slightly higher on the happy face. */
  | 'mouth_1'
  /** Open smile with teeth and blue braces (SVG); happy layout only. */
  | 'mouth_braces'
  /** Fat glossy pouty red lips (SVG); happy layout only. */
  | 'pout_lips'
  | 'cape';

const FACE_GLOBAL_SCALE = 0.9;

/**
 * Top hat: brim ellipse + tapered crown + hat band, layered gradients for felt depth and lighting.
 */
function HatGraphic({ scale }: { scale: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const brimFill = `hatBrim${uid}`;
  const brimEdge = `hatBrimEdge${uid}`;
  const crownFill = `hatCrown${uid}`;
  const crownHi = `hatCrownHi${uid}`;
  const bandFill = `hatBand${uid}`;
  const topFill = `hatTop${uid}`;
  const shadowFill = `hatShad${uid}`;

  const w = 48 * scale;
  const h = 31 * scale;

  /** Crown silhouette (wider cylinder; brim ellipse unchanged). */
  const crownD =
    'M 11.8 20.8 ' +
    'L 11.8 8.1 ' +
    'C 11.8 6.4 12.4 5.2 13.8 4.7 ' +
    'L 32.2 4.7 ' +
    'C 33.6 5.2 34.2 6.4 34.2 8.1 ' +
    'L 34.2 20.8 ' +
    'C 34.2 21.4 33.7 21.9 33 21.9 ' +
    'L 13 21.9 ' +
    'C 12.3 21.9 11.8 21.4 11.8 20.8 Z';

  /** Flat crown top (ellipse — slight perspective). */
  const crownTopD =
    'M 13.8 5.2 ' +
    'C 13.8 4.2 17.8 3.5 23 3.5 ' +
    'C 28.2 3.5 32.2 4.2 32.2 5.2 ' +
    'C 32.2 6.2 28.2 6.9 23 6.9 ' +
    'C 17.8 6.9 13.8 6.2 13.8 5.2 Z';

  /** Silk hat band. */
  const bandD =
    'M 11.65 15.9 ' +
    'L 34.35 15.9 ' +
    'L 34.35 17.55 ' +
    'L 11.65 17.55 Z';

  /** Narrow highlight strip along crown left (felt nap). */
  const crownSheenD =
    'M 12.2 9 ' +
    'C 12.3 12 12.35 17 12.5 20.5 ' +
    'L 13.65 20.45 ' +
    'C 13.5 17 13.45 12 13.4 9 ' +
    'Z';

  return (
    <Svg width={w} height={h} viewBox="0 0 46 31">
      <Defs>
        <SvgRadialGradient id={brimFill} cx="50%" cy="40%" r="75%" gradientUnits="objectBoundingBox">
          <Stop offset="0%" stopColor="#5c5c5c" />
          <Stop offset="35%" stopColor="#383838" />
          <Stop offset="72%" stopColor="#1c1c1c" />
          <Stop offset="100%" stopColor="#070707" />
        </SvgRadialGradient>
        <SvgLinearGradient id={brimEdge} x1="0%" y1="50%" x2="100%" y2="50%">
          <Stop offset="0%" stopColor="#020202" />
          <Stop offset="18%" stopColor="#252525" />
          <Stop offset="50%" stopColor="#4a4a4a" />
          <Stop offset="82%" stopColor="#252525" />
          <Stop offset="100%" stopColor="#020202" />
        </SvgLinearGradient>
        <SvgLinearGradient id={crownFill} x1="8%" y1="15%" x2="92%" y2="85%">
          <Stop offset="0%" stopColor="#121212" />
          <Stop offset="28%" stopColor="#3a3a3a" />
          <Stop offset="48%" stopColor="#4f4f4f" />
          <Stop offset="62%" stopColor="#2e2e2e" />
          <Stop offset="100%" stopColor="#141414" />
        </SvgLinearGradient>
        <SvgLinearGradient id={crownHi} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <Stop offset="22%" stopColor="rgba(255,255,255,0.09)" />
          <Stop offset="38%" stopColor="rgba(255,255,255,0.02)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </SvgLinearGradient>
        <SvgLinearGradient id={bandFill} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#2d2528" />
          <Stop offset="45%" stopColor="#151018" />
          <Stop offset="100%" stopColor="#1a1419" />
        </SvgLinearGradient>
        <SvgLinearGradient id={topFill} x1="30%" y1="0%" x2="70%" y2="100%">
          <Stop offset="0%" stopColor="#555555" />
          <Stop offset="50%" stopColor="#383838" />
          <Stop offset="100%" stopColor="#222222" />
        </SvgLinearGradient>
        <SvgRadialGradient id={shadowFill} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="rgba(0,0,0,0.42)" />
          <Stop offset="70%" stopColor="rgba(0,0,0,0.12)" />
          <Stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </SvgRadialGradient>
      </Defs>

      {/* Ground shadow under brim */}
      <Path
        fill={`url(#${shadowFill})`}
        opacity={0.85}
        d="M 5 26.5 C 5 26.5 23 23.5 41 26.5 C 41 26.5 23 29.2 5 26.5 Z"
      />

      {/* Brim: felt disc (front arc reads slightly lighter) */}
      <Ellipse cx={23} cy={22.2} rx={20} ry={3.35} fill={`url(#${brimFill})`} />
      <Ellipse cx={23} cy={22.2} rx={20} ry={3.35} fill={`url(#${brimEdge})`} opacity={0.55} />

      {/* Crown */}
      <Path fill={`url(#${crownFill})`} d={crownD} />
      <Path fill={`url(#${crownHi})`} d={crownSheenD} opacity={0.95} />

      {/* Hat band */}
      <Path fill={`url(#${bandFill})`} d={bandD} />
      <Path
        fill="rgba(255,255,255,0.06)"
        d="M 11.7 16.35 L 34.3 16.35 L 34.3 16.55 L 11.7 16.55 Z"
      />

      {/* Crown top — slight rolled lip */}
      <Path fill={`url(#${topFill})`} d={crownTopD} />
    </Svg>
  );
}

/**
 * Classic US fitted ball cap — all-navy crown and visor like a Yankees home cap
 * (no NY, Batterman, or other MLB / team marks). Blank front panel with faint stitch arc.
 */
function ClassicNavyBallCapGraphic({ scale }: { scale: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const shadFill = `nbcShad${uid}`;
  const crownGrad = `nbcCr${uid}`;
  const crownSheen = `nbcCrSh${uid}`;
  const visorGrad = `nbcVis${uid}`;
  const visorUnder = `nbcVisU${uid}`;

  const vbW = 56;
  const vbH = 40;
  const w = vbW * scale;
  const h = vbH * scale;

  const crownD =
    'M 9 20.2 ' +
    'C 9 8.2 16 2.8 28 2.2 ' +
    'C 40 2.8 47 8.2 47 20.2 ' +
    'C 47 21 46.5 21.6 45.6 21.6 ' +
    'L 10.4 21.6 ' +
    'C 9.5 21.6 9 21 9 20.2 Z';

  /** Narrow bill (inset from crown) but tall enough in viewBox units to survive rasterization (~4px+ on blob). */
  const visorTopD =
    'M 12 21.58 ' +
    'Q 28 21.22 44 21.58 ' +
    'L 43.75 24.1 ' +
    'Q 28 25.35 12.25 24.1 ' +
    'Z';

  const visorUnderD =
    'M 12 24 ' +
    'Q 28 24.35 44 24 ' +
    'L 43.85 25.85 ' +
    'Q 28 27.45 12.15 25.85 ' +
    'Z';

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${vbW} ${vbH}`}>
      <Defs>
        <SvgRadialGradient id={shadFill} cx="50%" cy="45%" r="55%" gradientUnits="objectBoundingBox">
          <Stop offset="0%" stopColor="rgba(0,0,0,0.44)" />
          <Stop offset="72%" stopColor="rgba(0,0,0,0.1)" />
          <Stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </SvgRadialGradient>
        <SvgLinearGradient id={crownGrad} x1="15%" y1="0%" x2="85%" y2="100%">
          <Stop offset="0%" stopColor="#1a3a6e" />
          <Stop offset="35%" stopColor="#132c56" />
          <Stop offset="72%" stopColor="#0c1f3d" />
          <Stop offset="100%" stopColor="#081428" />
        </SvgLinearGradient>
        <SvgLinearGradient id={crownSheen} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="rgba(0,0,0,0.28)" />
          <Stop offset="22%" stopColor="rgba(255,255,255,0.07)" />
          <Stop offset="48%" stopColor="rgba(255,255,255,0.03)" />
          <Stop offset="78%" stopColor="rgba(0,0,0,0.12)" />
          <Stop offset="100%" stopColor="rgba(0,0,0,0.22)" />
        </SvgLinearGradient>
        <SvgLinearGradient id={visorGrad} x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#3d6eb8" />
          <Stop offset="35%" stopColor="#2a5088" />
          <Stop offset="70%" stopColor="#1a3660" />
          <Stop offset="100%" stopColor="#0f2448" />
        </SvgLinearGradient>
        <SvgLinearGradient id={visorUnder} x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#0a1424" />
          <Stop offset="100%" stopColor="#152a42" />
        </SvgLinearGradient>
      </Defs>

      <Path
        fill={`url(#${shadFill})`}
        opacity={0.9}
        d="M 13 29 Q 28 27.6 43 29 Q 28 30.4 13 29 Z"
      />

      <Path d={crownD} fill={`url(#${crownGrad})`} />
      <Path d={crownD} fill={`url(#${crownSheen})`} opacity={0.88} />

      <Path
        d="M 10.2 21.35 Q 28 21.12 45.8 21.35"
        fill="none"
        stroke="#040a14"
        strokeWidth={0.75}
        strokeLinecap="round"
        opacity={0.65}
      />

      <Path
        d="M 17.2 7.5 L 17.2 19.2"
        fill="none"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={0.42}
        strokeLinecap="round"
      />
      <Path
        d="M 38.8 7.5 L 38.8 19.2"
        fill="none"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={0.42}
        strokeLinecap="round"
      />
      <Path
        d="M 28 3.2 L 28 19.5"
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={0.38}
        strokeLinecap="round"
      />

      <Path
        d="M 20 5.2 Q 28 4 36 5.2"
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={0.45}
        strokeLinecap="round"
      />

      <Circle cx={11.2} cy={12.5} r={0.85} fill="#2a2a2e" stroke="#1a1a1c" strokeWidth={0.2} />
      <Circle cx={44.8} cy={12.5} r={0.85} fill="#2a2a2e" stroke="#1a1a1c" strokeWidth={0.2} />

      <Circle cx={28} cy={2.9} r={1.65} fill="#122a50" stroke="#0a1628" strokeWidth={0.45} />

      <Path
        d="M 22.5 6.8 H 33.5 Q 35.2 6.8 35.8 8.2 L 35.2 10.5 H 20.8 L 20.2 8.2 Q 20.8 6.8 22.5 6.8 Z"
        fill="rgba(0,0,0,0.2)"
      />

      <Ellipse
        cx={28}
        cy={13.5}
        rx={6.2}
        ry={5.1}
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={0.35}
      />

      <Path
        d="M 22 14.5 Q 24.5 13.8 27 14 Q 29.5 13.8 32 14.5"
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth={0.4}
        strokeLinecap="round"
        strokeDasharray="0.9 1.15"
      />

      <Path d={visorUnderD} fill={`url(#${visorUnder})`} stroke="#0a1420" strokeWidth={0.35} />
      <Path
        d={visorTopD}
        fill={`url(#${visorGrad})`}
        stroke="rgba(255,255,255,0.28)"
        strokeWidth={0.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <Path
        d="M 12.2 21.55 Q 28 21.18 43.8 21.55"
        fill="none"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={0.38}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Closed imperial crown — matches classic 3D reference: thick band, velvet dome that
 * widens at the "shoulders", four gold ribs with strong outward S-curve then inward to
 * peak, pearl-lined ribs, rim fleurs between ribs, tall fleur-de-lis finial.
 */
function CrownGraphic({ scale }: { scale: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const velvet = `crVel${uid}`;
  const velvetHi = `crVelHi${uid}`;
  const velvetEdge = `crVelEdge${uid}`;
  const gold = `crGold${uid}`;
  const goldEdge = `crGoldEdge${uid}`;
  const lip = `crLip${uid}`;
  const shad = `crSh${uid}`;
  const pearlGrad = `crPearl${uid}`;
  const goldHiStroke = `crGoldHiSt${uid}`;

  /** Wide canvas; slightly taller than wide — silhouette flares mid-body then tapers to peak. */
  const vbW = 80;
  const vbH = 104;
  const cx = 40;
  const w = 56 * scale;
  const h = (vbH / vbW) * w;

  const bandInnerY = 82;
  const peakY = 5.5;

  /**
   * Velvet cap: widest around mid-height (follows bulbous rails), domed top — reads “filled”.
   */
  const velvetD =
    'M 9 82 ' +
    'C 9 54 4 40 13 24 ' +
    `C 21 11 31 6 ${cx} ${peakY} ` +
    `C 49 6 59 11 67 24 ` +
    'C 76 40 71 54 71 82 Z';

  /**
   * Outer ribs: controls pulled outside (negative / > vbW) for pronounced outward flare,
   * then second cubic sweeps to crown peak. Inner ribs stay narrower but keep same S logic.
   */
  const archLeftOuter =
    `M 7 ${bandInnerY} C -4 62 -6 38 11 24 C 21 12 31 7 ${cx} ${peakY}`;
  const archInnerL =
    `M 21 ${bandInnerY} C 15 64 17 44 25 28 C 30 15 35 9 ${cx} ${peakY}`;
  const archInnerR =
    `M 59 ${bandInnerY} C 65 64 63 44 55 28 C 50 15 45 9 ${cx} ${peakY}`;
  const archRightOuter =
    `M 73 ${bandInnerY} C 84 62 86 38 69 24 C 59 12 49 7 ${cx} ${peakY}`;

  /** Solid foundation + softly rounded lower rim. */
  const bandD =
    'M 4 100 ' +
    `L 4 ${bandInnerY} ` +
    `L 76 ${bandInnerY} ` +
    'L 76 100 ' +
    'Q 76 102.8 72 102.8 ' +
    'L 8 102.8 ' +
    'Q 4 102.8 4 100 Z';

  const lipD = 'M 6 101 L 74 101 Q 74 103.5 71 103.5 L 9 103.5 Q 6 103.5 6 101 Z';

  /** Rim ornaments between the four rib anchors (7 / 21 / 59 / 73). */
  const rimFleur = (x: number, baseY: number) => {
    const t = baseY - 4.2;
    const b = baseY + 2.4;
    return (
      `M ${x} ${t} L ${x + 1.35} ${baseY - 0.8} ` +
      `L ${x + 3.6} ${baseY - 0.5} L ${x + 1.4} ${baseY + 1.4} ` +
      `L ${x + 2.15} ${b} L ${x} ${baseY + 0.8} L ${x - 2.15} ${b} ` +
      `L ${x - 1.4} ${baseY + 1.4} L ${x - 3.6} ${baseY - 0.5} L ${x - 1.35} ${baseY - 0.8} Z`
    );
  };

  /** Tall fleur-de-lis finial — apex near top of viewBox; base nests over rib meeting (~y 5–12). */
  const finialD =
    `M ${cx} 0.6 L ${cx + 2.2} 6.8 ` +
    `L ${cx + 6.2} 7.5 L ${cx + 2.6} 11.2 ` +
    `L ${cx + 3.6} 14.6 L ${cx} 12.2 L ${cx - 3.6} 14.6 ` +
    `L ${cx - 2.6} 11.2 L ${cx - 6.2} 7.5 L ${cx - 2.2} 6.8 Z`;

  /** Pearls along outer edges of ribs (reference beading). */
  const pearls: [number, number][] = [
    [5.5, 76],
    [3.5, 62],
    [4.5, 46],
    [9, 32],
    [16, 20],
    [26, 11],
    [33, 7.5],
    [74.5, 76],
    [76.5, 62],
    [75.5, 46],
    [71, 32],
    [64, 20],
    [54, 11],
    [47, 7.5],
    [21, 76],
    [18.5, 62],
    [20.5, 48],
    [24, 34],
    [29, 22],
    [34, 14],
    [37.5, 9],
    [59, 76],
    [61.5, 62],
    [59.5, 48],
    [56, 34],
    [51, 22],
    [46, 14],
    [42.5, 9],
  ];

  const archStroke = 4.6;
  const archStrokeInner = 3.85;

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${vbW} ${vbH}`}>
      <Defs>
        <SvgRadialGradient id={velvet} cx="50%" cy="30%" r="72%">
          <Stop offset="0%" stopColor="#d44852" />
          <Stop offset="38%" stopColor="#901428" />
          <Stop offset="72%" stopColor="#500818" />
          <Stop offset="100%" stopColor="#240208" />
        </SvgRadialGradient>
        <SvgRadialGradient id={velvetHi} cx="45%" cy="24%" r="48%">
          <Stop offset="0%" stopColor="rgba(255,215,220,0.45)" />
          <Stop offset="100%" stopColor="rgba(80,20,30,0)" />
        </SvgRadialGradient>
        <SvgLinearGradient id={velvetEdge} x1="0%" y1="50%" x2="100%" y2="50%">
          <Stop offset="0%" stopColor="rgba(0,0,0,0.35)" />
          <Stop offset="22%" stopColor="rgba(255,255,255,0.06)" />
          <Stop offset="78%" stopColor="rgba(0,0,0,0.18)" />
          <Stop offset="100%" stopColor="rgba(0,0,0,0.38)" />
        </SvgLinearGradient>
        <SvgLinearGradient id={gold} x1="8%" y1="78%" x2="92%" y2="8%">
          <Stop offset="0%" stopColor="#4a3008" />
          <Stop offset="18%" stopColor="#8a6218" />
          <Stop offset="38%" stopColor="#e8c858" />
          <Stop offset="52%" stopColor="#fff4c8" />
          <Stop offset="66%" stopColor="#d4a828" />
          <Stop offset="88%" stopColor="#6b4810" />
          <Stop offset="100%" stopColor="#2a1804" />
        </SvgLinearGradient>
        <SvgLinearGradient id={goldHiStroke} x1="0%" y1="0%" x2="100%" y2="90%">
          <Stop offset="0%" stopColor="#fffce8" />
          <Stop offset="40%" stopColor="#e0b850" />
          <Stop offset="100%" stopColor="#4a3208" />
        </SvgLinearGradient>
        <SvgLinearGradient id={goldEdge} x1="50%" y1="5%" x2="50%" y2="95%">
          <Stop offset="0%" stopColor="#fff2c0" />
          <Stop offset="35%" stopColor="#c9a338" />
          <Stop offset="100%" stopColor="#2e1c04" />
        </SvgLinearGradient>
        <SvgLinearGradient id={lip} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#f4dc88" />
          <Stop offset="100%" stopColor="#5c400e" />
        </SvgLinearGradient>
        <SvgRadialGradient id={pearlGrad} cx="32%" cy="28%" r="68%">
          <Stop offset="0%" stopColor="#ffffff" />
          <Stop offset="45%" stopColor="#f4efe8" />
          <Stop offset="100%" stopColor="#b8b0a6" />
        </SvgRadialGradient>
        <SvgRadialGradient id={shad} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="rgba(0,0,0,0.42)" />
          <Stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </SvgRadialGradient>
      </Defs>

      <Ellipse cx={cx} cy={102} rx={31} ry={2.35} fill={`url(#${shad})`} opacity={0.72} />

      <Path fill={`url(#${velvet})`} d={velvetD} />
      <Path fill={`url(#${velvetHi})`} d={velvetD} opacity={0.9} />
      <Path fill={`url(#${velvetEdge})`} d={velvetD} opacity={0.55} />

      <Path
        d={archLeftOuter}
        stroke="rgba(12,8,2,0.65)"
        strokeWidth={archStroke + 1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d={archInnerL}
        stroke="rgba(12,8,2,0.5)"
        strokeWidth={archStrokeInner + 1}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d={archInnerR}
        stroke="rgba(12,8,2,0.5)"
        strokeWidth={archStrokeInner + 1}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d={archRightOuter}
        stroke="rgba(12,8,2,0.65)"
        strokeWidth={archStroke + 1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      <Path
        d={archLeftOuter}
        stroke={`url(#${gold})`}
        strokeWidth={archStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d={archLeftOuter}
        stroke={`url(#${goldHiStroke})`}
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.55}
      />
      <Path
        d={archInnerL}
        stroke={`url(#${gold})`}
        strokeWidth={archStrokeInner}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d={archInnerR}
        stroke={`url(#${gold})`}
        strokeWidth={archStrokeInner}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d={archRightOuter}
        stroke={`url(#${gold})`}
        strokeWidth={archStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d={archRightOuter}
        stroke={`url(#${goldHiStroke})`}
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.55}
      />

      {pearls.map(([px, py], i) => (
        <Circle
          key={i}
          cx={px}
          cy={py}
          r={1.28}
          fill={`url(#${pearlGrad})`}
          stroke="#9a9288"
          strokeWidth={0.2}
        />
      ))}

      <Path fill={`url(#${gold})`} d={bandD} stroke="#1f1406" strokeWidth={0.5} strokeLinejoin="round" />
      <Path fill={`url(#${goldEdge})`} d={bandD} opacity={0.42} />
      <Path fill={`url(#${lip})`} d={lipD} />

      <Path fill={`url(#${gold})`} d={rimFleur(14, 79.5)} stroke="#2e2008" strokeWidth={0.32} strokeLinejoin="round" />
      <Path fill={`url(#${gold})`} d={rimFleur(40, 79.5)} stroke="#2e2008" strokeWidth={0.32} strokeLinejoin="round" />
      <Path fill={`url(#${gold})`} d={rimFleur(66, 79.5)} stroke="#2e2008" strokeWidth={0.32} strokeLinejoin="round" />

      <Path fill={`url(#${gold})`} d={finialD} stroke="#241806" strokeWidth={0.42} strokeLinejoin="round" />
      <Path fill={`url(#${goldEdge})`} d={finialD} opacity={0.35} />
    </Svg>
  );
}

/**
 * Baby-pink fabric bow: mirrored loops + vertical knot (no bitmap). Gradients and faint rib
 * strokes read as soft muslin; left/right paths are explicit x-mirrors at x=100.
 */
function BowGraphic({ scale }: { scale: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fabricL = `bowL${uid}`;
  const fabricR = `bowR${uid}`;
  const knotG = `bowK${uid}`;
  const foldL = `bowFL${uid}`;
  const foldR = `bowFR${uid}`;
  const sheen = `bowSh${uid}`;

  const vbW = 200;
  const vbH = 100;
  const w = 32 * 1.3 * scale;
  const h = (vbH / vbW) * w;

  const wingL =
    'M 94 30.5 ' +
    'C 74 21 48 18 30 24 ' +
    'C 14 28 6 40 9 52 ' +
    'C 13 68 34 76 58 73 ' +
    'C 76 71 88 62 92 50 ' +
    'C 94.2 41 94.2 36 94 30.5 Z';
  const wingR =
    'M 106 30.5 ' +
    'C 126 21 152 18 170 24 ' +
    'C 186 28 194 40 191 52 ' +
    'C 187 68 166 76 142 73 ' +
    'C 124 71 112 62 108 50 ' +
    'C 105.8 41 105.8 36 106 30.5 Z';

  const knotD =
    'M 95.2 27.5 ' +
    'L 104.8 27.5 ' +
    'Q 106.2 27.5 106.2 29 ' +
    'L 106.2 71 ' +
    'Q 106.2 72.5 104.8 72.5 ' +
    'L 95.2 72.5 ' +
    'Q 93.8 72.5 93.8 71 ' +
    'L 93.8 29 ' +
    'Q 93.8 27.5 95.2 27.5 Z';

  const ribL = [
    'M 94 36 Q 62 40 28 34',
    'M 94 44 Q 58 50 22 46',
    'M 94 52 Q 60 58 26 56',
    'M 94 60 Q 64 64 34 64',
  ];
  const ribR = [
    'M 106 36 Q 138 40 172 34',
    'M 106 44 Q 142 50 178 46',
    'M 106 52 Q 140 58 174 56',
    'M 106 60 Q 136 64 166 64',
  ];

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${vbW} ${vbH}`}>
      <Defs>
        <SvgLinearGradient id={fabricL} x1="100%" y1="8%" x2="0%" y2="92%">
          <Stop offset="0%" stopColor="#fff8fb" />
          <Stop offset="22%" stopColor="#fceaf2" />
          <Stop offset="48%" stopColor="#f5d0e0" />
          <Stop offset="78%" stopColor="#e8b8cc" />
          <Stop offset="100%" stopColor="#d9a3bb" />
        </SvgLinearGradient>
        <SvgLinearGradient id={fabricR} x1="0%" y1="8%" x2="100%" y2="92%">
          <Stop offset="0%" stopColor="#fff8fb" />
          <Stop offset="22%" stopColor="#fceaf2" />
          <Stop offset="48%" stopColor="#f5d0e0" />
          <Stop offset="78%" stopColor="#e8b8cc" />
          <Stop offset="100%" stopColor="#d9a3bb" />
        </SvgLinearGradient>
        <SvgLinearGradient id={knotG} x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#fff5f9" />
          <Stop offset="35%" stopColor="#e8b4c8" />
          <Stop offset="65%" stopColor="#deb0c4" />
          <Stop offset="100%" stopColor="#f9eef4" />
        </SvgLinearGradient>
        <SvgRadialGradient id={foldL} cx="88%" cy="45%" r="55%" gradientUnits="objectBoundingBox">
          <Stop offset="0%" stopColor="rgba(120, 48, 72, 0.22)" />
          <Stop offset="55%" stopColor="rgba(200, 120, 150, 0.06)" />
          <Stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </SvgRadialGradient>
        <SvgRadialGradient id={foldR} cx="12%" cy="45%" r="55%" gradientUnits="objectBoundingBox">
          <Stop offset="0%" stopColor="rgba(120, 48, 72, 0.22)" />
          <Stop offset="55%" stopColor="rgba(200, 120, 150, 0.06)" />
          <Stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </SvgRadialGradient>
        <SvgRadialGradient id={sheen} cx="40%" cy="35%" r="65%" gradientUnits="objectBoundingBox">
          <Stop offset="0%" stopColor="rgba(255, 255, 255, 0.5)" />
          <Stop offset="45%" stopColor="rgba(255, 255, 255, 0.08)" />
          <Stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </SvgRadialGradient>
      </Defs>

      <G opacity={0.14}>
        <Path d={wingL} fill="#3a1828" transform="translate(1.1, 1.35)" />
        <Path d={wingR} fill="#3a1828" transform="translate(1.1, 1.35)" />
      </G>

      <Path
        d={wingL}
        fill={`url(#${fabricL})`}
        stroke="rgba(110, 56, 78, 0.2)"
        strokeWidth={0.45}
        strokeLinejoin="round"
      />
      <Path
        d={wingR}
        fill={`url(#${fabricR})`}
        stroke="rgba(110, 56, 78, 0.2)"
        strokeWidth={0.45}
        strokeLinejoin="round"
      />

      <Path d={wingL} fill={`url(#${foldL})`} />
      <Path d={wingR} fill={`url(#${foldR})`} />

      {ribL.map((d, i) => (
        <Path
          key={`rl${i}`}
          d={d}
          fill="none"
          stroke="rgba(140, 72, 96, 0.14)"
          strokeWidth={0.55}
          strokeLinecap="round"
        />
      ))}
      {ribR.map((d, i) => (
        <Path
          key={`rr${i}`}
          d={d}
          fill="none"
          stroke="rgba(140, 72, 96, 0.14)"
          strokeWidth={0.55}
          strokeLinecap="round"
        />
      ))}

      <Ellipse cx={48} cy={48} rx={34} ry={22} fill={`url(#${sheen})`} opacity={0.35} />
      <Ellipse cx={152} cy={48} rx={34} ry={22} fill={`url(#${sheen})`} opacity={0.35} />

      <Path
        d={knotD}
        fill={`url(#${knotG})`}
        stroke="rgba(90, 48, 64, 0.32)"
        strokeWidth={0.4}
        strokeLinejoin="round"
      />
      <Path
        d="M 94.8 28.5 Q 100 26.8 105.2 28.5"
        fill="none"
        stroke="rgba(255, 255, 255, 0.55)"
        strokeWidth={0.65}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Symmetrical handlebar-style mustache; sits just above the blob mouth. */
function MustacheGraphic({ scale }: { scale: number }) {
  const vbW = 76;
  const vbH = 22;
  /** ~⅔ of prior on-screen width (`54 → 36`). */
  const w = 36 * scale;
  const h = (vbH / vbW) * w;

  const d =
    'M 6 15 ' +
    'C 10 6 22 4 38 10 ' +
    'C 54 4 66 6 70 15 ' +
    'C 68 19 56 20 38 16 ' +
    'C 20 20 8 19 6 15 Z';

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${vbW} ${vbH}`}>
      <Path d={d} fill="#000000" stroke="#000000" strokeWidth={0.38} strokeLinejoin="round" />
    </Svg>
  );
}

/** Short rounded beard / goatee; sits on the chin just under the mouth opening. */
function BeardGraphic({ scale }: { scale: number }) {
  const vbW = 92;
  const vbH = 40;
  const w = ((23 * 2) / 3) * scale;
  const h = (vbH / vbW) * w;

  const d =
    'M 8 8 ' +
    'C 8 1 26 0 46 0 ' +
    'C 66 0 84 1 84 8 ' +
    'C 84 22 68 38 46 40 ' +
    'C 24 38 8 22 8 8 Z';

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${vbW} ${vbH}`}>
      <Path d={d} fill="#000000" stroke="#000000" strokeWidth={(0.22 * 2) / 3} strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Wide smile with teeth and blue braces. Placement uses {@link styles.mouthBracesSlot} (face %),
 * not texture bbox math — the happy PNG is scaled so 170/682 does not land on the real mouth.
 */
function BracesMouthGraphic() {
  const blue = '#1d6fe8';
  const blueDark = '#155cc9';
  const wire = '#9ca3af';
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 42" preserveAspectRatio="xMidYMid meet">
      <Path
        d="M 10 28 Q 50 38 90 28 Q 50 34 10 28"
        fill="#c45870"
        stroke="#8f3550"
        strokeWidth={0.72}
        strokeLinejoin="round"
      />
      <Path d="M 14 26 Q 50 18 86 26 L 84 32 Q 50 36 16 32 Z" fill="#3a1622" />
      <Path
        d="M 17 25.2 Q 50 22.5 83 25.2 L 81.5 31.8 Q 50 34 18.5 31.8 Z"
        fill="#f4f2ec"
        stroke="#d8d4cc"
        strokeWidth={0.45}
      />
      <Path d="M 26 25.4 L 26 31.6" stroke="#c5c1b8" strokeWidth={0.48} strokeLinecap="round" />
      <Path d="M 36 25.3 L 36 31.7" stroke="#c5c1b8" strokeWidth={0.48} strokeLinecap="round" />
      <Path d="M 46 25.2 L 46 31.8" stroke="#c5c1b8" strokeWidth={0.48} strokeLinecap="round" />
      <Path d="M 54 25.2 L 54 31.8" stroke="#c5c1b8" strokeWidth={0.48} strokeLinecap="round" />
      <Path d="M 64 25.3 L 64 31.7" stroke="#c5c1b8" strokeWidth={0.48} strokeLinecap="round" />
      <Path d="M 74 25.4 L 74 31.6" stroke="#c5c1b8" strokeWidth={0.48} strokeLinecap="round" />
      <Path
        d="M 21 23.5 Q 50 19 79 23.5"
        stroke={wire}
        strokeWidth={1.12}
        fill="none"
        strokeLinecap="round"
      />
      <Path d="M 19 25 L 81 25" stroke={blue} strokeWidth={2} strokeLinecap="round" />
      <Path d="M 19 25 L 19 27.2" stroke={blueDark} strokeWidth={1.45} strokeLinecap="round" />
      <Path d="M 81 25 L 81 27.2" stroke={blueDark} strokeWidth={1.45} strokeLinecap="round" />
      <Path d="M 28 24.8 L 28 26.4" stroke={blue} strokeWidth={1.28} strokeLinecap="round" />
      <Path d="M 38 24.7 L 38 26.3" stroke={blue} strokeWidth={1.28} strokeLinecap="round" />
      <Path d="M 48 24.6 L 48 26.2" stroke={blue} strokeWidth={1.28} strokeLinecap="round" />
      <Path d="M 52 24.6 L 52 26.2" stroke={blue} strokeWidth={1.28} strokeLinecap="round" />
      <Path d="M 62 24.7 L 62 26.3" stroke={blue} strokeWidth={1.28} strokeLinecap="round" />
      <Path d="M 72 24.8 L 72 26.4" stroke={blue} strokeWidth={1.28} strokeLinecap="round" />
      <Path d="M 19 30.2 L 81 30.2" stroke={blue} strokeWidth={1.68} strokeLinecap="round" />
      <Path d="M 19 30.2 L 19 32.1" stroke={blueDark} strokeWidth={1.32} strokeLinecap="round" />
      <Path d="M 81 30.2 L 81 32.1" stroke={blueDark} strokeWidth={1.32} strokeLinecap="round" />
      <Path d="M 28 30 L 28 31.6" stroke={blue} strokeWidth={1.15} strokeLinecap="round" />
      <Path d="M 38 30 L 38 31.6" stroke={blue} strokeWidth={1.15} strokeLinecap="round" />
      <Path d="M 48 29.9 L 48 31.5" stroke={blue} strokeWidth={1.15} strokeLinecap="round" />
      <Path d="M 52 29.9 L 52 31.5" stroke={blue} strokeWidth={1.15} strokeLinecap="round" />
      <Path d="M 62 30 L 62 31.6" stroke={blue} strokeWidth={1.15} strokeLinecap="round" />
      <Path d="M 72 30 L 72 31.6" stroke={blue} strokeWidth={1.15} strokeLinecap="round" />
      <Path
        d="M 8 27 Q 50 9 92 27 Q 50 21 8 27"
        fill="#de7a94"
        stroke="#a84a62"
        strokeWidth={0.76}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PoutLipsGraphic() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradLower = `poutL${uid}`;
  const gradUpper = `poutU${uid}`;

  const lowerLip =
    'M 4 47 ' +
    'C 4 44 26 41 50 44 ' +
    'C 74 41 96 44 96 47 ' +
    'C 100 60 93 76 50 79 ' +
    'C 7 76 0 60 4 47 Z';

  const upperLip =
    'M 6 46 ' +
    'C 2 30 20 14 50 18 ' +
    'C 80 14 98 30 94 46 ' +
    'C 90 51 72 49 50 46 ' +
    'C 28 49 10 51 6 46 Z';

  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 78" preserveAspectRatio="xMidYMid meet">
      <Defs>
        <SvgRadialGradient id={gradLower} cx="50%" cy="36%" r="78%" gradientUnits="objectBoundingBox">
          <Stop offset="0%" stopColor="#f27892" />
          <Stop offset="45%" stopColor="#d42852" />
          <Stop offset="100%" stopColor="#6e0f24" />
        </SvgRadialGradient>
        <SvgLinearGradient id={gradUpper} x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#ff9eb4" />
          <Stop offset="55%" stopColor="#e03058" />
          <Stop offset="100%" stopColor="#8a1430" />
        </SvgLinearGradient>
      </Defs>
      <Path
        d={lowerLip}
        fill={`url(#${gradLower})`}
        stroke="#4a0818"
        strokeWidth={0.55}
        strokeLinejoin="round"
      />
      <Path
        d={upperLip}
        fill={`url(#${gradUpper})`}
        stroke="#4a0818"
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
      <Path
        d="M 44 24 Q 50 20 56 24"
        fill="none"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth={1.1}
        strokeLinecap="round"
      />
      <Ellipse cx={38} cy={58} rx={9} ry={5} fill="rgba(255, 220, 230, 0.35)" />
      <Ellipse cx={62} cy={58} rx={9} ry={5} fill="rgba(255, 220, 230, 0.35)" />
    </Svg>
  );
}

function LongLashesGraphic() {
  const sw = 1.05 * FACE_GLOBAL_SCALE;
  const ink = '#120f18';
  return (
    <Svg width="100%" height="100%" viewBox="0 0 128 34" preserveAspectRatio="xMidYMid meet">
      <G stroke={ink} strokeWidth={sw} strokeLinecap="round" fill="none">
        <Path d="M 22 22 Q 38 15 54 22" opacity={0.9} />
        <Path d="M 74 22 Q 90 15 106 22" opacity={0.9} />
        <Path d="M 26 21 Q 24 11 22 3" />
        <Path d="M 32 20 Q 30 9 28 2" />
        <Path d="M 38 19 Q 37 8 36 1.5" />
        <Path d="M 44 19 Q 44 7.5 45 1.2" />
        <Path d="M 50 20 Q 52 9 55 3.5" />
        <Path d="M 78 20 Q 76 9 74 2" />
        <Path d="M 84 19 Q 83 8 82 1.5" />
        <Path d="M 90 19 Q 91 7.5 93 1.2" />
        <Path d="M 96 20 Q 98 9 101 3.5" />
        <Path d="M 102 21 Q 104 11 106 4" />
        <Path d="M 23 21.5 Q 20 7 18 1.5" strokeWidth={sw * 0.88} />
        <Path d="M 105 21.5 Q 108 7 110 1.5" strokeWidth={sw * 0.88} />
      </G>
    </Svg>
  );
}

/** Hero cape: gathered neckline, gold clasp, deep scalloped hem, vertical drape shading (SVG only). */
export function CapeGraphic({ scale }: { scale: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bodyGrad = `capeB${uid}`;
  const bodyAO = `capeAO${uid}`;
  const sideGrad = `capeS${uid}`;
  const foldDeep = `capeFd${uid}`;
  const goldBody = `capeGb${uid}`;
  const goldEdge = `capeGe${uid}`;

  const vbW = 152;
  const vbH = 96;
  const w = 152 * scale;
  const h = 96 * scale;

  /** Bell silhouette: tight neck, wide flare, deep uneven scallops (inside reads darker in troughs). */
  const hemWave =
    'C 14 90 22 96 34 94 ' +
    'C 44 92.5 50 97.5 60 95.5 ' +
    'C 70 93.5 74 98.2 84 96.5 ' +
    'C 94 94.8 98 97.8 108 95.8 ' +
    'C 118 93.8 128 96.5 138 90 ' +
    'C 142 86 143.5 82 144 78 ';

  const capeD =
    'M 76 11 ' +
    'C 60 8.5 46 11.5 34 18 ' +
    'C 22 26 14 40 11 56 ' +
    'C 8.5 66 9.5 76 12 84 ' +
    hemWave +
    'C 140 62 138 42 128 28 ' +
    'C 118 16 102 9 88 8.5 ' +
    'C 82 8.2 78 9.5 76 11 Z';

  const hemStrokeD = 'M 12 84 ' + hemWave;

  const neckGather: string[] = [
    'M 52 12 Q 56 15 60 19',
    'M 62 10 Q 66 14 68 19',
    'M 84 10 Q 88 14 90 19',
    'M 92 12 Q 96 15 100 19',
  ];

  const drapeFolds: string[] = [
    'M 40 19 C 34 38 32 62 36 88',
    'M 58 17 C 52 42 54 68 58 91',
    'M 76 14 L 76 92',
    'M 94 17 C 100 42 98 68 94 91',
    'M 112 19 C 118 38 120 62 116 88',
  ];

  const claspD =
    'M 76 2.2 ' +
    'L 82.5 12.2 ' +
    'Q 83 13 82 13.5 ' +
    'L 76 11.4 ' +
    'L 70 13.5 ' +
    'Q 69 13 69.5 12.2 ' +
    'L 76 2.2 Z';

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${vbW} ${vbH}`}>
      <Defs>
        <SvgLinearGradient id={bodyGrad} x1="50%" y1="2%" x2="52%" y2="98%">
          <Stop offset="0%" stopColor="#ff5a65" />
          <Stop offset="18%" stopColor="#e81d2d" />
          <Stop offset="42%" stopColor="#c40e1f" />
          <Stop offset="68%" stopColor="#8f0a18" />
          <Stop offset="100%" stopColor="#3d040c" />
        </SvgLinearGradient>
        <SvgRadialGradient id={bodyAO} cx="50%" cy="22%" rx="55%" ry="48%" gradientUnits="objectBoundingBox">
          <Stop offset="0%" stopColor="rgba(255, 230, 230, 0.35)" />
          <Stop offset="38%" stopColor="rgba(255, 80, 90, 0.08)" />
          <Stop offset="72%" stopColor="rgba(60, 0, 10, 0.25)" />
          <Stop offset="100%" stopColor="rgba(20, 0, 4, 0.45)" />
        </SvgRadialGradient>
        <SvgLinearGradient id={sideGrad} x1="0%" y1="30%" x2="100%" y2="70%">
          <Stop offset="0%" stopColor="rgba(0, 0, 0, 0.38)" />
          <Stop offset="22%" stopColor="rgba(180, 20, 30, 0.05)" />
          <Stop offset="50%" stopColor="rgba(255, 100, 110, 0.06)" />
          <Stop offset="78%" stopColor="rgba(180, 20, 30, 0.05)" />
          <Stop offset="100%" stopColor="rgba(0, 0, 0, 0.38)" />
        </SvgLinearGradient>
        <SvgLinearGradient id={foldDeep} x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="rgba(40, 0, 8, 0)" />
          <Stop offset="35%" stopColor="rgba(50, 0, 10, 0.12)" />
          <Stop offset="100%" stopColor="rgba(30, 0, 6, 0.28)" />
        </SvgLinearGradient>
        <SvgLinearGradient id={goldBody} x1="28%" y1="15%" x2="78%" y2="92%">
          <Stop offset="0%" stopColor="#fff2c2" />
          <Stop offset="22%" stopColor="#e8c45a" />
          <Stop offset="55%" stopColor="#c9a227" />
          <Stop offset="100%" stopColor="#7a5a12" />
        </SvgLinearGradient>
        <SvgLinearGradient id={goldEdge} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="rgba(255, 255, 255, 0.55)" />
          <Stop offset="100%" stopColor="rgba(80, 50, 8, 0.35)" />
        </SvgLinearGradient>
      </Defs>

      <Path d={capeD} fill={`url(#${bodyGrad})`} stroke="rgba(50, 0, 8, 0.35)" strokeWidth={0.6} strokeLinejoin="round" />
      <Path d={capeD} fill={`url(#${bodyAO})`} />
      <Path d={capeD} fill={`url(#${sideGrad})`} opacity={0.55} />
      <Path d={capeD} fill={`url(#${foldDeep})`} opacity={0.65} />

      {drapeFolds.map((fd, i) => (
        <Path
          key={`capeDrape${uid}${i}`}
          d={fd}
          fill="none"
          stroke="rgba(45, 0, 10, 0.22)"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      ))}
      {drapeFolds.map((fd, i) => (
        <Path
          key={`capeDrapeHi${uid}${i}`}
          d={fd}
          fill="none"
          stroke="rgba(255, 200, 205, 0.14)"
          strokeWidth={0.85}
          strokeLinecap="round"
        />
      ))}

      {neckGather.map((gd, i) => (
        <Path
          key={`capeNeck${uid}${i}`}
          d={gd}
          fill="none"
          stroke="rgba(35, 0, 8, 0.35)"
          strokeWidth={0.55}
          strokeLinecap="round"
        />
      ))}

      <Path
        d={hemStrokeD}
        fill="none"
        stroke="rgba(25, 0, 6, 0.5)"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d={hemStrokeD}
        fill="none"
        stroke="rgba(255, 160, 170, 0.28)"
        strokeWidth={0.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(0, -0.7)"
      />

      <Path
        d={claspD}
        fill={`url(#${goldBody})`}
        stroke="rgba(55, 35, 6, 0.65)"
        strokeWidth={0.45}
        strokeLinejoin="round"
      />
      <Path d={claspD} fill={`url(#${goldEdge})`} opacity={0.45} />
      <Path
        d="M 73.5 4.5 Q 76 3.2 78.5 4.5"
        fill="none"
        stroke="rgba(255, 255, 255, 0.65)"
        strokeWidth={0.55}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Which expression PNG to use when several expression moods are toggled on (first match wins). */
const BASE_MOOD_PRIORITY: MoodState[] = ['stressed', 'sad', 'calm', 'focused', 'excited', 'happy'];

function pickBaseMood(active: ReadonlySet<MoodState>): MoodState {
  for (const m of BASE_MOOD_PRIORITY) {
    if (active.has(m)) return m;
  }
  return 'happy';
}

export default function BlobFace({
  activeMoods,
  intensity = 0.9,
}: {
  /** Multiple moods can be active (e.g. hat + sunglasses). */
  activeMoods: MoodState[];
  intensity?: number;
}) {
  void intensity;
  const active = useMemo(() => new Set(activeMoods), [activeMoods]);
  const mood = useMemo(() => pickBaseMood(new Set(activeMoods)), [activeMoods]);

  const showFocusedLenses =
    active.has('focused') && !active.has('sunglasses') && !active.has('purple_sunglasses');
  const showSunglasses = active.has('sunglasses') && !active.has('purple_sunglasses');
  const showPurpleSunglasses = active.has('purple_sunglasses');
  const showHat = active.has('hat') && !active.has('cap');
  const showCap = active.has('cap');
  const showCrown2 = active.has('crown2');
  const showCrown = active.has('crown') && !showCrown2;
  const showMustache = active.has('mustache');
  const showBeard = active.has('beard');
  const showLongLashes = active.has('long_lashes');
  const showBow = active.has('bow');
  const showMouthOverlay = active.has('mouth_overlay') && mood === 'happy';
  const showMouth1 = active.has('mouth_1') && mood === 'happy';
  const showMouthBraces = active.has('mouth_braces') && mood === 'happy';
  const showPoutLips = active.has('pout_lips') && mood === 'happy';

  const source =
    mood === 'calm'
      ? require('../../assets/images/blob-face-calm-v1-transparent.png')
      : mood === 'sad'
      ? require('../../assets/images/blob-face-sad-v4-transparent.png')
      : mood === 'excited'
        ? require('../../assets/images/blob-face-excited-v5-transparent.png')
        : mood === 'stressed'
          ? require('../../assets/images/blob-face-stressed-v1-transparent.png')
        : mood === 'focused'
          ? require('../../assets/images/blob-face-focused-v3-transparent.png')
          : require('../../assets/images/blob-face-happy-transparent.png');

  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={styles.faceContainer}>
        <Image source={source} style={styles.happyImage} resizeMode="contain" />
        {showBow && (
          <View style={styles.bowWrap}>
            <BowGraphic scale={FACE_GLOBAL_SCALE} />
          </View>
        )}
        {showMouthOverlay && (
          <View style={styles.mouthOverlayWrap} pointerEvents="none">
            <Image
              source={require('../../assets/images/blob-mouth-happy-transparent.png')}
              style={styles.mouthOverlayImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
        )}
        {showMouth1 && (
          <View style={styles.mouthOverlayWrap} pointerEvents="none">
            <Image
              source={require('../../assets/images/blob-mouth-happy-transparent.png')}
              style={styles.mouth1Image}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
        )}
        {showMouthBraces && (
          <View style={styles.mouthOverlayWrap} pointerEvents="none">
            <View style={styles.mouthBracesSlot}>
              <BracesMouthGraphic />
            </View>
          </View>
        )}
        {showPoutLips && (
          <View style={styles.mouthOverlayWrap} pointerEvents="none">
            <View style={styles.poutLipsSlot}>
              <PoutLipsGraphic />
            </View>
          </View>
        )}
        {showBeard && (
          <View style={styles.beardWrap}>
            <BeardGraphic scale={FACE_GLOBAL_SCALE} />
          </View>
        )}
        {showLongLashes && (
          <View style={styles.longLashesWrap} pointerEvents="none">
            <LongLashesGraphic />
          </View>
        )}
        {showFocusedLenses && (
          <View style={styles.glassesContainer}>
            <View style={styles.lens} />
            <View style={styles.bridge} />
            <View style={styles.lens} />
          </View>
        )}
        {showSunglasses && (
          <View style={styles.sunglassesContainer}>
            <View style={styles.sunLens} />
            <View style={styles.sunBridge} />
            <View style={styles.sunLens} />
          </View>
        )}
        {showPurpleSunglasses && (
          <View style={styles.purpleSunglassesContainer}>
            <View style={styles.purpleSunLens} />
            <View style={styles.purpleSunBridge} />
            <View style={styles.purpleSunLens} />
          </View>
        )}
        {showMustache && (
          <View style={styles.mustacheWrap}>
            <MustacheGraphic scale={FACE_GLOBAL_SCALE} />
          </View>
        )}
        {showHat && (
          <View style={styles.hatWrap}>
            <HatGraphic scale={FACE_GLOBAL_SCALE} />
          </View>
        )}
        {showCap && (
          <View style={styles.capWrap}>
            <ClassicNavyBallCapGraphic scale={FACE_GLOBAL_SCALE} />
          </View>
        )}
        {showCrown && (
          <View style={styles.crownWrap}>
            <CrownGraphic scale={FACE_GLOBAL_SCALE} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    width: 128 * FACE_GLOBAL_SCALE,
    height: 100 * FACE_GLOBAL_SCALE,
    alignSelf: 'center',
  },
  happyImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.06 }],
  },
  /** Bbox in happy face texture space (1024 wide); tweak % if the overlay drifts vs `contain` letterboxing. */
  mouthOverlayWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    pointerEvents: 'none',
    zIndex: 1,
  },
  /**
   * Sits just under the cheek blush on the happy texture; `top` is tuned vs crop bbox because
   * `contain` + scale shifts perceived alignment.
   */
  mouthOverlayImage: {
    position: 'absolute',
    top: `${(170 / 682) * 100}%`,
    width: `${(82 / 1024) * 100}%`,
    aspectRatio: 82 / 63,
    transform: [{ scale: 1.06 }],
  },
  /** Same bbox as {@link mouthOverlayImage}; `top` reduced in texture space to sit slightly higher. */
  mouth1Image: {
    position: 'absolute',
    top: `${((170 - 14) / 682) * 100}%`,
    width: `${(82 / 1024) * 100}%`,
    aspectRatio: 82 / 63,
    transform: [{ scale: 1.06 }],
  },
  /**
   * Between mustache ({@link mustacheWrap} ~50%) and beard (~64.5%) — same band as the actual mouth
   * on the scaled happy face (texture-based `mouthOverlayImage` top is wrong for SVG-only art).
   */
  mouthBracesSlot: {
    position: 'absolute',
    top: '58%',
    width: `${((82 * 1.55) / 1024) * 100}%`,
    aspectRatio: 82 / 63,
    alignSelf: 'center',
    transform: [{ scale: 1.08 }],
  },
  /** Same mouth band as braces; wider shorter frame suits fat lips. */
  poutLipsSlot: {
    position: 'absolute',
    top: '56%',
    width: `${((82 * 1.72) / 1024) * 100}%`,
    aspectRatio: 100 / 72,
    alignSelf: 'center',
    transform: [{ scale: 1.1 }],
    zIndex: 2,
  },
  /** Forehead bow just above the brows (glasses sit ~33%). */
  bowWrap: {
    position: 'absolute',
    top: '20%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  faceContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  glassesContainer: {
    position: 'absolute',
    top: '33%',
    left: '50%',
    transform: [{ translateX: -25.5 * FACE_GLOBAL_SCALE }],
    flexDirection: 'row',
    alignItems: 'center',
  },
  lens: {
    width: 24 * FACE_GLOBAL_SCALE,
    height: 24 * FACE_GLOBAL_SCALE,
    borderRadius: 12 * FACE_GLOBAL_SCALE,
    borderWidth: 1.25 * FACE_GLOBAL_SCALE,
    borderColor: 'rgba(0,0,0,0.8)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  bridge: {
    width: 5 * FACE_GLOBAL_SCALE,
    height: 1.25 * FACE_GLOBAL_SCALE,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  sunglassesContainer: {
    position: 'absolute',
    top: '33%',
    left: '50%',
    transform: [{ translateX: -29 * FACE_GLOBAL_SCALE }],
    flexDirection: 'row',
    alignItems: 'center',
  },
  sunLens: {
    width: 26 * FACE_GLOBAL_SCALE,
    height: 22 * FACE_GLOBAL_SCALE,
    borderRadius: 11 * FACE_GLOBAL_SCALE,
    borderWidth: 2 * FACE_GLOBAL_SCALE,
    borderColor: '#121212',
    backgroundColor: 'rgba(12, 18, 28, 0.48)',
  },
  sunBridge: {
    width: 6 * FACE_GLOBAL_SCALE,
    height: 2.25 * FACE_GLOBAL_SCALE,
    borderRadius: 1,
    backgroundColor: '#121212',
  },
  purpleSunglassesContainer: {
    position: 'absolute',
    top: '33%',
    left: '50%',
    transform: [{ translateX: -29 * FACE_GLOBAL_SCALE }],
    flexDirection: 'row',
    alignItems: 'center',
  },
  purpleSunLens: {
    width: 26 * FACE_GLOBAL_SCALE,
    height: 22 * FACE_GLOBAL_SCALE,
    borderRadius: 11 * FACE_GLOBAL_SCALE,
    borderWidth: 2 * FACE_GLOBAL_SCALE,
    borderColor: '#2a1248',
    backgroundColor: 'rgba(120, 55, 195, 0.52)',
  },
  purpleSunBridge: {
    width: 6 * FACE_GLOBAL_SCALE,
    height: 2.25 * FACE_GLOBAL_SCALE,
    borderRadius: 1,
    backgroundColor: '#2a1248',
  },
  /**
   * Clear band above the mouth (lower % = higher on face).
   */
  mustacheWrap: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0.5 },
        shadowOpacity: 0.2,
        shadowRadius: 1,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  /** Chin beard just under the mouth (higher % = lower on face). */
  beardWrap: {
    position: 'absolute',
    top: '64.5%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0.5 },
        shadowOpacity: 0.18,
        shadowRadius: 1,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  /** Upper eyelid band (~same vertical band as glasses at 33%); under lens overlays in paint order. */
  longLashesWrap: {
    position: 'absolute',
    top: '24%',
    left: '5%',
    right: '5%',
    height: '22%',
    zIndex: 1,
  },
  /** Position from top of face area — more negative / lower `%` moves hat up. */
  hatWrap: {
    position: 'absolute',
    top: '-5%',
    left: 0,
    right: 0,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.28,
        shadowRadius: 2.5,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  /** Navy fitted ball cap wrap (Yankees-style colorway); same shadow treatment as hatWrap. */
  capWrap: {
    position: 'absolute',
    top: '-2%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.26,
        shadowRadius: 2.2,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  /**
   * Tall ornate crown: strong negative `top` clears glasses (`top: 33%`) without clipping.
   */
  crownWrap: {
    position: 'absolute',
    top: '-43%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 3,
      },
      android: {
        elevation: 5,
      },
      default: {},
    }),
  },
});
