import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Check,
  Hand,
  Sparkles,
  Target,
  Volume2,
  X,
} from 'lucide-react';
import {
  ExerciseFamilyBriefing,
  FamilyBriefingSrsStatus,
  TECHNIQUE_GUIDES,
  TechniqueId,
} from '../utils/spacedRepetitionCoach';

interface TechniqueHandAnimatorProps {
  techniqueId: TechniqueId;
}

export const TechniqueHandAnimator: React.FC<TechniqueHandAnimatorProps> = ({
  techniqueId,
}) => {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/15 bg-black p-2">
      <svg
        viewBox="0 0 360 156"
        className="w-full h-auto block select-none"
        role="img"
        aria-label={`Animazione mani: ${TECHNIQUE_GUIDES[techniqueId].name}`}
      >
        <defs>
          <filter id="hand-neon-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="palm-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(57,255,20,0.28)" />
            <stop offset="100%" stopColor="rgba(57,255,20,0.08)" />
          </linearGradient>
        </defs>

        {/* Subtle Guitar Neck / Body Backdrop */}
        <rect
          x="6"
          y="8"
          width="348"
          height="140"
          rx="12"
          fill="#050608"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />

        {techniqueId === 'palm-mute-chug' && (
          <g>
            {/* Strings */}
            {[46, 66, 86, 106].map((y, idx) => (
              <line
                key={y}
                x1="20"
                y1={y}
                x2="318"
                y2={y}
                stroke={idx >= 2 ? 'rgba(57,255,20,0.45)' : 'rgba(255,255,255,0.2)'}
                strokeWidth={1.1 + idx * 0.4}
              />
            ))}

            {/* Bridge Saddle Bar */}
            <rect
              x="294"
              y="32"
              width="12"
              height="90"
              rx="4"
              fill="#17191E"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1.5"
            />
            <text
              x="300"
              y="24"
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="800"
              fill="rgba(255,255,255,0.6)"
            >
              PONTE
            </text>

            {/* Left Hand Power Chord Shape */}
            <circle cx="62" cy="106" r="7" fill="#39FF14" opacity="0.85" />
            <circle cx="96" cy="86" r="7" fill="#39FF14" opacity="0.7" />
            <text
              x="79"
              y="134"
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="rgba(255,255,255,0.6)"
            >
              Mano SX ferma (R + 5)
            </text>

            {/* Tight Damped Wave on Low String */}
            <path
              d="M 70 106 Q 112 99 154 106 Q 196 113 238 106"
              fill="none"
              stroke="#39FF14"
              strokeWidth="2.2"
              filter="url(#hand-neon-glow)"
            >
              <animate
                attributeName="d"
                values="M 70 106 Q 112 102 154 106 Q 196 110 238 106;M 70 106 Q 112 110 154 106 Q 196 102 238 106;M 70 106 Q 112 106 154 106 Q 196 106 238 106"
                dur="0.7s"
                repeatCount="indefinite"
              />
            </path>

            {/* Animated Right Hand Palm Edge lowering onto Bridge Zone */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,-10; 0,2; 0,2; 0,-10"
                keyTimes="0; 0.25; 0.72; 1"
                dur="1.8s"
                repeatCount="indefinite"
              />
              {/* Palm silhouette */}
              <path
                d="M 244 42 C 260 34, 294 36, 306 54 C 314 68, 312 100, 294 114 C 276 122, 248 116, 242 98 C 237 82, 236 52, 244 42 Z"
                fill="url(#palm-grad)"
                stroke="#39FF14"
                strokeWidth="2"
              />
              {/* Edge Contact Line */}
              <line
                x1="286"
                y1="52"
                x2="286"
                y2="112"
                stroke="#FFFFFF"
                strokeWidth="2.4"
                strokeDasharray="4 3"
              />
              <text
                x="274"
                y="80"
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="900"
                fill="#FFFFFF"
              >
                PALMO
              </text>
            </g>

            {/* Animated Pick Striking Downward ("CHUG") */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,-12; 0,14; 0,-12"
                dur="0.9s"
                repeatCount="indefinite"
              />
              <polygon
                points="212,68 226,68 219,84"
                fill="#FFFFFF"
                stroke="#39FF14"
                strokeWidth="1.5"
              />
            </g>
            <text
              x="219"
              y="134"
              textAnchor="middle"
              fontSize="9"
              fontWeight="900"
              fill="#39FF14"
            >
              CHUG ↓ alle sellette
            </text>
          </g>
        )}

        {techniqueId === 'stoppata-ghost' && (
          <g>
            {/* Fretboard Wires */}
            {[80, 128, 176, 224].map((x) => (
              <line
                key={x}
                x1={x}
                y1="26"
                x2={x}
                y2="124"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="1.2"
              />
            ))}
            {/* Strings */}
            {[42, 60, 78, 96, 114].map((y, idx) => (
              <line
                key={y}
                x1="22"
                y1={y}
                x2="338"
                y2={y}
                stroke="rgba(255,255,255,0.28)"
                strokeWidth={0.9 + idx * 0.35}
              />
            ))}

            {/* Left Hand Flat Fingers Damping Strings (NOT pressing wood) */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,-3; 0,1; 0,-3"
                dur="1.1s"
                repeatCount="indefinite"
              />
              <rect
                x="112"
                y="32"
                width="22"
                height="90"
                rx="11"
                fill="rgba(251,191,36,0.18)"
                stroke="#FBBF24"
                strokeWidth="2"
              />
              <rect
                x="144"
                y="34"
                width="20"
                height="86"
                rx="10"
                fill="rgba(251,191,36,0.12)"
                stroke="rgba(251,191,36,0.7)"
                strokeWidth="1.4"
              />
              <text
                x="138"
                y="22"
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="900"
                fill="#FBBF24"
              >
                DITA PIATTE (sfiorano senza premere)
              </text>
            </g>

            {/* Percussive X Hits + Shockwave */}
            {[60, 78, 96].map((y) => (
              <g key={y}>
                <circle
                  cx="123"
                  cy={y}
                  r="8"
                  fill="none"
                  stroke="#39FF14"
                  strokeWidth="1.6"
                  opacity="0"
                >
                  <animate
                    attributeName="r"
                    values="4; 14"
                    dur="1.1s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.9; 0"
                    dur="1.1s"
                    repeatCount="indefinite"
                  />
                </circle>
                <path
                  d={`M 118 ${y - 5} L 128 ${y + 5} M 128 ${y - 5} L 118 ${y + 5}`}
                  stroke="#FFFFFF"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </g>
            ))}

            {/* Right Hand Pendulum Strum */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,-24; 0,26; 0,-24"
                dur="1.1s"
                repeatCount="indefinite"
              />
              <polygon
                points="266,64 282,72 266,80"
                fill="#39FF14"
                filter="url(#hand-neon-glow)"
              />
              <line
                x1="282"
                y1="72"
                x2="314"
                y2="72"
                stroke="#FFFFFF"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </g>
            <text
              x="292"
              y="138"
              textAnchor="middle"
              fontSize="9"
              fontWeight="900"
              fill="#39FF14"
            >
              PENDOLO DX = &quot;CHAK!&quot;
            </text>
          </g>
        )}

        {techniqueId === 'slide-gliss' && (
          <g>
            {/* Frets */}
            {[60, 115, 170, 225, 280, 330].map((x, idx) => (
              <g key={x}>
                <line
                  x1={x}
                  y1="26"
                  x2={x}
                  y2="122"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1.3"
                />
                <text
                  x={x - 26}
                  y="138"
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill="rgba(255,255,255,0.45)"
                >
                  T{5 + idx * 2}
                </text>
              </g>
            ))}
            {/* Strings */}
            {[46, 68, 90, 112].map((y, idx) => (
              <line
                key={y}
                x1="22"
                y1={y}
                x2="338"
                y2={y}
                stroke={idx === 1 ? '#39FF14' : 'rgba(255,255,255,0.22)'}
                strokeWidth={idx === 1 ? 2.2 : 1.1}
              />
            ))}

            {/* Origin Marker & Trail Rail */}
            <circle
              cx="88"
              cy="68"
              r="9"
              fill="none"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
            <line
              x1="88"
              y1="68"
              x2="252"
              y2="68"
              stroke="#39FF14"
              strokeWidth="4"
              strokeOpacity="0.35"
              strokeLinecap="round"
            />

            {/* Sliding Finger Puck + Hand Silhouette */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0; 164,0; 164,0; 0,0"
                keyTimes="0; 0.45; 0.78; 1"
                dur="2.2s"
                repeatCount="indefinite"
              />
              <rect
                x="72"
                y="24"
                width="32"
                height="50"
                rx="14"
                fill="url(#palm-grad)"
                stroke="#39FF14"
                strokeWidth="1.8"
              />
              <circle
                cx="88"
                cy="68"
                r="10"
                fill="#39FF14"
                stroke="#FFFFFF"
                strokeWidth="2"
                filter="url(#hand-neon-glow)"
              />
              <text
                x="88"
                y="71.5"
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="900"
                fill="#000000"
              >
                3
              </text>
            </g>

            <text
              x="170"
              y="20"
              textAnchor="middle"
              fontSize="9"
              fontWeight="900"
              fill="#39FF14"
            >
              PRESSIONE COSTANTE · OCCHI SUL TASTO D&apos;ARRIVO →
            </text>
          </g>
        )}

        {techniqueId === 'string-muting' && (
          <g>
            {/* 6 Strings */}
            {[36, 52, 68, 84, 100, 116].map((y, idx) => {
              const isTarget = idx === 2;
              return (
                <g key={y}>
                  <line
                    x1="24"
                    y1={y}
                    x2="336"
                    y2={y}
                    stroke={isTarget ? '#39FF14' : 'rgba(255,255,255,0.2)'}
                    strokeWidth={isTarget ? 2.4 : 0.9 + idx * 0.25}
                  />
                  {!isTarget && (
                    <text
                      x="342"
                      y={y + 3}
                      fontSize="8.5"
                      fontWeight="800"
                      fill="rgba(248,113,113,0.85)"
                    >
                      ×
                    </text>
                  )}
                </g>
              );
            })}

            {/* Left Hand Index Damping Lower (Treble) Strings */}
            <rect
              x="92"
              y="30"
              width="28"
              height="42"
              rx="10"
              fill="rgba(251,191,36,0.16)"
              stroke="#FBBF24"
              strokeWidth="1.6"
            />
            <circle
              cx="106"
              cy="68"
              r="9"
              fill="#39FF14"
              stroke="#FFFFFF"
              strokeWidth="2"
              filter="url(#hand-neon-glow)"
            />
            <text
              x="106"
              y="22"
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="900"
              fill="#FBBF24"
            >
              INDICE SX (spegne corde sotto)
            </text>

            {/* Right Hand Palm Damping Upper (Bass) Strings */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,-3; 0,2; 0,-3"
                dur="1.6s"
                repeatCount="indefinite"
              />
              <rect
                x="236"
                y="78"
                width="62"
                height="46"
                rx="16"
                fill="url(#palm-grad)"
                stroke="#39FF14"
                strokeWidth="1.8"
              />
              <text
                x="267"
                y="104"
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="900"
                fill="#FFFFFF"
              >
                PALMO DX
              </text>
            </g>
            <text
              x="267"
              y="138"
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="800"
              fill="#39FF14"
            >
              SILENZIA CORDE GRAVI
            </text>
          </g>
        )}

        {techniqueId === 'hammer-pull' && (
          <g>
            {[74, 146, 218, 290].map((x) => (
              <line
                key={x}
                x1={x}
                y1="26"
                x2={x}
                y2="122"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1.3"
              />
            ))}
            {[50, 74, 98].map((y, idx) => (
              <line
                key={y}
                x1="24"
                y1={y}
                x2="336"
                y2={y}
                stroke={idx === 1 ? '#39FF14' : 'rgba(255,255,255,0.2)'}
                strokeWidth={idx === 1 ? 2.1 : 1.1}
              />
            ))}

            {/* Anchor Index Finger */}
            <circle
              cx="110"
              cy="74"
              r="10"
              fill="#FFFFFF"
              stroke="#39FF14"
              strokeWidth="2"
            />
            <text
              x="110"
              y="77.5"
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="900"
              fill="#000000"
            >
              1
            </text>

            {/* Hammer/Pull Ring Finger Animation */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,-24; 0,0; 0,8; 0,-24"
                keyTimes="0; 0.32; 0.68; 1"
                dur="1.6s"
                repeatCount="indefinite"
              />
              <circle
                cx="254"
                cy="74"
                r="11"
                fill="#39FF14"
                stroke="#FFFFFF"
                strokeWidth="2"
                filter="url(#hand-neon-glow)"
              />
              <text
                x="254"
                y="77.5"
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="900"
                fill="#000000"
              >
                3
              </text>
            </g>

            {/* Hammer & Pull Arc */}
            <path
              d="M 110 56 Q 182 22 254 56"
              fill="none"
              stroke="#39FF14"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
            <text
              x="182"
              y="32"
              textAnchor="middle"
              fontSize="9"
              fontWeight="900"
              fill="#39FF14"
            >
              H (martelletto ↓) / P (pizzica ↓)
            </text>
            <text
              x="180"
              y="138"
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="rgba(255,255,255,0.68)"
            >
              Dito 1 ben saldo · Dito 3 scatta vicino alla barretta
            </text>
          </g>
        )}

        {techniqueId === 'bending-vibrato' && (
          <g>
            {[74, 146, 218, 290].map((x) => (
              <line
                key={x}
                x1={x}
                y1="26"
                x2={x}
                y2="122"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1.3"
              />
            ))}
            {[50, 74, 98].map((y) => (
              <line
                key={y}
                x1="24"
                y1={y}
                x2="336"
                y2={y}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1.1"
              />
            ))}

            {/* Thumb Pivot at Top Edge */}
            <rect
              x="164"
              y="14"
              width="34"
              height="16"
              rx="8"
              fill="rgba(255,255,255,0.15)"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
            <text
              x="181"
              y="25"
              textAnchor="middle"
              fontSize="7.5"
              fontWeight="900"
              fill="#FFFFFF"
            >
              PERNO
            </text>

            {/* Bending String Curve */}
            <path
              d="M 24 74 Q 254 74 336 74"
              fill="none"
              stroke="#39FF14"
              strokeWidth="2.6"
              filter="url(#hand-neon-glow)"
            >
              <animate
                attributeName="d"
                values="M 24 74 Q 254 74 336 74;M 24 74 Q 254 34 336 74;M 24 74 Q 254 34 336 74;M 24 74 Q 254 74 336 74"
                keyTimes="0; 0.45; 0.72; 1"
                dur="2.0s"
                repeatCount="indefinite"
              />
            </path>

            {/* 3 Grouped Fingers Pushing Up Together */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0; 0,-20; 0,-20; 0,0"
                keyTimes="0; 0.45; 0.72; 1"
                dur="2.0s"
                repeatCount="indefinite"
              />
              <circle cx="110" cy="74" r="8" fill="rgba(57,255,20,0.45)" stroke="#39FF14" strokeWidth="1.5" />
              <circle cx="182" cy="74" r="8" fill="rgba(57,255,20,0.68)" stroke="#39FF14" strokeWidth="1.5" />
              <circle cx="254" cy="74" r="10" fill="#39FF14" stroke="#FFFFFF" strokeWidth="2" />
              <text x="110" y="77" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#FFF">1</text>
              <text x="182" y="77" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#FFF">2</text>
              <text x="254" y="77.5" textAnchor="middle" fontSize="9" fontWeight="900" fill="#000">3</text>
            </g>

            <text
              x="180"
              y="138"
              textAnchor="middle"
              fontSize="9"
              fontWeight="900"
              fill="#39FF14"
            >
              3 DITA UNITE · RUOTA IL POLSO SUL POLLICE ↑
            </text>
          </g>
        )}

        {techniqueId === 'pick-escape' && (
          <g>
            {/* Cross-Section String Plane */}
            <circle cx="118" cy="84" r="9" fill="rgba(255,255,255,0.22)" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx="180" cy="84" r="10" fill="#39FF14" filter="url(#hand-neon-glow)" />
            <circle cx="242" cy="84" r="9" fill="rgba(255,255,255,0.22)" stroke="#FFFFFF" strokeWidth="1.5" />
            <text x="118" y="106" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.5)">Corda 4</text>
            <text x="180" y="106" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#39FF14">Corda 3</text>
            <text x="242" y="106" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.5)">Corda 2</text>

            {/* Escape Arc Trajectory */}
            <path
              d="M 142 84 Q 180 84 218 42"
              fill="none"
              stroke="#39FF14"
              strokeWidth="2.4"
              strokeDasharray="5 3"
            />

            {/* Angled Pick Moving Along Slanted Escape */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="-36,4; 0,0; 38,-40; -36,4"
                keyTimes="0; 0.35; 0.72; 1"
                dur="1.5s"
                repeatCount="indefinite"
              />
              <polygon
                points="172,56 188,56 180,76"
                fill="#FFFFFF"
                stroke="#39FF14"
                strokeWidth="2"
                transform="rotate(-18 180 66)"
              />
            </g>

            <text
              x="180"
              y="26"
              textAnchor="middle"
              fontSize="9"
              fontWeight="900"
              fill="#39FF14"
            >
              PICK SLANTING (15°–20°) → ESCAPE SOPRA LE CORDE ↗
            </text>
            <text
              x="180"
              y="138"
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="rgba(255,255,255,0.68)"
            >
              Punta corta (2–3 mm) · Salta alla corda vicina senza incastrarti
            </text>
          </g>
        )}

        {techniqueId === 'barre-clamp' && (
          <g>
            {[74, 146, 218, 290].map((x) => (
              <line
                key={x}
                x1={x}
                y1="24"
                x2={x}
                y2="122"
                stroke={x === 146 ? 'rgba(57,255,20,0.65)' : 'rgba(255,255,255,0.18)'}
                strokeWidth={x === 146 ? 2.2 : 1.3}
              />
            ))}
            {[36, 52, 68, 84, 100, 116].map((y, idx) => (
              <line
                key={y}
                x1="24"
                y1={y}
                x2="336"
                y2={y}
                stroke="rgba(57,255,20,0.45)"
                strokeWidth={0.9 + idx * 0.25}
              />
            ))}

            {/* Index Finger Rolling Slightly to Bony Side Near Fretwire */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="-8,0; 6,0; 6,0; -8,0"
                keyTimes="0; 0.4; 0.78; 1"
                dur="2.0s"
                repeatCount="indefinite"
              />
              <rect
                x="118"
                y="26"
                width="24"
                height="98"
                rx="12"
                fill="url(#palm-grad)"
                stroke="#39FF14"
                strokeWidth="2.2"
              />
              <line
                x1="136"
                y1="32"
                x2="136"
                y2="118"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeDasharray="3 3"
              />
            </g>

            {/* Supporting Chord Fingers */}
            <circle cx="196" cy="84" r="8" fill="#FFFFFF" stroke="#39FF14" strokeWidth="1.5" />
            <circle cx="254" cy="100" r="8" fill="#FFFFFF" stroke="#39FF14" strokeWidth="1.5" />
            <circle cx="254" cy="68" r="8" fill="#FFFFFF" stroke="#39FF14" strokeWidth="1.5" />

            <text
              x="180"
              y="138"
              textAnchor="middle"
              fontSize="9"
              fontWeight="900"
              fill="#39FF14"
            >
              INDICE SUL FIANCO OSSEO VICINO ALLA BARRETTA
            </text>
          </g>
        )}

        {techniqueId === 'bass-fingerstyle' && (
          <g>
            {/* 4 Thick Bass Strings (G, D, A, E) */}
            {[36, 58, 80, 102].map((y, idx) => (
              <line
                key={y}
                x1="24"
                y1={y}
                x2="336"
                y2={y}
                stroke={idx >= 2 ? 'rgba(57,255,20,0.55)' : 'rgba(255,255,255,0.28)'}
                strokeWidth={1.6 + idx * 0.55}
              />
            ))}
            {/* Pickup Rest Anchor */}
            <rect
              x="210"
              y="108"
              width="72"
              height="18"
              rx="6"
              fill="#15171C"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.4"
            />
            <text x="246" y="120" textAnchor="middle" fontSize="8" fontWeight="800" fill="rgba(255,255,255,0.75)">
              THUMB ANCHOR
            </text>
            {/* Index (i) & Middle (m) Alternating Pluck Fingers */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0; 0,-14; 0,0; 0,0"
                keyTimes="0; 0.25; 0.5; 1"
                dur="1.3s"
                repeatCount="indefinite"
              />
              <rect x="176" y="24" width="16" height="58" rx="8" fill="url(#palm-grad)" stroke="#39FF14" strokeWidth="2" />
              <text x="184" y="42" textAnchor="middle" fontSize="9.5" fontWeight="900" fill="#39FF14">i</text>
            </g>
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0; 0,0; 0,-14; 0,0"
                keyTimes="0; 0.5; 0.75; 1"
                dur="1.3s"
                repeatCount="indefinite"
              />
              <rect x="200" y="24" width="16" height="58" rx="8" fill="rgba(255,255,255,0.1)" stroke="#FFFFFF" strokeWidth="1.8" />
              <text x="208" y="42" textAnchor="middle" fontSize="9.5" fontWeight="900" fill="#FFFFFF">m</text>
            </g>
            <text x="180" y="140" textAnchor="middle" fontSize="9" fontWeight="900" fill="#39FF14">
              ALTERNANZA i–m COSTANTE · RAKING ECONOMICO ↓
            </text>
          </g>
        )}

        {techniqueId === 'bass-slap-pop' && (
          <g>
            {[36, 58, 80, 102].map((y, idx) => (
              <line
                key={y}
                x1="24"
                y1={y}
                x2="336"
                y2={y}
                stroke={idx === 0 || idx === 3 ? 'rgba(57,255,20,0.55)' : 'rgba(255,255,255,0.24)'}
                strokeWidth={1.6 + idx * 0.55}
              />
            ))}
            {/* Thumb Bounce Impact on Low E String */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,-16; 0,2; 0,-16"
                keyTimes="0; 0.35; 1"
                dur="1.2s"
                repeatCount="indefinite"
              />
              <rect x="116" y="72" width="46" height="22" rx="11" fill="url(#palm-grad)" stroke="#39FF14" strokeWidth="2" />
              <text x="139" y="86" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#39FF14">SLAP</text>
            </g>
            {/* Index Finger Pop Pull on G String */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,6; 0,-14; 0,6"
                keyTimes="0; 0.65; 1"
                dur="1.2s"
                repeatCount="indefinite"
              />
              <circle cx="232" cy="40" r="13" fill="rgba(255,255,255,0.12)" stroke="#FFFFFF" strokeWidth="2" />
              <text x="232" y="43" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#FFFFFF">POP</text>
            </g>
            <text x="180" y="138" textAnchor="middle" fontSize="9" fontWeight="900" fill="#39FF14">
              ROTAZIONE DI POLSO: RIMBALZO POLLICE + STRAPPO INDICE
            </text>
          </g>
        )}

        {techniqueId === 'bass-ghost-pocket' && (
          <g>
            {[36, 58, 80, 102].map((y, idx) => (
              <line
                key={y}
                x1="24"
                y1={y}
                x2="336"
                y2={y}
                stroke="rgba(57,255,20,0.45)"
                strokeWidth={1.6 + idx * 0.55}
              />
            ))}
            {/* Multi-finger left-hand soft damp across strings */}
            <rect x="118" y="24" width="44" height="90" rx="14" fill="rgba(251,191,36,0.14)" stroke="#FBBF24" strokeWidth="1.8" strokeDasharray="4 3" />
            {[36, 58, 80, 102].map((y) => (
              <text key={y} x="140" y={y + 4} textAnchor="middle" fontSize="12" fontWeight="900" fill="#FBBF24">×</text>
            ))}
            {/* Pulse Grid */}
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={i}
                x={208 + i * 28}
                y="50"
                width="18"
                height={i === 0 ? 44 : 24}
                rx="5"
                fill={i === 0 ? '#39FF14' : 'rgba(255,255,255,0.28)'}
              />
            ))}
            <text x="180" y="138" textAnchor="middle" fontSize="9" fontWeight="900" fill="#FBBF24">
              2–3 DITA MORBIDE SULLE CORDE · ZERO ARMONICI SUI TASTI 5/7/12
            </text>
          </g>
        )}

        {techniqueId === 'bass-muting-simandl' && (
          <g>
            {[74, 146, 218, 290].map((x) => (
              <line key={x} x1={x} y1="22" x2={x} y2="114" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            ))}
            {[36, 58, 80, 102].map((y, idx) => (
              <line
                key={y}
                x1="24"
                y1={y}
                x2="336"
                y2={y}
                stroke={idx <= 1 ? 'rgba(57,255,20,0.5)' : 'rgba(251,191,36,0.5)'}
                strokeWidth={1.6 + idx * 0.55}
                strokeDasharray={idx >= 2 ? '5 3' : undefined}
              />
            ))}
            {/* Simandl 1 - 2 - 3+4 */}
            <circle cx="110" cy="58" r="10" fill="#39FF14" stroke="#FFFFFF" strokeWidth="1.5" />
            <text x="110" y="61" textAnchor="middle" fontSize="9" fontWeight="900" fill="#000">1</text>
            <circle cx="182" cy="58" r="10" fill="#FFFFFF" stroke="#39FF14" strokeWidth="1.5" />
            <text x="182" y="61" textAnchor="middle" fontSize="9" fontWeight="900" fill="#000">2</text>
            <rect x="236" y="47" width="38" height="22" rx="11" fill="url(#palm-grad)" stroke="#39FF14" strokeWidth="2" />
            <text x="255" y="61" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#39FF14">3+4</text>
            <text x="180" y="138" textAnchor="middle" fontSize="9" fontWeight="900" fill="#39FF14">
              SIMANDL 1–2–4 SUI TASTI BASSI · FLOATING THUMB SULLE CORDE GRAVI
            </text>
          </g>
        )}

        {techniqueId === 'bass-legato-slide' && (
          <g>
            {[36, 58, 80, 102].map((y, idx) => (
              <line
                key={y}
                x1="24"
                y1={y}
                x2="336"
                y2={y}
                stroke={idx === 1 ? 'rgba(57,255,20,0.75)' : 'rgba(255,255,255,0.22)'}
                strokeWidth={1.6 + idx * 0.55}
              />
            ))}
            <line x1="92" y1="58" x2="264" y2="58" stroke="#39FF14" strokeWidth="3.2" strokeDasharray="6 4" />
            <circle cx="92" cy="58" r="9" fill="#000" stroke="#FFFFFF" strokeWidth="2" />
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0; 172,0; 172,0; 0,0"
                keyTimes="0; 0.5; 0.8; 1"
                dur="2.0s"
                repeatCount="indefinite"
              />
              <circle cx="92" cy="58" r="11" fill="#39FF14" stroke="#FFFFFF" strokeWidth="2" />
            </g>
            <text x="180" y="138" textAnchor="middle" fontSize="9" fontWeight="900" fill="#39FF14">
              PRESSIONE COSTANTE · SGUARDO SUL TASTO DI ARRIVO
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};

interface ExerciseFamilyBriefingModalProps {
  isOpen: boolean;
  briefing: ExerciseFamilyBriefing;
  srsStatus: FamilyBriefingSrsStatus;
  manualPreview?: boolean;
  onConfirm: () => void;
  onClose?: () => void;
}

export const ExerciseFamilyBriefingModal: React.FC<
  ExerciseFamilyBriefingModalProps
> = ({
  isOpen,
  briefing,
  srsStatus,
  manualPreview = false,
  onConfirm,
  onClose,
}) => {
  const [selectedTechId, setSelectedTechId] = useState<TechniqueId>(
    briefing.primaryTechniques[0] ?? 'string-muting'
  );

  useEffect(() => {
    setSelectedTechId(briefing.primaryTechniques[0] ?? 'string-muting');
  }, [briefing]);

  if (!isOpen) return null;

  const activeTechnique =
    TECHNIQUE_GUIDES[selectedTechId] ??
    TECHNIQUE_GUIDES[briefing.primaryTechniques[0] ?? 'string-muting'];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/92 backdrop-blur-md p-2 sm:p-4 overscroll-none"
      onClick={manualPreview && onClose ? onClose : undefined}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto overscroll-contain rounded-3xl border border-white/20 bg-[#050608] p-4 sm:p-6 text-white shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Spaced Repetition Badge */}
        <div className="flex items-start justify-between gap-3 border-b border-white/12 pb-3.5">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#39FF14]/45 bg-[#39FF14]/12 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#39FF14]">
                <Brain className="h-3 w-3" />
                {manualPreview
                  ? 'Scheda Tecnica & Benefici'
                  : srsStatus.isFirstTime
                  ? 'Prima volta • Nuova Famiglia'
                  : `Ripasso Spaced Repetition • #${srsStatus.exposures + 1}`}
              </span>
              <span className="rounded-full border border-white/15 bg-black px-2.5 py-0.5 text-[10px] font-bold text-white/65">
                Prossimo reminder: tra {srsStatus.nextIntervalDays}{' '}
                {srsStatus.nextIntervalDays === 1 ? 'giorno' : 'giorni'}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white leading-tight">
              {briefing.title}
            </h2>
          </div>

          {manualPreview && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi scheda"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black text-white/70 hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 1. Why you do it */}
        <section className="rounded-2xl border border-white/12 bg-black/70 p-3.5 sm:p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#39FF14]">
            <Target className="h-3.5 w-3.5" />
            Perché lo fai &amp; A cosa serve
          </div>
          <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
            {briefing.whyYouDoIt}
          </p>
        </section>

        {/* 2. Daily Sound Benefits */}
        <section className="rounded-2xl border border-white/12 bg-black/70 p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white">
            <Volume2 className="h-3.5 w-3.5 text-[#39FF14]" />
            Benefici nel tuo sound di ogni giorno
          </div>
          <ul className="space-y-1.5">
            {briefing.dailySoundBenefits.map((benefit, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-xs sm:text-sm text-white/80 leading-relaxed"
              >
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#39FF14]" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 3. Technique & Hand Animation */}
        <section className="rounded-2xl border border-[#39FF14]/25 bg-[#080B08] p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#39FF14]">
              <Hand className="h-3.5 w-3.5" />
              Tecnica &amp; Posizione delle Mani
            </div>
            {briefing.primaryTechniques.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {briefing.primaryTechniques.map((techId) => {
                  const guide = TECHNIQUE_GUIDES[techId];
                  const active = techId === activeTechnique.id;
                  return (
                    <button
                      key={techId}
                      type="button"
                      onClick={() => setSelectedTechId(techId)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
                        active
                          ? 'border-[#39FF14] bg-[#39FF14] text-black'
                          : 'border-white/15 bg-black text-white/65 hover:border-white/40 hover:text-white'
                      }`}
                    >
                      {guide.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-black text-white">
              {activeTechnique.name}
            </h3>
            <p className="text-[11px] font-semibold text-white/55">
              {activeTechnique.subtitle}
            </p>
          </div>

          <TechniqueHandAnimator techniqueId={activeTechnique.id} />

          <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
            {activeTechnique.whatItIs}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/12 bg-black/75 p-2.5 space-y-1">
              <div className="text-[10px] font-black uppercase tracking-wider text-[#39FF14]">
                Mano Sinistra (Tastiera)
              </div>
              <p className="text-xs text-white/75 leading-relaxed">
                {activeTechnique.handFocus.leftHand}
              </p>
            </div>
            <div className="rounded-xl border border-white/12 bg-black/75 p-2.5 space-y-1">
              <div className="text-[10px] font-black uppercase tracking-wider text-white">
                {activeTechnique.id.startsWith('bass-')
                  ? 'Mano Destra (Dita / Pickup / Slap)'
                  : 'Mano Destra (Ponte / Plettro)'}
              </div>
              <p className="text-xs text-white/75 leading-relaxed">
                {activeTechnique.handFocus.rightHand}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 pt-0.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-white/55">
              Come si ottiene passo dopo passo
            </div>
            {activeTechnique.howToSteps.map((stepText, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-xs text-white/80 leading-relaxed"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#39FF14]/15 text-[10px] font-black text-[#39FF14] mt-0.5">
                  {idx + 1}
                </span>
                <span>{stepText}</span>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-2.5 text-xs text-amber-200/90">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>
              <strong>Errore da evitare:</strong> {activeTechnique.commonMistake}
            </span>
          </div>
        </section>

        <button
          type="button"
          onClick={onConfirm}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl neon-cta px-5 py-3 text-sm sm:text-base font-black transition"
        >
          <Sparkles className="h-4 w-4" />
          {manualPreview ? "Torna all'esercizio" : 'Ho capito, inizia la Demo'}
        </button>
      </div>
    </div>
  );
};
