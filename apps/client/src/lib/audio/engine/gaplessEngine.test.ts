import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudioContext, installWebAudioMocks, makeFakeAudioBuffer } from "../testUtils/webAudioMocks";

installWebAudioMocks();

// Importé après l'installation des mocks : le constructeur instancie `new AudioContext()`.
const { GaplessEngine } = await import("./gaplessEngine");

// Doit rester synchronisé avec SWAP_FADE_SECONDS dans gaplessEngine.ts : la piste suivante
// démarre `SWAP_FADE_SECONDS` avant l'instant de fin logique de la piste courante, pour un
// micro-crossfade au lieu d'un raccord bord-à-bord (voir trySchedulePending).
const SWAP_FADE_SECONDS = 0.008;

function decodedTrack(durationSeconds: number) {
  return { buffer: makeFakeAudioBuffer(durationSeconds, 44100, 1), trim: { start: 0, end: 0 } };
}

describe("GaplessEngine — planification gapless déterministe", () => {
  let engine: InstanceType<typeof GaplessEngine>;
  let ctx: FakeAudioContext;

  beforeEach(() => {
    engine = new GaplessEngine();
    ctx = engine.context as unknown as FakeAudioContext;
  });

  it("planifie la piste suivante exactement à l'instant de fin calculé de la piste courante (zéro écart)", () => {
    const trackA = decodedTrack(10);
    const trackB = decodedTrack(8);

    ctx.currentTime = 0;
    engine.loadAndPlay("blob:a", 0, trackA);

    const onSwap = vi.fn();
    engine.scheduleNext(trackB.buffer, trackB.trim, onSwap);

    expect(ctx.createdSources).toHaveLength(2);
    const [sourceA, sourceB] = ctx.createdSources;
    expect(sourceA.startCall).toEqual({ when: 0, offset: 0 });
    // La piste A dure 10s : la piste B démarre SWAP_FADE_SECONDS avant t=10 pour un
    // micro-crossfade (jamais de silence intercalé, jamais de vrai raccord bord-à-bord).
    expect(sourceB.startCall).toEqual({ when: 10 - SWAP_FADE_SECONDS, offset: 0 });
  });

  it("enchaîne plusieurs transitions sans dérive cumulative", () => {
    const trackA = decodedTrack(10);
    const trackB = decodedTrack(8);
    const trackC = decodedTrack(5);

    ctx.currentTime = 0;
    engine.loadAndPlay("blob:a", 0, trackA);
    engine.scheduleNext(trackB.buffer, trackB.trim, () => {
      // Une fois le swap vers B commis, planifie C — reproduit le chaînage réel du store.
      engine.scheduleNext(trackC.buffer, trackC.trim, vi.fn());
    });

    // Simule l'écoulement réel du temps jusqu'à la fin de A : le "onended" de la source A
    // se déclenche à t=10 dans un vrai AudioContext (car source.stop(10) a été programmé).
    ctx.createdSources[0].onended?.();

    expect(ctx.createdSources).toHaveLength(3);
    expect(ctx.createdSources[1].startCall).toEqual({ when: 10 - SWAP_FADE_SECONDS, offset: 0 }); // B après A (10s)
    expect(ctx.createdSources[2].startCall).toEqual({ when: 18 - SWAP_FADE_SECONDS, offset: 0 }); // C après B (10+8s)
  });

  it("un pause() annule le swap déjà planifié sans perte, et un resume() le replanifie sans dérive", () => {
    const trackA = decodedTrack(10);
    const trackB = decodedTrack(8);

    ctx.currentTime = 0;
    engine.loadAndPlay("blob:a", 0, trackA);
    engine.scheduleNext(trackB.buffer, trackB.trim, vi.fn());
    expect(ctx.createdSources[1].startCall).toEqual({ when: 10 - SWAP_FADE_SECONDS, offset: 0 });

    // 3 secondes de lecture, puis pause.
    ctx.currentTime = 3;
    engine.pause();
    expect(engine.state).toBe("paused");
    // Le noeud planifié pour B doit avoir été arrêté (annulé) — jamais laissé sonner alors
    // que A est en pause.
    expect(ctx.createdSources[1].stopCall).not.toBeNull();

    // 5 secondes de silence "réel" passent pendant la pause (l'horloge de l'AudioContext
    // continue d'avancer même sans rien jouer) avant la reprise.
    ctx.currentTime = 8;
    engine.resume();

    // Une nouvelle source A est créée à la reprise (offset logique 3s, démarrée à t=8),
    // et B est replanifiée à sa toute nouvelle fin exacte : 8 + (10 - 3) = 15.
    expect(ctx.createdSources).toHaveLength(4);
    const resumedA = ctx.createdSources[2];
    expect(resumedA.startCall).toEqual({ when: 8, offset: 3 });
    const rescheduledB = ctx.createdSources[3];
    expect(rescheduledB.startCall).toEqual({ when: 15 - SWAP_FADE_SECONDS, offset: 0 });
  });

  it("un seek() en cours de lecture annule et replanifie la piste suivante à la bonne position", () => {
    const trackA = decodedTrack(10);
    const trackB = decodedTrack(8);

    ctx.currentTime = 0;
    engine.loadAndPlay("blob:a", 0, trackA);
    engine.scheduleNext(trackB.buffer, trackB.trim, vi.fn());

    ctx.currentTime = 2;
    engine.seek(9); // saut vers la fin de A, à t=2 sur l'horloge réelle

    const seekedA = ctx.createdSources[2];
    expect(seekedA.startCall).toEqual({ when: 2, offset: 9 });
    // B doit maintenant démarrer 1s plus tard (10 - 9 restante), soit t=3.
    const rescheduledB = ctx.createdSources[3];
    expect(rescheduledB.startCall).toEqual({ when: 3 - SWAP_FADE_SECONDS, offset: 0 });
  });

  it("replie gracieusement sur l'état 'ended' + le callback de secours si rien n'est prêt à temps", () => {
    const trackA = decodedTrack(2);
    ctx.currentTime = 0;
    engine.loadAndPlay("blob:a", 0, trackA);

    const onEnded = vi.fn();
    engine.onEnded(onEnded);

    ctx.createdSources[0].onended?.();

    expect(engine.state).toBe("ended");
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("démarre en streaming natif par défaut, puis bascule en mode buffer via attachDecodedActive", () => {
    engine.loadAndPlay("https://example.com/stream.aac", 0);
    expect(engine.state).toBe("loading");
    expect(engine.duration).toBe(0); // durée native inconnue tant que rien n'est chargé

    const decoded = decodedTrack(12);
    engine.attachDecodedActive(decoded);

    expect(engine.duration).toBeCloseTo(12, 5);
    expect(ctx.createdSources).toHaveLength(1);
  });
});
