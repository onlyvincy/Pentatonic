import React from 'react';
import { InstrumentType, PathId } from '../types/practice';

interface PathIllustrationProps {
  pathId: PathId;
  className?: string;
}

export const PathIllustration: React.FC<PathIllustrationProps> = ({
  pathId,
  className = 'w-full h-full',
}) => {
  if (pathId === 'groove_pocket') {
    return (
      <svg
        viewBox="0 0 240 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="bass-pocket-glow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#39FF14" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#39FF14" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="120" cy="80" r="76" fill="url(#bass-pocket-glow)" />

        {/* 4-String Bass Neck Grid */}
        <path
          d="M28 46 L212 38 L212 122 L28 114 Z"
          fill="#090909"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1.2"
        />
        <line x1="70" y1="44" x2="70" y2="116" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
        <line x1="116" y1="42" x2="116" y2="118" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
        <line x1="164" y1="40" x2="164" y2="120" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />

        {/* 4 Thick Bass Strings */}
        {[0, 1, 2, 3].map((i) => {
          const yL = 56 + i * 16;
          const yR = 51 + i * 19;
          return (
            <line
              key={i}
              x1="28"
              y1={yL}
              x2="212"
              y2={yR}
              stroke={i >= 2 ? 'rgba(57,255,20,0.55)' : 'rgba(255,255,255,0.34)'}
              strokeWidth={1.6 + i * 0.55}
            />
          );
        })}

        {/* Root & Octave Pocket Anchor Dots */}
        <circle cx="93" cy="100" r="6" fill="#39FF14" stroke="#FFFFFF" strokeWidth="1.8" />
        <circle cx="140" cy="68" r="5.5" fill="#FFFFFF" stroke="#39FF14" strokeWidth="1.6" />
        <line
          x1="98"
          y1="96"
          x2="135"
          y2="71"
          stroke="#39FF14"
          strokeWidth="1.8"
          strokeDasharray="3 3"
        />

        {/* Bass Pocket Waveform Bars */}
        <rect x="44" y="132" width="10" height="18" rx="2.5" fill="#39FF14" />
        <rect x="62" y="141" width="8" height="9" rx="2" fill="rgba(251,191,36,0.55)" />
        <rect x="78" y="136" width="10" height="14" rx="2.5" fill="#FFFFFF" />
        <rect x="96" y="142" width="8" height="8" rx="2" fill="rgba(255,255,255,0.28)" />
        <rect x="112" y="132" width="10" height="18" rx="2.5" fill="#39FF14" />
        <rect x="130" y="141" width="8" height="9" rx="2" fill="rgba(251,191,36,0.55)" />
        <rect x="146" y="135" width="10" height="15" rx="2.5" fill="#FFFFFF" />
        <rect x="164" y="138" width="28" height="12" rx="3" fill="rgba(57,255,20,0.22)" stroke="#39FF14" strokeWidth="1.2" />
      </svg>
    );
  }

  if (pathId === 'modern_bass') {
    return (
      <svg
        viewBox="0 0 240 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="bass-modern-glow" cx="50%" cy="46%" r="55%">
            <stop offset="0%" stopColor="#39FF14" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#39FF14" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="122" cy="78" r="76" fill="url(#bass-modern-glow)" />

        {/* 4-String Modern Bass Neck */}
        <path
          d="M26 48 L214 36 L214 124 L26 112 Z"
          fill="#090909"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1.2"
        />
        <line x1="68" y1="46" x2="68" y2="114" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
        <line x1="114" y1="43" x2="114" y2="117" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
        <line x1="160" y1="40" x2="160" y2="120" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />

        {/* 4 Thick Bass Strings */}
        {[0, 1, 2, 3].map((i) => {
          const yL = 58 + i * 15;
          const yR = 50 + i * 19;
          return (
            <line
              key={i}
              x1="26"
              y1={yL}
              x2="214"
              y2={yR}
              stroke={i === 0 || i === 3 ? 'rgba(57,255,20,0.68)' : 'rgba(255,255,255,0.28)'}
              strokeWidth={1.6 + i * 0.55}
            />
          );
        })}

        {/* Slap Thumb Impact Halo on Low E */}
        <circle cx="91" cy="103" r="11" fill="rgba(57,255,20,0.18)" stroke="#39FF14" strokeWidth="1.5" />
        <circle cx="91" cy="103" r="5" fill="#39FF14" />

        {/* Pop Upward Vector on High G */}
        <circle cx="137" cy="54" r="6" fill="#FFFFFF" stroke="#39FF14" strokeWidth="1.8" />
        <path
          d="M137 42 L137 24 M131 30 L137 22 L143 30"
          stroke="#39FF14"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Fast Legato / Slide Trail */}
        <path
          d="M150 76 Q174 62 198 74"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="4 2"
        />
        <circle cx="198" cy="74" r="4.5" fill="#39FF14" />
      </svg>
    );
  }

  if (pathId === 'rhythm') {
    return (
      <svg
        viewBox="0 0 240 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="rhythm-glow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#39FF14" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#39FF14" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="120" cy="80" r="76" fill="url(#rhythm-glow)" />

        {/* Subtle Fretboard Perspective Grid */}
        <path
          d="M28 42 L212 34 L212 126 L28 118 Z"
          fill="#090909"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1.2"
        />

        {/* Fret Wires */}
        <line x1="68" y1="40" x2="68" y2="120" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
        <line x1="112" y1="38" x2="112" y2="122" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
        <line x1="158" y1="36" x2="158" y2="124" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />

        {/* 6 Strings */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const yL = 50 + i * 12;
          const yR = 45 + i * 14;
          const isBass = i >= 3;
          return (
            <line
              key={i}
              x1="28"
              y1={yL}
              x2="212"
              y2={yR}
              stroke={isBass ? 'rgba(57,255,20,0.45)' : 'rgba(255,255,255,0.28)'}
              strokeWidth={0.9 + i * 0.25}
            />
          );
        })}

        {/* Movable Barrè Clamp (Index Finger Bar across Fret) */}
        <rect
          x="79"
          y="42"
          width="14"
          height="76"
          rx="7"
          fill="rgba(57,255,20,0.2)"
          stroke="#39FF14"
          strokeWidth="2"
        />
        <circle cx="86" cy="52" r="4.2" fill="#39FF14" />
        <circle cx="86" cy="108" r="4.2" fill="#39FF14" />

        {/* Chord Voicing Dots (Movable Barre Shape) */}
        <circle cx="135" cy="79" r="5" fill="#FFFFFF" />
        <circle cx="135" cy="94" r="5" fill="#FFFFFF" />
        <circle cx="112" cy="65" r="4.5" fill="#FFFFFF" />

        {/* Bridge / Palm-Mute Zone & Rhythmic Pulse Bars */}
        <rect
          x="176"
          y="33"
          width="18"
          height="94"
          rx="5"
          fill="#000000"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1.4"
          strokeDasharray="3 3"
        />
        {/* Palm Mute Energy Arc */}
        <path
          d="M170 48 C162 64 162 96 170 112"
          stroke="#39FF14"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Crisp 4/4 Accent Waveform Bars at Bottom */}
        <rect x="44" y="136" width="8" height="14" rx="2" fill="#39FF14" />
        <rect x="60" y="142" width="8" height="8" rx="2" fill="rgba(255,255,255,0.28)" />
        <rect x="76" y="138" width="8" height="12" rx="2" fill="#FFFFFF" />
        <rect x="92" y="143" width="8" height="7" rx="2" fill="rgba(255,255,255,0.28)" />
        <rect x="108" y="136" width="8" height="14" rx="2" fill="#39FF14" />
        <rect x="124" y="142" width="8" height="8" rx="2" fill="rgba(255,255,255,0.28)" />
        <rect x="140" y="138" width="8" height="12" rx="2" fill="#FFFFFF" />
        <rect x="156" y="143" width="8" height="7" rx="2" fill="rgba(255,255,255,0.28)" />
        <rect x="172" y="139" width="22" height="11" rx="3" fill="rgba(57,255,20,0.25)" stroke="#39FF14" strokeWidth="1.2" />
      </svg>
    );
  }

  // 'solista': High-Fret Bending, Vibrato Sine Wave, Legato Slur & Precision Pick
  return (
    <svg
      viewBox="0 0 240 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="solista-glow" cx="50%" cy="46%" r="55%">
          <stop offset="0%" stopColor="#39FF14" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#39FF14" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="122" cy="76" r="76" fill="url(#solista-glow)" />

      {/* Sleek High-Register Fretboard Neck */}
      <path
        d="M26 48 L214 32 L214 126 L26 112 Z"
        fill="#090909"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="1.2"
      />

      {/* Fret Wires (Upper Register Spacing) */}
      <line x1="66" y1="45" x2="66" y2="115" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
      <line x1="108" y1="41" x2="108" y2="119" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
      <line x1="148" y1="38" x2="148" y2="122" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
      <line x1="184" y1="35" x2="184" y2="125" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />

      {/* Fret Inlay Dots (12th fret double dot style) */}
      <circle cx="166" cy="64" r="2.3" fill="rgba(255,255,255,0.22)" />
      <circle cx="166" cy="96" r="2.3" fill="rgba(255,255,255,0.22)" />

      {/* Background Strings */}
      <line x1="26" y1="58" x2="214" y2="44" stroke="rgba(255,255,255,0.24)" strokeWidth="1" />
      <line x1="26" y1="90" x2="214" y2="96" stroke="rgba(255,255,255,0.24)" strokeWidth="1.4" />
      <line x1="26" y1="102" x2="214" y2="112" stroke="rgba(255,255,255,0.24)" strokeWidth="1.7" />

      {/* Active Bent String (String pushed upward into full-tone bend) */}
      <path
        d="M26 74 Q128 42 214 68"
        stroke="#39FF14"
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* Legato Slur Arc (Hammer-On / Pull-Off) */}
      <path
        d="M86 89 Q106 72 128 89"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="3 2"
      />
      <circle cx="86" cy="93" r="4.5" fill="#000000" stroke="#FFFFFF" strokeWidth="1.8" />

      {/* Bend Target Finger Node + Upward Vector */}
      <circle cx="128" cy="57" r="10" fill="rgba(57,255,20,0.18)" stroke="#39FF14" strokeWidth="1.4" />
      <circle cx="128" cy="57" r="5.5" fill="#39FF14" stroke="#FFFFFF" strokeWidth="1.8" />
      <path
        d="M128 42 L128 24 M122 30 L128 22 L134 30"
        stroke="#39FF14"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Expressive Vibrato Sine Wave Trailing Note */}
      <path
        d="M144 56 Q152 46 160 56 T176 56 T192 56 T208 56"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Precision Guitar Pick Silhouette (Bottom Right) */}
      <g transform="translate(178 112) rotate(-18)">
        <path
          d="M14 0 C22 0 27 6 27 14 C27 23 18 32 14 34 C10 32 1 23 1 14 C1 6 6 0 14 0 Z"
          fill="#39FF14"
          stroke="#000000"
          strokeWidth="1.5"
        />
        <line x1="9" y1="11" x2="19" y2="11" stroke="#000000" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="11" y1="16" x2="17" y2="16" stroke="#000000" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </svg>
  );
};

interface IniziaButtonIllustrationProps {
  isHolding?: boolean;
  holdProgress?: number;
  instrument?: InstrumentType;
}

export const IniziaButtonIllustration: React.FC<
  IniziaButtonIllustrationProps
> = ({ isHolding = false, holdProgress = 0, instrument = 'guitar' }) => {
  const glowOpacity = isHolding ? 0.28 + holdProgress * 0.34 : 0.24;
  const isBass = instrument === 'bass';
  const stringOffsets = isBass ? [-21, -7, 7, 21] : [-25, -15, -5, 5, 15, 25];
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none relative z-10 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="inizia-center-glow" cx="50%" cy="44%" r="52%">
          <stop offset="0%" stopColor="#39FF14" stopOpacity={glowOpacity} />
          <stop offset="100%" stopColor="#39FF14" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="inizia-chrome" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="32%" stopColor="#94A3B8" />
          <stop offset="56%" stopColor="#F8FAFC" />
          <stop offset="82%" stopColor="#475569" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>
        <linearGradient id="inizia-neon-pick" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#94FF7E" />
          <stop offset="50%" stopColor="#39FF14" />
          <stop offset="100%" stopColor="#18B800" />
        </linearGradient>
        <clipPath id="inizia-circle-clip">
          <circle cx="100" cy="100" r="96" />
        </clipPath>
      </defs>

      <g clipPath="url(#inizia-circle-clip)">
        <circle cx="100" cy="100" r="96" fill="#050608" />
        <circle cx="100" cy="92" r="88" fill="url(#inizia-center-glow)" />

        {/* Graduated Technical Chrome Rings */}
        <circle
          cx="100"
          cy="100"
          r="84"
          stroke="url(#inizia-chrome)"
          strokeOpacity="0.45"
          strokeWidth="1.2"
          strokeDasharray="3 5"
        />
        <circle
          cx="100"
          cy="100"
          r="66"
          stroke="rgba(57,255,20,0.28)"
          strokeWidth="1"
        />

        {/* Perspective Guitar or Bass Strings across the Stage */}
        {stringOffsets.map((dy, idx) => (
          <line
            key={idx}
            x1="12"
            y1={84 + dy * 0.72}
            x2="188"
            y2={84 + dy * 1.15}
            stroke={
              idx === (isBass ? 2 : 2) ? 'rgba(57,255,20,0.78)' : 'url(#inizia-chrome)'
            }
            strokeOpacity={idx === 2 ? 1 : 0.32}
            strokeWidth={isBass ? 1.5 + idx * 0.45 : 0.85 + idx * 0.18}
          />
        ))}

        {/* Perspective Chrome Fret Markers */}
        <line x1="56" y1="54" x2="56" y2="114" stroke="url(#inizia-chrome)" strokeOpacity="0.35" strokeWidth="1.1" />
        <line x1="144" y1="48" x2="144" y2="120" stroke="url(#inizia-chrome)" strokeOpacity="0.35" strokeWidth="1.1" />

        {/* Harmonic Sound Wave Arc across Strings */}
        <path
          d="M28 83 Q58 64 82 83 T132 83 T174 83"
          stroke="url(#inizia-chrome)"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.72"
        />

        {/* Geometric Precision Pick Core with Chrome Rim */}
        <g transform="translate(100 79)">
          <path
            d="M0 -30 C16 -30 26 -17 26 -2 C26 16 8 32 0 36 C-8 32 -26 16 -26 -2 C-26 -17 -16 -30 0 -30 Z"
            fill="url(#inizia-neon-pick)"
            stroke="url(#inizia-chrome)"
            strokeWidth="2.2"
          />
          {/* Play Vector Cutout inside Pick */}
          <path
            d="M-6 -11 L11 -1 L-6 9 Z"
            fill="#050608"
          />
        </g>

        {/* Technical Fretboard Nodes */}
        <circle cx="56" cy="79" r="3.4" fill="#050608" stroke="url(#inizia-chrome)" strokeWidth="1.6" />
        <circle cx="144" cy="90" r="3.4" fill="#050608" stroke="#39FF14" strokeWidth="1.6" />

        {/* Crisp Centered Chrome INIZIA Typography */}
        <text
          x="100"
          y="151"
          textAnchor="middle"
          fill="url(#inizia-chrome)"
          fontSize="18"
          fontWeight="900"
          letterSpacing="0.26em"
          className="font-brand uppercase"
        >
          INIZIA
        </text>
        <rect x="86" y="160" width="28" height="2" rx="1" fill="#39FF14" />
      </g>
    </svg>
  );
};

export const CoachVectorEmblem: React.FC<{
  className?: string;
  instrument?: InstrumentType;
}> = ({ className = 'h-6 w-6', instrument = 'guitar' }) => (
  <svg
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="coach-chrome" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="50%" stopColor="#94A3B8" />
        <stop offset="100%" stopColor="#E2E8F0" />
      </linearGradient>
    </defs>
    {instrument === 'bass' ? (
      <>
        {[12, 17, 23, 28].map((y, idx) => (
          <line
            key={y}
            x1="5"
            y1={y}
            x2="35"
            y2={y}
            stroke={idx >= 2 ? 'rgba(57,255,20,0.55)' : 'url(#coach-chrome)'}
            strokeOpacity={idx >= 2 ? 0.9 : 0.45}
            strokeWidth={1 + idx * 0.35}
          />
        ))}
        <circle
          cx="20"
          cy="20"
          r="12"
          fill="#050608"
          stroke="#39FF14"
          strokeWidth="2"
        />
      </>
    ) : (
      <>
        <line x1="5" y1="14" x2="35" y2="12" stroke="url(#coach-chrome)" strokeOpacity="0.45" strokeWidth="1" />
        <line x1="5" y1="20" x2="35" y2="20" stroke="rgba(57,255,20,0.55)" strokeWidth="1.2" />
        <line x1="5" y1="26" x2="35" y2="28" stroke="url(#coach-chrome)" strokeOpacity="0.45" strokeWidth="1" />
        <path
          d="M20 6C28.5 6 33 11.5 33 18.5C33 26.5 24 33.5 20 35C16 33.5 7 26.5 7 18.5C7 11.5 11.5 6 20 6Z"
          fill="#39FF14"
          stroke="url(#coach-chrome)"
          strokeWidth="1.4"
        />
      </>
    )}
    <path
      d="M13 20H16.5L18.5 15.5L21.5 24.5L23.5 20H27"
      stroke={instrument === 'bass' ? '#39FF14' : '#050608'}
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const OnboardingHeroGuitarBg: React.FC<{
  className?: string;
  instrument?: InstrumentType;
}> = ({
  className = 'w-full h-full',
  instrument = 'guitar',
}) => (
  <svg
    viewBox="0 0 420 560"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <filter id="dream-blur-heavy" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="28" />
      </filter>
      <filter id="dream-blur-soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
      <filter id="dream-blur-whisper" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.5" />
      </filter>

      <linearGradient id="dream-curve-neon" x1="15%" y1="10%" x2="85%" y2="90%">
        <stop offset="0%" stopColor="#39FF14" stopOpacity="0" />
        <stop offset="35%" stopColor="#39FF14" stopOpacity="0.6" />
        <stop offset="70%" stopColor="#A6FF96" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#39FF14" stopOpacity="0" />
      </linearGradient>

      <linearGradient id="dream-curve-mist" x1="20%" y1="0%" x2="80%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
        <stop offset="45%" stopColor="#E2E8F0" stopOpacity="0.38" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>

      <linearGradient id="dream-string-fade" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
        <stop offset="48%" stopColor="#FFFFFF" stopOpacity="0.28" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>

      <linearGradient id="dream-string-neon" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#39FF14" stopOpacity="0" />
        <stop offset="50%" stopColor="#39FF14" stopOpacity="0.65" />
        <stop offset="100%" stopColor="#39FF14" stopOpacity="0" />
      </linearGradient>
    </defs>

    {/* Dreamy Atmospheric Nebula / Stage Fog */}
    <g filter="url(#dream-blur-heavy)">
      <ellipse cx="220" cy="255" rx="135" ry="155" fill="#39FF14" fillOpacity="0.16" />
      <ellipse cx="165" cy="340" rx="115" ry="95" fill="#E2E8F0" fillOpacity="0.09" />
      <ellipse cx="275" cy="175" rx="90" ry="110" fill="#39FF14" fillOpacity="0.11" />
    </g>

    {/* Soft Out-of-Focus Dream Bokeh Orbs */}
    <g filter="url(#dream-blur-soft)">
      <circle cx="118" cy="182" r="18" fill="#39FF14" fillOpacity="0.18" />
      <circle cx="305" cy="235" r="24" fill="#FFFFFF" fillOpacity="0.1" />
      <circle cx="268" cy="395" r="28" fill="#39FF14" fillOpacity="0.14" />
      <circle cx="146" cy="408" r="14" fill="#FFFFFF" fillOpacity="0.09" />
    </g>

    {/* Abstract Dissolving Guitar Curves & Floating Strings (Diagonal Dream Silhouette) */}
    <g transform="translate(215 282) rotate(28) translate(-210 -280)">
      {/* Ghostly Blurred Inner Silhouette */}
      <path
        d="M175 230 C138 258, 128 310, 142 356 C158 408, 224 432, 268 394 C298 368, 294 316, 262 284"
        stroke="#39FF14"
        strokeOpacity="0.22"
        strokeWidth="16"
        strokeLinecap="round"
        filter="url(#dream-blur-soft)"
      />

      {/* Open Fluid Guitar Contour Ribbons (Never Closed, Fading into Darkness) */}
      <path
        d="M188 214 C150 232, 134 274, 146 312 C156 342, 122 372, 138 416 C156 462, 230 474, 272 436"
        stroke="url(#dream-curve-neon)"
        strokeWidth="2.4"
        strokeLinecap="round"
        filter="url(#dream-blur-whisper)"
      />
      <path
        d="M236 226 C268 248, 276 286, 260 318 C248 344, 286 376, 264 422 C244 464, 174 476, 136 438"
        stroke="url(#dream-curve-mist)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M196 244 C164 268, 158 310, 172 344 C186 378, 166 416, 206 438"
        stroke="url(#dream-curve-mist)"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.7"
      />

      {/* Ethereal Fading Strings Dissolving Upward into the Dream */}
      {(instrument === 'bass' ? [-14, -5, 5, 14] : [-15, -9, -3, 3, 9, 15]).map((dx, idx) => {
        const isNeon = instrument === 'bass' ? idx === 2 : idx === 3;
        return (
          <line
            key={`dream-str-${idx}`}
            x1={210 + dx}
            y1="10"
            x2={210 + dx * 1.45}
            y2="465"
            stroke={isNeon ? 'url(#dream-string-neon)' : 'url(#dream-string-fade)'}
            strokeWidth={
              instrument === 'bass'
                ? isNeon
                  ? '2.8'
                  : '1.8'
                : isNeon
                ? '1.8'
                : '0.9'
            }
            filter={isNeon ? 'url(#dream-blur-whisper)' : undefined}
          />
        );
      })}

      {/* Floating Abstract Soundhole / Resonance Halo */}
      <circle
        cx="210"
        cy="346"
        r="38"
        stroke="url(#dream-curve-neon)"
        strokeWidth="1.6"
        filter="url(#dream-blur-whisper)"
      />
      <circle
        cx="210"
        cy="346"
        r="58"
        stroke="url(#dream-curve-mist)"
        strokeWidth="1"
        strokeDasharray="6 10"
      />
    </g>

    {/* Dreamy Floating Harmonic Waves */}
    <path
      d="M-10 318 Q95 250 205 304 T430 256"
      stroke="url(#dream-curve-neon)"
      strokeWidth="2"
      strokeLinecap="round"
      filter="url(#dream-blur-whisper)"
    />
    <path
      d="M-10 342 Q125 288 235 332 T430 294"
      stroke="url(#dream-curve-mist)"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);
