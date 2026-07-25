"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { PAGE_PATHS } from "@/lib/paths";

import { paintCardTexture } from "./cover-art";
import type { LandingSoundManager, PreviewPlayer } from "./sound";
import type { LandingBeat } from "./types";

const CARD_ASPECT = 1.24;
const GAP_RATIO = 0.14;
const TEXTURE_WIDTH = 384;
const TEXTURE_CACHE_MAX = 90;
const HOVER_PREVIEW_DELAY_MS = 170;

const VERTEX_SHADER = /* glsl */ `
  uniform float uCurve;
  varying vec2 vUv;
  varying float vR2;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    float r2 = worldPosition.x * worldPosition.x + worldPosition.y * worldPosition.y;
    worldPosition.z -= uCurve * r2;
    vR2 = r2;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHover;
  uniform float uReady;
  uniform float uMaxR2;
  varying vec2 vUv;
  varying float vR2;

  void main() {
    vec4 texel = texture2D(uMap, vUv);
    vec3 placeholder = vec3(0.045, 0.045, 0.065);
    vec3 color = mix(placeholder, texel.rgb, uReady);
    float edgeDim = smoothstep(uMaxR2, uMaxR2 * 0.18, vR2);
    color *= 0.5 + 0.5 * edgeDim;
    color += uHover * vec3(0.10, 0.09, 0.17);
    gl_FragColor = vec4(color, 1.0);
  }
`;

type CardMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> & {
  userData: {
    beatIndex: number;
    hoverTarget: number;
    readyTarget: number;
  };
};

type TextureEntry = {
  texture: THREE.CanvasTexture;
  lastUsed: number;
  ready: boolean;
};

type NowPlaying = {
  title: string;
  sellerName: string;
};

type BeatGridProps = {
  beats: LandingBeat[];
  sound: LandingSoundManager;
  preview: PreviewPlayer;
  soundEnabled: boolean;
};

/**
 * Grille infinie facon phantom.land : cartes beats en WebGL avec courbure
 * fisheye, drag inertiel dans toutes les directions, survol qui declenche la
 * preview audio et clic court qui ouvre la page du beat.
 * @param props.beats Beats affiches dans la grille.
 * @param props.sound Gestionnaire de sons UI.
 * @param props.preview Lecteur de previews partage.
 * @param props.soundEnabled Etat global du son.
 */
export function BeatGrid({ beats, sound, preview, soundEnabled }: BeatGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;

    if (!soundEnabled) {
      preview.stop();
    }
  }, [preview, soundEnabled]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || beats.length === 0) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setClearColor(new THREE.Color("#060609"));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    const baseCameraZ = 9;
    camera.position.set(0, 0, baseCameraZ);

    const geometry = new THREE.PlaneGeometry(1, CARD_ASPECT, 12, 14);
    const placeholderCanvas = document.createElement("canvas");
    placeholderCanvas.width = 4;
    placeholderCanvas.height = 4;
    const placeholderCtx = placeholderCanvas.getContext("2d");

    if (placeholderCtx) {
      placeholderCtx.fillStyle = "#0c0c12";
      placeholderCtx.fillRect(0, 0, 4, 4);
    }

    const placeholderTexture = new THREE.CanvasTexture(placeholderCanvas);

    // Etat de navigation dans la grille (unites monde).
    const scroll = { x: 0.35, y: 0.2 };
    const target = { x: 0.35, y: 0.2 };
    const velocity = { x: 0, y: 0 };

    let cardWidth = 1;
    let cardHeight = CARD_ASPECT;
    let pitchX = 1.15;
    let pitchY = 1.45;
    let visibleWidth = 6;
    let visibleHeight = 4;
    let curveStrength = 0.03;
    let maxR2 = 20;
    let worldPerPixel = 0.01;

    /** Recalcule camera, tailles de cartes et courbure selon le viewport. */
    const layout = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;

      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      visibleHeight = 2 * baseCameraZ * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      visibleWidth = visibleHeight * camera.aspect;

      const targetColumns = THREE.MathUtils.clamp(width / 330, 1.9, 4.9);

      pitchX = visibleWidth / targetColumns;
      cardWidth = pitchX / (1 + GAP_RATIO);
      cardHeight = cardWidth * CARD_ASPECT;
      pitchY = cardHeight * (1 + GAP_RATIO);
      worldPerPixel = visibleHeight / height;
      curveStrength = 0.055 / (visibleWidth * 0.28);
      maxR2 = (visibleWidth * visibleWidth + visibleHeight * visibleHeight) * 0.34;
    };

    layout();

    // Cache LRU de textures de cartes + file de generation differee.
    const textureCache = new Map<number, TextureEntry>();
    const textureQueue: number[] = [];
    const queuedIndices = new Set<number>();

    const requestTexture = (beatIndex: number): TextureEntry => {
      const existing = textureCache.get(beatIndex);

      if (existing) {
        existing.lastUsed = performance.now();
        return existing;
      }

      const entry: TextureEntry = {
        texture: placeholderTexture,
        lastUsed: performance.now(),
        ready: false,
      };

      textureCache.set(beatIndex, entry);

      if (!queuedIndices.has(beatIndex)) {
        queuedIndices.add(beatIndex);
        textureQueue.push(beatIndex);
      }

      return entry;
    };

    const processTextureQueue = (activeIndices: Set<number>) => {
      let budget = 2;

      while (budget > 0 && textureQueue.length > 0) {
        const beatIndex = textureQueue.shift();

        if (beatIndex === undefined) {
          break;
        }

        queuedIndices.delete(beatIndex);
        const entry = textureCache.get(beatIndex);

        if (!entry || entry.ready) {
          continue;
        }

        const canvas = document.createElement("canvas");
        paintCardTexture(
          canvas,
          beats[beatIndex],
          TEXTURE_WIDTH,
          Math.round(TEXTURE_WIDTH * CARD_ASPECT),
        );

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        entry.texture = texture;
        entry.ready = true;
        budget -= 1;
      }

      if (textureCache.size > TEXTURE_CACHE_MAX) {
        const candidates = [...textureCache.entries()]
          .filter(([index]) => !activeIndices.has(index))
          .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

        while (textureCache.size > TEXTURE_CACHE_MAX && candidates.length > 0) {
          const [index, entry] = candidates.shift()!;

          if (entry.ready) {
            entry.texture.dispose();
          }

          textureCache.delete(index);
        }
      }
    };

    // Pool de meshes cartes reutilises pendant le scroll.
    const cardPool: CardMesh[] = [];
    const activeCards = new Map<string, CardMesh>();

    const makeCard = (): CardMesh => {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: placeholderTexture },
          uHover: { value: 0 },
          uReady: { value: 0 },
          uCurve: { value: curveStrength },
          uMaxR2: { value: maxR2 },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
      });

      const mesh = new THREE.Mesh(geometry, material) as CardMesh;
      mesh.userData = { beatIndex: -1, hoverTarget: 0, readyTarget: 0 };
      scene.add(mesh);

      return mesh;
    };

    /** Associe une cellule (i, j) de la grille infinie a un beat. */
    const beatIndexForCell = (cellX: number, cellY: number) => {
      const mixed = cellX * 7 + cellY * 13;

      return ((mixed % beats.length) + beats.length) % beats.length;
    };

    // Interactions pointeur : drag inertiel, survol, clic court.
    let dragging = false;
    let pointerDown = { x: 0, y: 0, time: 0 };
    let lastPointer = { x: 0, y: 0 };
    const pointerNdc = new THREE.Vector2(2, 2);
    const raycaster = new THREE.Raycaster();
    let hoveredCard: CardMesh | null = null;
    let hoverTimer = 0;

    const clearHover = () => {
      if (hoveredCard) {
        hoveredCard.userData.hoverTarget = 0;
        hoveredCard = null;
      }

      window.clearTimeout(hoverTimer);
      preview.stop();
      setNowPlaying(null);
      container.style.cursor = "grab";
    };

    const startPreviewForCard = (card: CardMesh) => {
      const beat = beats[card.userData.beatIndex];

      if (!beat || !soundEnabledRef.current || !beat.previewUrl) {
        return;
      }

      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => {
        preview.play(beat.previewUrl!);
        setNowPlaying({ title: beat.title, sellerName: beat.sellerName });
      }, HOVER_PREVIEW_DELAY_MS);
    };

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
      lastPointer = { x: event.clientX, y: event.clientY };
      velocity.x = 0;
      velocity.y = 0;
      container.style.cursor = "grabbing";
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();

      pointerNdc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      );

      if (!dragging) {
        return;
      }

      const deltaX = event.clientX - lastPointer.x;
      const deltaY = event.clientY - lastPointer.y;

      lastPointer = { x: event.clientX, y: event.clientY };

      // Le drag deplace la grille comme une carte : contenu suit le doigt.
      target.x -= deltaX * worldPerPixel;
      target.y += deltaY * worldPerPixel;
      velocity.x = -deltaX * worldPerPixel;
      velocity.y = deltaY * worldPerPixel;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }

      dragging = false;
      container.style.cursor = "grab";

      const dt = performance.now() - pointerDown.time;
      const distance =
        Math.abs(event.clientX - pointerDown.x) + Math.abs(event.clientY - pointerDown.y);

      if (distance < 8 && dt < 350 && hoveredCard) {
        const beat = beats[hoveredCard.userData.beatIndex];

        if (beat) {
          sound.blip(740, 0.07, 0.09);
          preview.stop();
          router.push(PAGE_PATHS.beats.detail.getHref(beat.slug));
        }
      }
    };

    const onPointerLeave = () => {
      dragging = false;
      pointerNdc.set(2, 2);
      clearHover();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      target.x += event.deltaX * worldPerPixel * 0.9;
      target.y -= event.deltaY * worldPerPixel * 0.9;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const step = pitchX * 0.6;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      const move = moves[event.key];

      if (move) {
        event.preventDefault();
        target.x += move[0];
        target.y += move[1];
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("keydown", onKeyDown);
    container.style.cursor = "grab";

    const resizeObserver = new ResizeObserver(layout);
    resizeObserver.observe(container);

    // Animation d'entree : zoom depuis l'arriere (sauf reduced motion).
    const entranceStart = performance.now();
    const entranceDuration = prefersReducedMotion ? 0 : 950;

    let frame = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) {
        return;
      }

      frame = requestAnimationFrame(tick);

      // Inertie apres relachement.
      if (!dragging) {
        target.x += velocity.x;
        target.y += velocity.y;
        velocity.x *= 0.94;
        velocity.y *= 0.94;
      }

      const ease = prefersReducedMotion ? 1 : 0.12;
      scroll.x += (target.x - scroll.x) * ease;
      scroll.y += (target.y - scroll.y) * ease;

      // Entree camera.
      const entranceElapsed = performance.now() - entranceStart;
      const entranceT = entranceDuration > 0 ? Math.min(1, entranceElapsed / entranceDuration) : 1;
      const entranceEase = 1 - Math.pow(1 - entranceT, 3);
      camera.position.z = baseCameraZ + (1 - entranceEase) * baseCameraZ * 0.45;

      // Fenetre de cellules visibles (+1 de marge).
      const halfW = visibleWidth / 2 + pitchX;
      const halfH = visibleHeight / 2 + pitchY;
      const minCellX = Math.floor((scroll.x - halfW) / pitchX);
      const maxCellX = Math.ceil((scroll.x + halfW) / pitchX);
      const minCellY = Math.floor((scroll.y - halfH) / pitchY);
      const maxCellY = Math.ceil((scroll.y + halfH) / pitchY);

      const neededKeys = new Set<string>();
      const activeIndices = new Set<number>();

      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
          const key = `${cellX},${cellY}`;
          neededKeys.add(key);

          let card = activeCards.get(key);

          if (!card) {
            card = cardPool.pop() ?? makeCard();
            card.visible = true;
            activeCards.set(key, card);

            const beatIndex = beatIndexForCell(cellX, cellY);
            card.userData.beatIndex = beatIndex;
            card.userData.hoverTarget = 0;

            const entry = requestTexture(beatIndex);
            card.material.uniforms.uMap.value = entry.texture;
            card.userData.readyTarget = entry.ready ? 1 : 0;
            card.material.uniforms.uReady.value = entry.ready ? 1 : 0;
          }

          const beatIndex = card.userData.beatIndex;
          activeIndices.add(beatIndex);

          const entry = textureCache.get(beatIndex);

          if (entry) {
            entry.lastUsed = performance.now();

            if (entry.ready && card.material.uniforms.uMap.value !== entry.texture) {
              card.material.uniforms.uMap.value = entry.texture;
              card.userData.readyTarget = 1;
            }
          }

          card.position.set(cellX * pitchX - scroll.x, cellY * pitchY - scroll.y, 0);

          const isHovered = card === hoveredCard;
          const hoverValue = card.material.uniforms.uHover.value as number;
          card.material.uniforms.uHover.value +=
            ((isHovered ? 1 : 0) - hoverValue) * 0.14;

          const readyValue = card.material.uniforms.uReady.value as number;
          card.material.uniforms.uReady.value +=
            (card.userData.readyTarget - readyValue) * 0.1;

          const scaleTarget = (isHovered ? 1.05 : 1) * cardWidth;
          const currentScale = card.scale.x || cardWidth;
          const nextScale = currentScale + (scaleTarget - currentScale) * 0.16;
          card.scale.set(nextScale, nextScale, 1);

          card.material.uniforms.uCurve.value = curveStrength;
          card.material.uniforms.uMaxR2.value = maxR2;
        }
      }

      for (const [key, card] of activeCards) {
        if (!neededKeys.has(key)) {
          if (card === hoveredCard) {
            clearHover();
          }

          card.visible = false;
          activeCards.delete(key);
          cardPool.push(card);
        }
      }

      processTextureQueue(activeIndices);

      // Survol par raycast (hors drag).
      if (!dragging && pointerNdc.x <= 1) {
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObjects([...activeCards.values()], false);
        const hit = (hits[0]?.object as CardMesh | undefined) ?? null;

        if (hit !== hoveredCard) {
          window.clearTimeout(hoverTimer);

          if (hoveredCard) {
            hoveredCard.userData.hoverTarget = 0;
          }

          hoveredCard = hit;

          if (hit) {
            sound.hoverBlip();
            container.style.cursor = "pointer";
            startPreviewForCard(hit);
          } else {
            container.style.cursor = "grab";
            preview.stop();
            setNowPlaying(null);
          }
        }
      }

      renderer.render(scene, camera);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(hoverTimer);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("wheel", onWheel);
      container.removeEventListener("keydown", onKeyDown);
      preview.stop();

      for (const card of [...activeCards.values(), ...cardPool]) {
        card.material.dispose();
        scene.remove(card);
      }

      for (const entry of textureCache.values()) {
        if (entry.ready) {
          entry.texture.dispose();
        }
      }

      placeholderTexture.dispose();
      geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [beats, preview, router, sound]);

  if (beats.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center font-mono text-xs uppercase tracking-[0.3em] text-white/50">
        Aucun beat publié pour le moment
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        aria-label="Grille des beats — glisser pour explorer, cliquer pour ouvrir un beat"
        className="h-full w-full outline-none"
        ref={containerRef}
        role="application"
        tabIndex={0}
      />
      {soundEnabled && nowPlaying ? (
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2 border border-white/15 bg-black/60 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-white/85 backdrop-blur">
          ▶ {nowPlaying.title} — {nowPlaying.sellerName}
        </div>
      ) : null}
    </div>
  );
}
