import {
  DemoStep,
  Exercise,
  ExerciseCategory,
  ExerciseVariant,
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
  | 'barre-clamp';

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
    name: 'Palm Muting & Chugging',
    subtitle: 'Taglio del palmo al ponte + plettrata percussiva',
    whatItIs:
      'Il Palm Muting smorza leggermente la corda vicino alle sellette del ponte per togliere gli armonici acuti e lasciare solo una botta grave e controllata. Quando lo ripeti a ritmo serrato sulle corde basse (es. 1/8, 1/16 o gallop) ottieni il classico "chug" rock/metal compatto e potente.',
    howToSteps: [
      'Appoggia il taglio esterno del palmo destro esattamente dove le corde escono dalle sellette del ponte.',
      'Mantieni il polso rilassato: non schiacciare troppo verso la buca/pickup, altrimenti la nota muore del tutto.',
      'Alterna colpi "chug" smorzati a power chord aperti sollevando il palmo di 3–4 mm sugli accenti.',
    ],
    handFocus: {
      leftHand:
        'Tieni le dita ferme su Tonica e Quinta senza alzarle tra un chug e l’altro; sfiora le corde acute col lato dell’indice.',
      rightHand:
        'Il bordo carnoso sotto il mignolo sfiora le sellette del ponte mentre polso e plettro colpiscono con escursione corta e decisa.',
    },
    commonMistake:
      'Appoggiare il palmo troppo avanti sul manico (suono morto senza nota) oppure sollevarlo del tutto perdendo il controllo dei bassi.',
  },
  'stoppata-ghost': {
    id: 'stoppata-ghost',
    name: 'Stoppate & Ghost Notes',
    subtitle: 'Colpo percussivo a corde smorzate (×)',
    whatItIs:
      'La stoppata (o ghost note) trasforma la chitarra in una batteria: suoni una plettrata decisa mentre le dita sinistre fermano le corde, creando un "chak" ritmico secco senza altezza definita. È il segreto del groove funk, pop e dei riff high-gain super puliti.',
    howToSteps: [
      'Rilassa la pressione delle dita sulla tastiera lasciandole appoggiate delicatamente sulle corde senza toccare il legno.',
      'Usa almeno 2–3 dita insieme per evitare armonici naturali accidentali sul tasto 5, 7 o 12.',
      'Mantieni la mano destra in movimento costante su e giù come un pendolo e colpisci in sincronia col click.',
    ],
    handFocus: {
      leftHand:
        'Rilascia la presa quel millimetro che basta a staccare la corda dal tasto ferma-suono, restando a contatto con la corda.',
      rightHand:
        'Movimento continuo di polso dall’alto verso il basso senza irrigidirsi: il plettro scivola rapido sulle corde smorzate.',
    },
    commonMistake:
      'Premere con un solo dito su un tasto armonico (generando un fischio acuto) oppure fermare la mano destra perdendo il groove.',
  },
  'slide-gliss': {
    id: 'slide-gliss',
    name: 'Slide & Connessioni Orizzontali',
    subtitle: 'Scivolamento continuo lungo la corda',
    whatItIs:
      'Lo slide collega due tasti sulla stessa corda mantenendo la pressione costante durante tutto lo spostamento. Oltre a dare un effetto vocale e fluido alle frasi, è il ponte fisico che unisce i box della pentatonica lungo tutto il manico.',
    howToSteps: [
      'Suona la nota di partenza e mantieni una pressione media e costante mentre trascini il dito verso il tasto di arrivo.',
      'Guarda in anticipo il tasto di destinazione con gli occhi prima che la mano parta: il dito si fermerà nel punto esatto.',
      'Sfrutta il pollice dietro il manico come binario scorrevole per non bloccare il polso.',
    ],
    handFocus: {
      leftHand:
        'Pressione continua del polpastrello sulla corda durante il tragitto e pollice morbido che scorre sul retro del manico.',
      rightHand:
        'Plettra solo la nota di partenza (a meno che non sia uno slide articolato): la seconda nota suona grazie all’energia della mano sinistra.',
    },
    commonMistake:
      'Allentare troppo la pressione a metà percorso (la nota sparisce prima di arrivare) o guardare il dito invece del tasto di arrivo.',
  },
  'string-muting': {
    id: 'string-muting',
    name: 'String Muting a Due Mani',
    subtitle: 'Pulizia totale zero ronzii tra le corde',
    whatItIs:
      'Quando suoni con distorsione o ad alto volume, anche un lieve sfioramento fa vibrare le corde vicine creando rumore di fondo. Il muting a due mani isola chirurgicamente solo la corda che stai suonando, facendo uscire ogni nota nitida e definita.',
    howToSteps: [
      'Usa la pancia piatta dell’indice sinistro per sfiorare tutte le corde più sottili sotto la nota che stai premendo.',
      'Appoggia delicatamente la punta del dito sinistro contro la corda subito sopra per bloccarne la vibrazione.',
      'Quando scendi sulle corde acute, fai scivolare l’esterno del palmo destro sulle corde gravi (6, 5, 4) ormai mute.',
    ],
    handFocus: {
      leftHand:
        'Arco delle dita leggermente più disteso del solito: il polpastrello preme la corda bersaglio, la parte piatta silenzia quelle sotto.',
      rightHand:
        'Il palmo segue la mano come un’ombra sulle corde più gravi già suonate, spegnendo ogni risonanza residua.',
    },
    commonMistake:
      'Tenere le dita troppo a martello lasciando libere di risuonare le corde a vuoto sotto il fraseggio.',
  },
  'hammer-pull': {
    id: 'hammer-pull',
    name: 'Hammer-On & Pull-Off (Legato)',
    subtitle: 'Articolazione fluida a energia di mano sinistra',
    whatItIs:
      'Hammer-On e Pull-Off permettono di suonare più note con una sola plettrata usando solo la velocità delle dita sinistre. Rendono gli assoli molto più fluidi, veloci e cantabili senza l’attacco duro del plettro su ogni singola nota.',
    howToSteps: [
      'Per l’Hammer-On, abbassa il dito come un martelletto proprio vicino alla barretta metallica del tasto.',
      'Per il Pull-Off, non sollevare il dito verso l’alto: pizzica leggermente la corda verso il basso prima di staccarlo.',
      'Tieni il dito inferiore già ben saldo sul tasto di appoggio prima di eseguire il Pull-Off.',
    ],
    handFocus: {
      leftHand:
        'Dita curve e scattanti dalle nocche (non schiacciate con il polso); il pollice al centro del manico fa da fulcro.',
      rightHand:
        'Plettra la prima nota della frase e usa il palmo destro per tenere silenziose le corde gravi inutilizzate.',
    },
    commonMistake:
      'Sollevare il dito in verticale durante il Pull-Off (nota debolissima) invece di agganciare appena la corda verso il basso.',
  },
  'bending-vibrato': {
    id: 'bending-vibrato',
    name: 'Bending & Vibrato Espressivo',
    subtitle: 'Intonazione vocale a rotazione di polso',
    whatItIs:
      'Il bending alza l’altezza della nota spingendo la corda lungo il tasto fino al pitch del tasto successivo (½ o 1 tono). Il vibrato aggiunge respiro ed emozione alla nota tenuta, trasformando una sequenza meccanica in fraseggio musicale.',
    howToSteps: [
      'Aggancia il pollice sinistro sul bordo superiore del manico come perno di rotazione.',
      'Allinea 2 o 3 dita dietro al dito principale (anulare + medio + indice) per condividere la forza di spinta.',
      'Ruota l’avambraccio/polso come se girassi la maniglia di una porta, invece di spingere solo con i muscoli delle dita.',
    ],
    handFocus: {
      leftHand:
        'Pollice ancorato sopra la tastiera, dita di supporto unite dietro la nota e spinta dal polso verso l’alto.',
      rightHand:
        'L’indice o il palmo destro sfiorano le corde superiori così durante la spinta non fanno rumore al rilascio.',
    },
    commonMistake:
      'Spingere usando un solo dito rigido (perdita di controllo e stonatura) oppure non silenziare la corda superiore quando la tocchi salendo.',
  },
  'pick-escape': {
    id: 'pick-escape',
    name: 'Pick Escape (USX / DSX) & Plettro',
    subtitle: 'Angolazione intelligente per cambi corda veloci',
    whatItIs:
      'Quando cambi corda in pennata alternata ad alta velocità, il plettro rischia di restare "intrappolato" tra due corde. Il Pick Escape (USX o DSX) inclina leggermente il movimento del polso così che l’ultima nota di ogni corda esca già libera sopra il piano delle corde.',
    howToSteps: [
      'Tieni il plettro con una presa ferma ma senza stringere: lascia uscire solo 2–3 mm di punta.',
      'Guida il movimento dal polso/avambraccio con una lieve inclinazione di 15°–20° rispetto alle corde.',
      'Sincronizza sempre l’inizio di ogni burst 1/16 con la prima nota sulla corda nuova.',
    ],
    handFocus: {
      leftHand:
        'Solleva le dita solo di pochi millimetri sopra i tasti per mantenere la sincronia perfetta mano destra / sinistra.',
      rightHand:
        'Piccoli archi di movimento che liberano la punta del plettro verso l’esterno prima di saltare sulla corda adiacente.',
    },
    commonMistake:
      'Affondare troppo la punta del plettro tra le corde o irrigidire il bicipite nei burst veloci.',
  },
  'barre-clamp': {
    id: 'barre-clamp',
    name: 'Barrè Mobile & Anatomia Accordi',
    subtitle: 'Pressione sul lato osseo dell’indice',
    whatItIs:
      'Il barrè trasforma l’indice sinistro in un capotasto mobile, permettendoti di spostare qualsiasi forma di accordo o triade lungo tutto il manico. Usare la rotazione corretta riduce del 60% la fatica della mano.',
    howToSteps: [
      'Posiziona l’indice vicino alla barretta metallica del tasto (mai al centro o indietro).',
      'Ruota leggermente il dito di lato per premere con il bordo laterale più duro, non con il centro molle del polpastrello.',
      'Usa un leggero richiamo all’indietro del braccio verso il corpo invece di stringere a pinza solo col pollice.',
    ],
    handFocus: {
      leftHand:
        'Indice dritto e ruotato sul fianco esterno, pollice basso dietro il manico in opposizione al dito medio.',
      rightHand:
        'Plettrata elastica su tutte le corde dell’accordo verificando che ogni grado (1–3–5) suoni pulito senza ronzii.',
    },
    commonMistake:
      'Stringere troppo con il pollice piegando la falange dell’indice e creando zone d’ombra sulla 2ª o 3ª corda.',
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
    whyYouDoIt:
      'Allena il controllo chirurgico del polso destro sul ponte e la coordinazione tra colpi smorzati (chug), accenti aperti e stoppate silenziose.',
    dailySoundBenefits: [
      'I tuoi riff rock, metal e pop risultano compatti, pesanti e perfettamente a tempo con batteria e basso.',
      'Elimini i ronzii e le code sporche nelle pause tra un power chord e l’altro anche con molto gain.',
      'Controlli subito la dinamica: sai passare da una strofa asciutta e percussiva a un ritornello aperto ed esplosivo.',
    ],
    primaryTechniques: ['palm-mute-chug', 'stoppata-ghost'],
  },
  'ex-rhythm-gap': {
    whyYouDoIt:
      'Sviluppa il tuo orologio ritmico interno durante i vuoti del metronomo (Gap Click) e allena le ghost notes funk sul levare e in sedicesimi.',
    dailySoundBenefits: [
      'Non dipendi più dal clic o dal batterista per restare dritto: il tuo groove regge da solo dal vivo e in studio.',
      'Le ritmiche funk e pop acquistano respiro, "bounce" e quella spinta percussiva che fa muovere chi ascolta.',
      'Le tue frasi soliste entrano con precisione sul battere e sul levare invece di suonare slegate.',
    ],
    primaryTechniques: ['stoppata-ghost'],
  },
  'ex-picking-spider': {
    whyYouDoIt:
      'Costruisce indipendenza tra tutte e quattro le dita della mano sinistra (incluso anulare e mignolo) insieme al controllo del muting tra le corde.',
    dailySoundBenefits: [
      'Ogni nota esce pulita e senza corde adiacenti che risuonano per sbaglio sotto le dita.',
      'Riduci tensione e fatica nei passaggi veloci o negli stretch larghi sulla tastiera.',
      'Guadagni precisione immediata quando salti da una corda all’altra negli assoli e negli arpeggi.',
    ],
    primaryTechniques: ['string-muting', 'pick-escape'],
  },
  'ex-speed-bursts': {
    whyYouDoIt:
      'Alterna fasi di controllo rilassato (1/8) a brevi scatti esplosivi (1/16) per insegnare al cervello e al polso il movimento di Pick Escape senza irrigidimenti.',
    dailySoundBenefits: [
      'Sblocchi la barriera di velocità della pennata alternata mantenendo il plettro leggero e preciso.',
      'I cambi di corda durante le scale veloci non si incastrano più tra le corde.',
      'Anche a velocità normali di ogni giorno suoni con molto meno sforzo e un attacco più definito.',
    ],
    primaryTechniques: ['pick-escape', 'string-muting'],
  },
  'ex-pent-licks': {
    whyYouDoIt:
      'Trasforma la pentatonica da semplice scala su e giù in vocabolario musicale reale fatto di sequenze, salti di corda e fraseggi classici.',
    dailySoundBenefits: [
      'Quando improvvisi su una base hai subito idee pronte, musicali e coerenti invece di ripetere gli stessi giri.',
      'Le note risultano più incisive grazie a combinazioni di roll, slide e accenti ritmici.',
      'Aumenti la sicurezza sul Box 1 e 2 riconoscendo a colpo d’occhio dove si trovano le note chiave.',
    ],
    primaryTechniques: ['pick-escape', 'hammer-pull'],
  },
  'ex-pent-diagonal': {
    whyYouDoIt:
      'Rompe la prigione dei box verticali collegando l’intero manico attraverso slide diagonali, ottave e percorsi su corda singola.',
    dailySoundBenefits: [
      'Puoi spostarti fluidamente dai tasti gravi a quelli acuti senza interrompere il discorso melodico.',
      'Smetti di "perderti" quando cambi posizione: vedi il manico come un’unica mappa connessa.',
      'I tuoi assoli guadagnano cantabilità e respiro grazie agli slide espressivi tra i registri.',
    ],
    primaryTechniques: ['slide-gliss', 'string-muting'],
  },
  'ex-legato-trill': {
    whyYouDoIt:
      'Potenzia la forza autonoma e la reattività della mano sinistra con Hammer-On, Pull-Off, trilli e roll 3-note-per-string senza dipendere dalla plettrata.',
    dailySoundBenefits: [
      'Le tue frasi suonano fluide, morbide e moderne con pochissimo sforzo della mano destra.',
      'Rafforzi anulare e mignolo ottenendo un volume uniforme su tutte le note del fraseggio.',
      'Puoi inserire abbellimenti rapidi, grace slide e legature espressive dentro qualsiasi melodia.',
    ],
    primaryTechniques: ['hammer-pull', 'slide-gliss'],
  },
  'ex-lead-bending': {
    whyYouDoIt:
      'Allena l’orecchio e il polso sinistro a centrare l’intonazione esatta nei bending (½ tono e 1 tono), controllare il vibrato e mirare le note forti degli accordi.',
    dailySoundBenefits: [
      'I tuoi bending arrivano dritti alla nota giusta senza mai risultare crescenti o calanti.',
      'Una singola nota tenuta col giusto vibrato suona professionale ed espressiva quanto dieci note veloci.',
      'I tuoi fraseggi si appoggiano perfettamente sull’armonia del brano centrando 3ª, 5ª e tonica.',
    ],
    primaryTechniques: ['bending-vibrato', 'string-muting'],
  },
  'ex-harmony-scale': {
    whyYouDoIt:
      'Unisce la pratica fisica del barrè mobile alla comprensione visiva dei gradi della scala e dei numeri romani (I–VI–III–VII ecc.).',
    dailySoundBenefits: [
      'Riesci a suonare accordi con il barrè puliti dalla prima all’ultima corda senza crampi alla mano.',
      'Capisci al volo come nascono le progressioni delle canzoni e sai trasporle in qualsiasi tonalità.',
      'Migliori sia come chitarrista ritmico che come solista perché vedi gli accordi sotto le scale.',
    ],
    primaryTechniques: ['barre-clamp', 'stoppata-ghost'],
  },
  'ex-arpeggio-progressions': {
    whyYouDoIt:
      'Allena il collegamento in tempo reale delle triadi e dei gradi fondamentali (1–3–5–8) mentre gli accordi della progressione cambiano sotto le dita.',
    dailySoundBenefits: [
      'I tuoi assoli seguono naturalmente i cambi di accordo invece di suonare "scollegati" dalla base.',
      'Acquisisci materiali pronti per creare riff arpeggiati, intro pulite e linee di songwriting.',
      'Visualizzi subito dove si trova ogni nota dell’accordo nella zona in cui stai suonando.',
    ],
    primaryTechniques: ['barre-clamp', 'string-muting'],
  },
};

const FALLBACK_BY_CATEGORY: Record<
  ExerciseCategory,
  Omit<ExerciseFamilyBriefing, 'familyId' | 'title'>
> = {
  rhythm: {
    whyYouDoIt:
      'Costruisce solidità ritmica, controllo delle pause e pulizia della mano destra su ogni suddivisione.',
    dailySoundBenefits: [
      'Il tuo timing diventa stabile e affidabile sia con la band che su una base.',
      'Gli stacchi e le pause suonano netti e professionali senza rumori residui.',
      'Gestisci con naturalezza accenti, dinamiche e cambi di figurazione.',
    ],
    primaryTechniques: ['palm-mute-chug', 'stoppata-ghost'],
  },
  picking: {
    whyYouDoIt:
      'Coordina l’attacco del plettro con la mano sinistra per rendere ogni plettrata nitida, economica e veloce.',
    dailySoundBenefits: [
      'Ogni nota ha lo stesso attacco definito anche aumentando i BPM.',
      'I passaggi tra corde diverse diventano fluidi senza impuntamenti.',
      'Suoni più a lungo con meno tensione su polso e avambraccio.',
    ],
    primaryTechniques: ['pick-escape', 'string-muting'],
  },
  pentatonic: {
    whyYouDoIt:
      'Espande il tuo vocabolario melodico e la libertà di movimento lungo i box e le posizioni della tastiera.',
    dailySoundBenefits: [
      'Improvvisi frasi più varie, melodiche e sicure senza rimanere bloccato in un solo box.',
      'Colleghi facilmente registri gravi e acuti con fraseggi naturali.',
      'Trovi subito le note chiave su cui chiudere e far respirare il discorso musicale.',
    ],
    primaryTechniques: ['slide-gliss', 'hammer-pull'],
  },
  legato: {
    whyYouDoIt:
      'Allena espressività, forza indipendente della mano sinistra e precisione vocale delle articolazioni.',
    dailySoundBenefits: [
      'Le tue linee melodiche suonano più cantabili, fluide ed espressive.',
      'Rafforzi tutte le dita migliorando il controllo di vibrato, legato e intonazione.',
      'Ottieni un suono legato e moderno riducendo la durezza meccanica della plettrata continua.',
    ],
    primaryTechniques: ['hammer-pull', 'bending-vibrato'],
  },
  fretboard: {
    whyYouDoIt:
      'Rinforza l’ergonomia della mano sinistra, la precisione delle dita e il silenzio sulle corde non suonate.',
    dailySoundBenefits: [
      'Le note suonano più pulite e definite con meno rumori parassiti.',
      'Aumenti apertura, controllo e indipendenza tra indice, medio, anulare e mignolo.',
      'Prendi confidenza immediata con le distanze reali tra i tasti in ogni zona del manico.',
    ],
    primaryTechniques: ['string-muting', 'pick-escape'],
  },
};

function detectTechniquesFromSteps(steps?: DemoStep[]): TechniqueId[] {
  if (!steps || steps.length === 0) return [];
  const found = new Set<TechniqueId>();

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
  const base =
    FAMILY_BRIEFINGS_BY_ID[exercise.id] ??
    FALLBACK_BY_CATEGORY[exercise.category] ??
    FALLBACK_BY_CATEGORY.fretboard;

  const detectedFromVariant = detectTechniquesFromSteps(
    activeVariant?.demoSequence ?? exercise.demoSequence
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
