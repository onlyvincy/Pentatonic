import React from 'react';
import { PathId } from '../types/practice';

interface PathIllustrationProps {
  pathId: PathId;
  className?: string;
}

export const PathIllustration: React.FC<PathIllustrationProps> = ({
  pathId,
  className = 'w-full h-full',
}) => {
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
            <stop offset="0%" stopColor="#FF6B00" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#FF6B00" stopOpacity="0" />
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
              stroke={isBass ? 'rgba(255,107,0,0.45)' : 'rgba(255,255,255,0.28)'}
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
          fill="rgba(255,107,0,0.2)"
          stroke="#FF6B00"
          strokeWidth="2"
        />
        <circle cx="86" cy="52" r="4.2" fill="#FF6B00" />
        <circle cx="86" cy="108" r="4.2" fill="#FF6B00" />

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
          stroke="#FF6B00"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Crisp 4/4 Accent Waveform Bars at Bottom */}
        <rect x="44" y="136" width="8" height="14" rx="2" fill="#FF6B00" />
        <rect x="60" y="142" width="8" height="8" rx="2" fill="rgba(255,255,255,0.28)" />
        <rect x="76" y="138" width="8" height="12" rx="2" fill="#FFFFFF" />
        <rect x="92" y="143" width="8" height="7" rx="2" fill="rgba(255,255,255,0.28)" />
        <rect x="108" y="136" width="8" height="14" rx="2" fill="#FF6B00" />
        <rect x="124" y="142" width="8" height="8" rx="2" fill="rgba(255,255,255,0.28)" />
        <rect x="140" y="138" width="8" height="12" rx="2" fill="#FFFFFF" />
        <rect x="156" y="143" width="8" height="7" rx="2" fill="rgba(255,255,255,0.28)" />
        <rect x="172" y="139" width="22" height="11" rx="3" fill="rgba(255,107,0,0.25)" stroke="#FF6B00" strokeWidth="1.2" />
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
          <stop offset="0%" stopColor="#FF6B00" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#FF6B00" stopOpacity="0" />
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
        stroke="#FF6B00"
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
      <circle cx="128" cy="57" r="10" fill="rgba(255,107,0,0.18)" stroke="#FF6B00" strokeWidth="1.4" />
      <circle cx="128" cy="57" r="5.5" fill="#FF6B00" stroke="#FFFFFF" strokeWidth="1.8" />
      <path
        d="M128 42 L128 24 M122 30 L128 22 L134 30"
        stroke="#FF6B00"
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
          fill="#FF6B00"
          stroke="#000000"
          strokeWidth="1.5"
        />
        <line x1="9" y1="11" x2="19" y2="11" stroke="#000000" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="11" y1="16" x2="17" y2="16" stroke="#000000" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </svg>
  );
};
