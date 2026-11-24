import {
  DemoStep,
  Exercise,
  ExerciseCategory,
  ExerciseVariant,
  InstrumentType,
  getExerciseInstrument,
} from '../types/practice';

export const SPACED_REPETITION_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60] as const;

const SRS_STORAGE_KEY = 'pentatonic_family_briefing_srs_v1';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface FamilyBriefingSrsRecord {
  familyId: string;
  exposures: number;
  lastShownAt: string;
  nextDueAt: string;
}

export interface FamilyBriefingSrsStatus {
  isDue: boolean;
  isFirstTime: boolean;
  exposures: number;
  nextIntervalDays: number;
  record: FamilyBriefingSrsRecord | null;
}

function readSrsMap(): Record<string, FamilyBriefingSrsRecord> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(SRS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, FamilyBriefingSrsRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSrsMap(map: Record<string, FamilyBriefingSrsRecord>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SRS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function resolveIntervalDaysForExposures(exposuresAfterShow: number): number {
  const idx = Math.min(
    SPACED_REPETITION_INTERVAL_DAYS.length - 1,
    Math.max(0, exposuresAfterShow - 1)
  );
  return SPACED_REPETITION_INTERVAL_DAYS[idx];
}

export function getFamilyBriefingSrsStatus(
  familyId: string,
  nowMs: number = Date.now()
): FamilyBriefingSrsStatus {
  const map = readSrsMap();
  const record = map[familyId] ?? null;

  if (!record) {
    return {
      isDue: true,
      isFirstTime: true,
      exposures: 0,
      nextIntervalDays: SPACED_REPETITION_INTERVAL_DAYS[0],
      record: null,
    };
  }

  const dueMs = Date.parse(record.nextDueAt);
  const isDue = Number.isNaN(dueMs) ? true : nowMs >= dueMs;
  const nextIntervalDays = resolveIntervalDaysForExposures(record.exposures + 1);

  return {
    isDue,
    isFirstTime: false,
    exposures: record.exposures,
    nextIntervalDays,
    record,
  };
}

export function markFamilyBriefingSeen(
  familyId: string,
  nowMs: number = Date.now()
): FamilyBriefingSrsRecord {
  const map = readSrsMap();
  const prev = map[familyId];
  const nextExposures = (prev?.exposures ?? 0) + 1;
  const intervalDays = resolveIntervalDaysForExposures(nextExposures);

  const nextRecord: FamilyBriefingSrsRecord = {
    familyId,
    exposures: nextExposures,
    lastShownAt: new Date(nowMs).toISOString(),
    nextDueAt: new Date(nowMs + intervalDays * DAY_MS).toISOString(),
  };

  map[familyId] = nextRecord;
  writeSrsMap(map);
  return nextRecord;
}

export function clearAllFamilyBriefingSrs(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(SRS_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export type TechniqueId =
  | 'palm-mute-chug'
  | 'stoppata-ghost'
  | 'slide-gliss'
  | 'string-muting'
  | 'hammer-pull'
  | 'bending-vibrato'
  | 'pick-escape'
  | 'barre-clamp'
  | 'bass-fingerstyle'
  | 'bass-slap-pop'
  | 'bass-ghost-pocket'
  | 'bass-muting-simandl'
  | 'bass-legato-slide';

export interface TechniqueGuide {
  id: TechniqueId;
  name: string;
  subtitle: string;
  whatItIs: string;
  howToSteps: [string, string, string];
  handFocus: {
    leftHand: string;
    rightHand: string;
  };
  commonMistake: string;
}

export const TECHNIQUE_GUIDES: Record<TechniqueId, TechniqueGuide> = {
  'palm-mute-chug': {
    id: 'palm-mute-chug',
    name: 'Palm Mute',
    subtitle: 'Palmo sul ponte',
    whatItIs: 'Smorza leggermente le corde al ponte per un attacco compatto.',
    howToSteps: [
      'Appoggia il bordo del palmo sulle sellette.',
      'Mantieni il polso rilassato senza soffocare la nota.',
      'Solleva leggermente il palmo sugli accenti.',
    ],
    handFocus: {
      leftHand: 'Dita ferme su tonica e quinta; indice sfiora corde acute.',
      rightHand: 'Taglio del palmo sulle sellette del ponte, plettro corto.',
    },
    commonMistake: 'Palmo troppo avanti sul manico (nota morta) o sollevato.',
  },
  'stoppata-ghost': {
    id: 'stoppata-ghost',
    name: 'Stoppate',
    subtitle: 'Corde smorzate',
    whatItIs: 'Colpo percussivo secco a corde smorzate dalla mano sinistra.',
    howToSteps: [
      'Sfiora le corde con 2–3 dita senza premere il tasto.',
      'Muovi il polso destro a pendolo continuo.',
      'Colpisci a tempo col metronomo.',
    ],
    handFocus: {
      leftHand: '2–3 dita morbide sulle corde senza toccare il legno.',
      rightHand: 'Polso a pendolo costante su e giù a tempo.',
    },
    commonMistake: 'Premere con un dito solo sui tasti 5, 7 o 12 (armonici).',
  },
  'slide-gliss': {
    id: 'slide-gliss',
    name: 'Slide',
    subtitle: 'Scivolamento continuo',
    whatItIs: 'Collega due tasti sulla stessa corda mantenendo pressione costante.',
    howToSteps: [
      'Mantieni pressione costante durante lo spostamento.',
      'Guarda in anticipo il tasto di arrivo.',
      'Scorri con il pollice dietro il manico.',
    ],
    handFocus: {
      leftHand: 'Pressione costante e occhi fissi sul tasto di arrivo.',
      rightHand: 'Plettra solo la nota di partenza.',
    },
    commonMistake: 'Allentare la pressione a metà percorso.',
  },
  'string-muting': {
    id: 'string-muting',
    name: 'String Muting',
    subtitle: 'Silenzio tra le corde',
    whatItIs: 'Isola la corda suonata spegnendo ronzii e corde a vuoto.',
    howToSteps: [
      'Sfiora le corde sotto con la pancia dell’indice.',
      'Tocca la corda sopra con la punta del dito.',
      'Appoggia il palmo destro sulle corde gravi.',
    ],
    handFocus: {
      leftHand: 'Pancia dell’indice sfiora sotto; punta blocca la corda sopra.',
      rightHand: 'Palmo destro appoggiato sulle corde gravi non suonate.',
    },
    commonMistake: 'Lasciare corde a vuoto libere di risuonare.',
  },
  'hammer-pull': {
    id: 'hammer-pull',
    name: 'Legato',
    subtitle: 'Hammer-On & Pull-Off',
    whatItIs: 'Suona più note con una plettrata usando la mano sinistra.',
    howToSteps: [
      'Hammer: colpisci deciso vicino alla barretta.',
      'Pull: pizzica la corda verso il basso.',
      'Tieni saldo il dito inferiore.',
    ],
    handFocus: {
      leftHand: 'Hammer vicino al ferretto; pull pizzicando verso il basso.',
      rightHand: 'Plettra la prima nota e silenzia le corde gravi.',
    },
    commonMistake: 'Sollevare il dito in verticale durante il pull-off.',
  },
  'bending-vibrato': {
    id: 'bending-vibrato',
    name: 'Bending & Vibrato',
    subtitle: 'Rotazione di polso',
    whatItIs: 'Spinge la corda verso l’intonazione target ruotando il polso.',
    howToSteps: [
      'Aggancia il pollice sopra il manico.',
      'Allinea 2–3 dita dietro la nota.',
      'Ruota il polso invece di spingere solo con le dita.',
    ],
    handFocus: {
      leftHand: 'Pollice perno sopra il manico, 2–3 dita unite, ruota il polso.',
      rightHand: 'Palmo/indice silenziano la corda sopra durante la spinta.',
    },
    commonMistake: 'Spingere con un solo dito rigido senza ruotare il polso.',
  },
  'pick-escape': {
    id: 'pick-escape',
    name: 'Plettro',
    subtitle: 'Angolazione e cambio corda',
    whatItIs: 'Inclina leggermente il plettro per cambiare corda senza incastrarsi.',
    howToSteps: [
      'Lascia uscire solo 2–3 mm di punta.',
      'Inclina il polso di 15°–20°.',
      'Sincronizza sempre mano destra e sinistra.',
    ],
    handFocus: {
      leftHand: 'Solleva le dita di pochi millimetri dai tasti.',
      rightHand: 'Lascia 2–3 mm di punta, polso inclinato 15°–20°.',
    },
    commonMistake: 'Affondare troppo il plettro tra le corde.',
  },
  'barre-clamp': {
    id: 'barre-clamp',
    name: 'Barrè',
    subtitle: 'Pressione laterale',
    whatItIs: 'Usa il lato osseo dell’indice per chiudere tutte le corde senza sforzo.',
    howToSteps: [
      'Posiziona l’indice vicino alla barretta.',
      'Ruota leggermente sul bordo laterale.',
      'Richiama leggermente il braccio invece di stringere.',
    ],
    handFocus: {
      leftHand: 'Indice vicino al ferretto, ruotato sul lato osseo.',
      rightHand: 'Plettrata elastica verificando tutte le corde.',
    },
    commonMistake: 'Stringere troppo col pollice piegando l’indice.',
  },
  'bass-fingerstyle': {
    id: 'bass-fingerstyle',
    name: 'Fingerstyle',
    subtitle: 'Alternanza i–m',
    whatItIs: 'Alterna indice e medio con volume uguale e raking discendente.',
    howToSteps: [
      'Appoggia il pollice sul pickup o sulla corda sopra.',
      'Alterna indice e medio con tocco uniforme.',
      'Usa il raking scendendo verso il Mi.',
    ],
    handFocus: {
      leftHand: 'Dita rilassate vicino alla barretta per staccare pulito.',
      rightHand: 'Alterna sempre i–m; scendendo usa il raking.',
    },
    commonMistake: 'Usare sempre lo stesso dito salendo di corda.',
  },
  'bass-slap-pop': {
    id: 'bass-slap-pop',
    name: 'Slap & Pop',
    subtitle: 'Rotazione di polso',
    whatItIs: 'Pollice rimbalza sulle corde gravi, indice strappa D o G.',
    howToSteps: [
      'Pollice parallelo alle corde sopra l’ultimo tasto.',
      'Fai rimbalzare subito il pollice dopo il colpo.',
      'Aggancia appena D o G col polpastrello dell’indice.',
    ],
    handFocus: {
      leftHand: 'Alza le dita tra le note per creare le dead notes.',
      rightHand: 'Ruota l’avambraccio: pollice rimbalza, indice strappa D/G.',
    },
    commonMistake: 'Colpire col gomito rigido o affondare troppo l’indice.',
  },
  'bass-ghost-pocket': {
    id: 'bass-ghost-pocket',
    name: 'Ghost Notes',
    subtitle: 'Pocket e note smorzate',
    whatItIs: 'Controlla attacco, durata delle note e colpi smorzati a 1/16.',
    howToSteps: [
      'Ferma la nota sollevando appena la pressione sinistra.',
      'Usa 2–3 dita morbide sulle ghost notes.',
      'Tieni i 1/16 costanti anche nei vuoti.',
    ],
    handFocus: {
      leftHand: '2–3 dita morbide sulle corde per bloccare la risonanza.',
      rightHand: 'Accenti netti sulla cassa e tocco leggero sulle ghost.',
    },
    commonMistake: 'Premere con un dito solo sui tasti 5, 7 o 12.',
  },
  'bass-muting-simandl': {
    id: 'bass-muting-simandl',
    name: 'Simandl & Muting',
    subtitle: 'Ergonomia 4 corde',
    whatItIs: 'Postura 1–2–4 sui tasti larghi e Floating Thumb sulle corde gravi.',
    howToSteps: [
      'Usa 1–2–4 nei primi 4 tasti.',
      'Passa a 1–2–3–4 dal 5° tasto in su.',
      'Appoggia il pollice destro sulle corde gravi mute.',
    ],
    handFocus: {
      leftHand: 'Usa 1–2–4 sui primi tasti; sfiora le corde acute sotto.',
      rightHand: 'Floating thumb: pollice destro appoggiato sulle corde gravi.',
    },
    commonMistake: 'Forzare 1–2–3–4 al 1° tasto irrigidendo il polso.',
  },
  'bass-legato-slide': {
    id: 'bass-legato-slide',
    name: 'Legato & Slide',
    subtitle: 'Articolazione fluida',
    whatItIs: 'Hammer-On, Pull-Off e Slide puliti sulle corde spesse del basso.',
    howToSteps: [
      'Martella deciso vicino alla barretta.',
      'Tira leggermente verso il basso nel pull-off.',
      'Mantieni pressione costante nello slide.',
    ],
    handFocus: {
      leftHand: 'Martella vicino al ferretto; guarda il tasto di arrivo negli slide.',
      rightHand: 'Pizzica la prima nota e tieni mute le corde vicine.',
    },
    commonMistake: 'Colpire al centro del tasto o perdere pressione nello slide.',
  },
};

export interface ExerciseFamilyBriefing {
  familyId: string;
  title: string;
  whyYouDoIt: string;
  dailySoundBenefits: [string, string, string];
  primaryTechniques: TechniqueId[];
}

const FAMILY_BRIEFINGS_BY_ID: Record<
  string,
  Omit<ExerciseFamilyBriefing, 'familyId' | 'title'>
> = {
  'ex-rhythm-palmmute': {
    whyYouDoIt: 'Rende i riff compatti e controlla chug, accenti e pause.',
    dailySoundBenefits: [
      'Riff compatti e a tempo.',
      'Pause pulite senza ronzii.',
      'Controllo rapido della dinamica.',
    ],
    primaryTechniques: ['palm-mute-chug', 'stoppata-ghost'],
  },
  'ex-rhythm-gap': {
    whyYouDoIt: 'Allena il tempo interno nei vuoti e il groove funk.',
    dailySoundBenefits: [
      'Timing solido anche senza click.',
      'Groove funk con ghost notes pulite.',
      'Ingressi precisi su battere e levare.',
    ],
    primaryTechniques: ['stoppata-ghost'],
  },
  'ex-picking-spider': {
    whyYouDoIt: 'Rinforza le 4 dita ed elimina i rumori tra le corde.',
    dailySoundBenefits: [
      'Note nitide senza corde sporche.',
      'Meno tensione nei passaggi larghi.',
      'Cambi corda più precisi.',
    ],
    primaryTechniques: ['string-muting', 'pick-escape'],
  },
  'ex-speed-bursts': {
    whyYouDoIt: 'Sblocca la velocità della pennata alternata senza tensione.',
    dailySoundBenefits: [
      'Pennata veloce e leggera.',
      'Cambi corda fluidi.',
      'Meno fatica a tempo normale.',
    ],
    primaryTechniques: ['pick-escape', 'string-muting'],
  },
  'ex-pent-licks': {
    whyYouDoIt: 'Costruisce frasi soliste rapide e pulite sulla pentatonica.',
    dailySoundBenefits: [
      'Vocabolario pronto negli assoli.',
      'Note più incisive e a tempo.',
      'Sicurezza sul Box 1 e 2.',
    ],
    primaryTechniques: ['pick-escape', 'hammer-pull'],
  },
  'ex-pent-diagonal': {
    whyYouDoIt: 'Collega i box lungo tutto il manico tramite slide.',
    dailySoundBenefits: [
      'Spostamenti fluidi tra registri.',
      'Visione connessa della tastiera.',
      'Fraseggio più cantabile.',
    ],
    primaryTechniques: ['slide-gliss', 'string-muting'],
  },
  'ex-legato-trill': {
    whyYouDoIt: 'Potenzia hammer-on, pull-off e forza della mano sinistra.',
    dailySoundBenefits: [
      'Frasi fluide con meno plettrate.',
      'Anulare e mignolo più forti.',
      'Legature espressive e pulite.',
    ],
    primaryTechniques: ['hammer-pull', 'slide-gliss'],
  },
  'ex-lead-bending': {
    whyYouDoIt: 'Intona con precisione bending, vibrato e note bersaglio.',
    dailySoundBenefits: [
      'Bending sempre centrati.',
      'Vibrato controllato ed espressivo.',
      'Frasi agganciate agli accordi.',
    ],
    primaryTechniques: ['bending-vibrato', 'string-muting'],
  },
  'ex-harmony-scale': {
    whyYouDoIt: 'Allena barrè mobili, gradi della scala e giri armonici.',
    dailySoundBenefits: [
      'Barrè puliti senza crampi.',
      'Riconoscimento rapido dei giri.',
      'Connessione tra accordi e scale.',
    ],
    primaryTechniques: ['barre-clamp', 'stoppata-ghost'],
  },
  'ex-arpeggio-progressions': {
    whyYouDoIt: 'Collega gli arpeggi 1–3–5–8 sui cambi di accordo.',
    dailySoundBenefits: [
      'Assoli coerenti coi cambi.',
      'Riff arpeggiati immediati.',
      'Mappa chiara dei gradi.',
    ],
    primaryTechniques: ['barre-clamp', 'string-muting'],
  },
  'ex-bass-fingerstyle': {
    whyYouDoIt: 'Uniforma indice e medio sui cambi corda e sul raking.',
    dailySoundBenefits: [
      'Volume uguale tra i e m.',
      'Raking fluido verso il Mi.',
      'Resistenza sulle linee veloci.',
    ],
    primaryTechniques: ['bass-fingerstyle', 'bass-muting-simandl'],
  },
  'ex-bass-pocket-groove': {
    whyYouDoIt: 'Allena il pocket con la cassa, i vuoti e le ghost notes.',
    dailySoundBenefits: [
      'Groove solido con la batteria.',
      'Ghost notes pulite a 1/16.',
      'Controllo esatto della durata.',
    ],
    primaryTechniques: ['bass-ghost-pocket', 'bass-muting-simandl'],
  },
  'ex-bass-slap-pop': {
    whyYouDoIt: 'Coordina pollice, strappo e dead notes senza sporcare.',
    dailySoundBenefits: [
      'Slap definito sulle corde gravi.',
      'Pop netto su D e G.',
      'Timing solido sui salti.',
    ],
    primaryTechniques: ['bass-slap-pop', 'bass-ghost-pocket'],
  },
  'ex-bass-arpeggios': {
    whyYouDoIt: 'Costruisce linee di basso per gradi (1–3–5–7–8) sui giri.',
    dailySoundBenefits: [
      'Note giuste su ogni cambio.',
      'Walking bass e ottave pronti.',
      'Mappa intervalli sulle 4 corde.',
    ],
    primaryTechniques: ['bass-fingerstyle', 'bass-muting-simandl'],
  },
  'ex-bass-spider-muting': {
    whyYouDoIt: 'Unisce ergonomia Simandl 1–2–4 e muting sulle 4 corde.',
    dailySoundBenefits: [
      'Zero tensione sui primi tasti.',
      'Anulare e mignolo più forti.',
      'Corde a vuoto sempre mute.',
    ],
    primaryTechniques: ['bass-muting-simandl', 'bass-fingerstyle'],
  },
  'ex-bass-neck-legato': {
    whyYouDoIt: 'Collega tutto il manico con slide, hammer-on e pull-off.',
    dailySoundBenefits: [
      'Libertà dal 1° al 12° tasto.',
      'Fill fluidi e musicali.',
      'Legato pieno sulle 4 corde.',
    ],
    primaryTechniques: ['bass-legato-slide', 'bass-muting-simandl'],
  },
};

const BASS_FALLBACK_BY_CATEGORY: Record<
  ExerciseCategory,
  Omit<ExerciseFamilyBriefing, 'familyId' | 'title'>
> = {
  rhythm: {
    whyYouDoIt: 'Costruisce pocket con la batteria e precisione sulle ghost notes.',
    dailySoundBenefits: [
      'Groove stabile con la band.',
      'Controllo di pause e staccati.',
      'Spinta ritmica costante.',
    ],
    primaryTechniques: ['bass-ghost-pocket', 'bass-fingerstyle'],
  },
  picking: {
    whyYouDoIt: 'Uniforma indice e medio sui cambi corda e nel raking.',
    dailySoundBenefits: [
      'Attacco uguale tra i e m.',
      'Cambi corda fluidi.',
      'Resistenza senza tensione.',
    ],
    primaryTechniques: ['bass-fingerstyle', 'bass-muting-simandl'],
  },
  pentatonic: {
    whyYouDoIt: 'Espande linee di basso, triadi e collegamenti sulle 4 corde.',
    dailySoundBenefits: [
      'Linee coerenti sui cambi.',
      'Slide fluidi tra registri.',
      'Gradi chiari sotto la mano.',
    ],
    primaryTechniques: ['bass-legato-slide', 'bass-fingerstyle'],
  },
  legato: {
    whyYouDoIt: 'Allena slap, pop, legato e articolazione sulle corde spesse.',
    dailySoundBenefits: [
      'Slap & Pop puliti.',
      'Hammer-on e pull-off pieni.',
      'Maggiore dinamica.',
    ],
    primaryTechniques: ['bass-slap-pop', 'bass-legato-slide'],
  },
  fretboard: {
    whyYouDoIt: 'Migliora postura Simandl 1–2–4 e muting sulle 4 corde.',
    dailySoundBenefits: [
      'Zero corde a vuoto sporche.',
      'Meno fatica al polso.',
      'Intonazione precisa.',
    ],
    primaryTechniques: ['bass-muting-simandl', 'bass-fingerstyle'],
  },
};

const FALLBACK_BY_CATEGORY: Record<
  ExerciseCategory,
  Omit<ExerciseFamilyBriefing, 'familyId' | 'title'>
> = {
  rhythm: {
    whyYouDoIt: 'Rende il timing stabile e pulito su accenti e pause.',
    dailySoundBenefits: [
      'Timing affidabile.',
      'Pause nette senza ronzii.',
      'Controllo dinamico naturale.',
    ],
    primaryTechniques: ['palm-mute-chug', 'stoppata-ghost'],
  },
  picking: {
    whyYouDoIt: 'Coordina plettro e dita per suonare veloce e nitido.',
    dailySoundBenefits: [
      'Attacco definito.',
      'Cambi corda senza intoppi.',
      'Meno tensione sul polso.',
    ],
    primaryTechniques: ['pick-escape', 'string-muting'],
  },
  pentatonic: {
    whyYouDoIt: 'Espande il fraseggio lungo tutte le posizioni del manico.',
    dailySoundBenefits: [
      'Frasi varie negli assoli.',
      'Collegamenti tra registri.',
      'Orientamento rapido sul manico.',
    ],
    primaryTechniques: ['slide-gliss', 'hammer-pull'],
  },
  legato: {
    whyYouDoIt: 'Allena espressività, forza delle dita e fluidità.',
    dailySoundBenefits: [
      'Linee melodiche cantabili.',
      'Controllo di vibrato e legato.',
      'Suono fluido e moderno.',
    ],
    primaryTechniques: ['hammer-pull', 'bending-vibrato'],
  },
  fretboard: {
    whyYouDoIt: 'Migliora apertura, precisione e silenzio tra le corde.',
    dailySoundBenefits: [
      'Note nitide senza ronzii.',
      'Indipendenza delle 4 dita.',
      'Sicurezza su tutta la tastiera.',
    ],
    primaryTechniques: ['string-muting', 'pick-escape'],
  },
};

function detectTechniquesFromSteps(
  steps?: DemoStep[],
  instrument: InstrumentType = 'guitar'
): TechniqueId[] {
  if (!steps || steps.length === 0) return [];
  const found = new Set<TechniqueId>();

  if (instrument === 'bass') {
    for (const step of steps) {
      const tech = (step.technique || '').toLowerCase();
      if (tech.includes('slap') || tech.includes('pop') || tech.includes('thumb')) {
        found.add('bass-slap-pop');
      }
      if (
        step.muted ||
        tech.includes('ghost') ||
        tech.includes('dead') ||
        tech.includes('silenzio') ||
        tech.includes('staccato')
      ) {
        found.add('bass-ghost-pocket');
      }
      if (
        tech.includes('slide') ||
        tech.includes('hammer') ||
        tech.includes('pull')
      ) {
        found.add('bass-legato-slide');
      }
      if (tech.includes('raking') || tech.includes('indice') || tech.includes('fingerstyle')) {
        found.add('bass-fingerstyle');
      }
      if (tech.includes('simandl') || tech.includes('muting') || tech.includes('pollice')) {
        found.add('bass-muting-simandl');
      }
    }
    return Array.from(found);
  }

  for (const step of steps) {
    const tech = (step.technique || '').toLowerCase();
    if (tech.includes('palm') || tech.includes('p.m.') || tech.includes('chug')) {
      found.add('palm-mute-chug');
    }
    if (
      step.muted ||
      tech.includes('stoppata') ||
      tech.includes('ghost') ||
      tech.includes('silenzio')
    ) {
      found.add('stoppata-ghost');
    }
    if (tech.includes('slide')) {
      found.add('slide-gliss');
    }
    if (tech.includes('hammer') || tech.includes('pull') || tech.includes('trill')) {
      found.add('hammer-pull');
    }
    if (tech.includes('bend') || tech.includes('vibrato')) {
      found.add('bending-vibrato');
    }
    if (step.notes.length >= 3) {
      found.add('barre-clamp');
    }
  }

  return Array.from(found);
}

export function getExerciseFamilyBriefing(
  exercise: Exercise,
  activeVariant?: ExerciseVariant
): ExerciseFamilyBriefing {
  const instrument = getExerciseInstrument(exercise);
  const fallbackMap =
    instrument === 'bass' ? BASS_FALLBACK_BY_CATEGORY : FALLBACK_BY_CATEGORY;
  const base =
    FAMILY_BRIEFINGS_BY_ID[exercise.id] ??
    fallbackMap[exercise.category] ??
    fallbackMap.fretboard;

  const detectedFromVariant = detectTechniquesFromSteps(
    activeVariant?.demoSequence ?? exercise.demoSequence,
    instrument
  );
  const mergedTechniques: TechniqueId[] = [...base.primaryTechniques];
  for (const techId of detectedFromVariant) {
    if (!mergedTechniques.includes(techId)) {
      mergedTechniques.push(techId);
    }
  }

  return {
    familyId: exercise.id,
    title: exercise.title,
    whyYouDoIt: base.whyYouDoIt,
    dailySoundBenefits: base.dailySoundBenefits,
    primaryTechniques: mergedTechniques,
  };
}
