import * as THREE from 'three';
import gsap from 'gsap';
import { Pill } from './Pill.js';

const PILL_RADIUS = 0.8;
export const sceneOrder = ['duo', 'grid', 'tubes', 'mono'];

// Duo scene colors
const duoConfig = {
  palettes: [
    ['#321b23', '#4a1040', '#5900ff', '#ff4d00'],
    ['#82ee2b', '#4a1040', '#ff3300', '#5c0c92'],
  ],
  stops: [
    [0, 0.3, 0.6, 0.9],
    [0, 0.3, 0.6, 0.9],
  ],
  bends: [0.614, -0.3],
};

// Grid scene colors
const gridConfig = {
  palettes: [
    ['#003cf0', '#09b2fe', '#f024fe', '#0b0b0b'],
    ['#fe6b09', '#fe2429', '#7c040a', '#6d1c1c'],
    ['#0300c2', '#85fe00', '#0300c2', '#020822'],
    ['#fe6b09', '#fe2429', '#2e0007', '#fe2429'],
    ['#ff0a54', '#fe2429', '#ffb54d', '#fbff00'],
    ['#29ffdb', '#058f4f', '#28ac8c', '#ff7e29'],
    ['#fff410', '#fe385d', '#fb0952', '#24025f'],
    ['#6e0257', '#fe2429', '#fe2429', '#fe6b09'],
    ['#fe6b09', '#fe2429', '#3419e1', '#1c1717'],
    ['#85fe00', '#0300c2', '#79329f', '#212c54'],
    ['#fe6b09', '#fe2429', '#2912bf', '#4265f0'],
    ['#963636', '#fe4a00', '#fd35aa', '#731212'],
  ],
  stops: [
    [0.109, 0.44, 0.771, 1],
    [0, 0.186, 0.656, 1],
    [0, 0.198, 0.358, 0.885],
    [0, 0.137, 0.47, 1],
    [0.211, 0.504, 0.822, 1],
    [0.159, 0.394, 0.618, 0.72],
    [0, 0.186, 0.482, 0.885],
    [0, 0.555, 0.682, 0.809],
    [0, 0.326, 0.618, 1],
    [0, 0.389, 0.618, 0.898],
    [0, 0.164, 0.58, 1],
    [0, 0.224, 0.505, 1],
  ],
  bends: [
    -0.272, -0.73, -0.17, -0.73, 0.44, -0.068, 0.606, -0.552, 0.3, -0.628,
    -0.782, -0.654,
  ],
};

// Build duo scene (2 pills)
function buildDuoScene(container) {
  // Left pill
  const leftPill = new Pill(
    PILL_RADIUS,
    5,
    duoConfig.palettes[0],
    duoConfig.stops[0]
  );
  leftPill.setPosition(-PILL_RADIUS, 2).addTo(container);
  leftPill.uniforms.bend.value = duoConfig.bends[0];

  // Right pill
  const rightPill = new Pill(
    PILL_RADIUS,
    5,
    duoConfig.palettes[1],
    duoConfig.stops[1]
  );
  rightPill.setPosition(PILL_RADIUS, -2).addTo(container);
  rightPill.uniforms.bend.value = duoConfig.bends[1];

  const pills = [leftPill, rightPill];
  const animation = createDuoAnimation(pills, container);

  return { pills, columnGroups: [], animation };
}

// Build grid scene (6x2 pills)
function buildGridScene(container) {
  const COLS = 6;
  const TOP_Y = 5;
  const BOT_Y = -5;
  const SPACING_X_FACTOR = 2; // Pills touch horizontally (radius * 2)
  const meetingOffsets = [0.3, -1.5, 1.3, -1.0, -0.2, 2.0];

  const pills = [];
  const columnGroups = [];
  const spacingX = PILL_RADIUS * SPACING_X_FACTOR;
  const startX = -((COLS - 1) * spacingX) / 2;

  for (let col = 0; col < COLS; col++) {
    const x = startX + col * spacingX;
    const meetY = meetingOffsets[col];

    // Create a group for this column
    const colGroup = new THREE.Group();
    colGroup.position.set(x, meetY, 0);
    container.add(colGroup);
    columnGroups.push(colGroup);

    // Calculate pill lengths
    const EXTRA_LEN = 3;
    const topLen = TOP_Y - meetY - 2 * PILL_RADIUS + EXTRA_LEN;
    const botLen = meetY - BOT_Y - 2 * PILL_RADIUS + EXTRA_LEN;

    const topPillY = (TOP_Y - meetY) / 2 + EXTRA_LEN / 2;
    const botPillY = (BOT_Y - meetY) / 2 - EXTRA_LEN / 2;

    // Top pill
    const topIdx = col * 2;
    const topPill = new Pill(
      PILL_RADIUS,
      topLen,
      gridConfig.palettes[topIdx],
      gridConfig.stops[topIdx]
    );
    topPill.setPosition(0, topPillY).addTo(colGroup);
    topPill.uniforms.bend.value = gridConfig.bends[topIdx];
    pills.push(topPill);

    // Bottom pill
    const botIdx = col * 2 + 1;
    const botPill = new Pill(
      PILL_RADIUS,
      botLen,
      gridConfig.palettes[botIdx],
      gridConfig.stops[botIdx]
    );
    botPill.setPosition(0, botPillY).addTo(colGroup);
    botPill.uniforms.bend.value = gridConfig.bends[botIdx];
    pills.push(botPill);
  }

  const animation = createGridAnimation(columnGroups, pills, container, COLS);

  return { pills, columnGroups, animation };
}

// Build tubes scene (6x5 grid with random horizontal offsets)
// Pills are vertical, the whole group is rotated 90 degrees
function buildTubesScene(container) {
  const pills = [];
  const TUBE_PILL_RADIUS = 0.65;
  const TUBE_LENGTH_MAX = 3;
  const TUBE_LENGTH_MIN = TUBE_LENGTH_MAX * 0.5;
  const ROWS = 6;
  const TUBE_COLS = 5;
  const SPACING_X = TUBE_PILL_RADIUS * 2;

  // Use grid palettes/stops for random selection
  const allPalettes = gridConfig.palettes;
  const allStops = gridConfig.stops;
  const allBends = gridConfig.bends;

  const startX = -((ROWS - 1) * SPACING_X) / 2;

  for (let row = 0; row < ROWS; row++) {
    const direction = row % 2 === 0 ? 1 : -1;

    // Generate random lengths for this row
    const rowLengths = [];
    const rowPaletteIdxs = [];
    const rowStopsIdxs = [];
    const rowBendIdxs = [];
    for (let col = 0; col < TUBE_COLS; col++) {
      rowLengths.push(
        TUBE_LENGTH_MIN + Math.random() * (TUBE_LENGTH_MAX - TUBE_LENGTH_MIN)
      );
      rowPaletteIdxs.push(Math.floor(Math.random() * allPalettes.length));
      rowStopsIdxs.push(Math.floor(Math.random() * allStops.length));
      rowBendIdxs.push(Math.floor(Math.random() * allBends.length));
    }

    // Calculate positions so pills just touch
    const pillHeights = rowLengths.map((len) => len + TUBE_PILL_RADIUS * 2);
    const totalRowHeight = pillHeights.reduce((sum, h) => sum + h, 0);
    let currentY = totalRowHeight / 2;

    const rowOffsetY = (Math.random() - 0.5) * TUBE_LENGTH_MAX * 0.8;
    const x = startX + row * SPACING_X;

    // Create original pills for this row
    for (let col = 0; col < TUBE_COLS; col++) {
      const pillLength = rowLengths[col];
      const pillHeight = pillHeights[col];
      const y = currentY - pillHeight / 2 + rowOffsetY;
      currentY -= pillHeight;

      const pill = new Pill(
        TUBE_PILL_RADIUS,
        pillLength,
        allPalettes[rowPaletteIdxs[col]],
        allStops[rowStopsIdxs[col]]
      );
      pill.setPosition(x, y, 0).addTo(container);
      pill.uniforms.bend.value = allBends[rowBendIdxs[col]];
      pills.push(pill);
    }

    // Create duplicate pills for this row
    currentY = totalRowHeight / 2;
    for (let col = 0; col < TUBE_COLS; col++) {
      const pillLength = rowLengths[col];
      const pillHeight = pillHeights[col];
      const y =
        currentY - pillHeight / 2 + rowOffsetY - direction * totalRowHeight;
      currentY -= pillHeight;

      const pill = new Pill(
        TUBE_PILL_RADIUS,
        pillLength,
        allPalettes[rowPaletteIdxs[col]],
        allStops[rowStopsIdxs[col]]
      );
      pill.setPosition(x, y, 0).addTo(container);
      pill.uniforms.bend.value = allBends[rowBendIdxs[col]];
      pills.push(pill);
    }
  }

  const animation = createTubesAnimation(pills, container);

  return { pills, columnGroups: [], animation };
}

// Build mono scene
function buildMonoScene(container) {
  const pill = new Pill(
    PILL_RADIUS,
    5,
    duoConfig.palettes[0],
    duoConfig.stops[0]
  );
  pill.setPosition(0, 0).addTo(container);
  pill.uniforms.bend.value = duoConfig.bends[0];
  pill.mesh.scale.setScalar(0.7);
  pill.glowPlane.mesh.scale.setScalar(0.7);

  const animation = {
    play: () => {},
    pause: () => {},
    kill: () => {},
    restart: () => {},
  };

  return { pills: [pill], columnGroups: [], animation };
}

// Scene builders map
const sceneBuilders = {
  mono: buildMonoScene,
  duo: buildDuoScene,
  grid: buildGridScene,
  tubes: buildTubesScene,
};

// Build all scenes and return scenes object
export function buildAllScenes(pillGroup) {
  const scenes = {};

  sceneOrder.forEach((sceneName) => {
    const container = new THREE.Group();
    pillGroup.add(container);

    const { pills, columnGroups, animation } =
      sceneBuilders[sceneName](container);

    pills.forEach(
      (pill) => (pill.uniforms.waveRotation.value = pillGroup.rotation.z)
    );

    animation.pause();
    // Leave container visible for shader compilation render in initApp

    scenes[sceneName] = { container, pills, columnGroups, animation };
  });

  return scenes;
}

// Create duo scene animation (looping)
function createDuoAnimation(pills, pillGroup) {
  const SLIDE_DURATION = 2;
  const OFF_SCREEN = 20;
  const STAGGER = 0.5;
  const HOLD_DURATION = 2;
  const SCALE_START = 0.8;
  const SCALE_END = 1.2;

  const pillData = [];
  pills.forEach((pill, i) => {
    const restY = pill.mesh.position.y;
    const startY = restY + (i === 0 ? OFF_SCREEN : -OFF_SCREEN);
    const endY = restY + (i === 0 ? -OFF_SCREEN : OFF_SCREEN);
    pillData.push({ pill, restY, startY, endY, glow: pill.glowPlane });
  });

  // Create looping timeline
  const timeline = gsap.timeline({ repeat: -1, repeatDelay: 0.5 });

  // Set initial positions at time 0 (ensures correct state on restart)
  timeline.set(
    pillGroup.scale,
    { x: SCALE_START, y: SCALE_START, z: SCALE_START },
    0
  );
  pillData.forEach(({ pill, startY, glow }) => {
    timeline.set([pill.mesh.position, glow.mesh.position], { y: startY }, 0);
  });

  // Calculate intro end time (when both pills have arrived)
  const introEnd = STAGGER + SLIDE_DURATION;

  // Scale up during intro
  timeline.to(
    pillGroup.scale,
    {
      x: SCALE_END,
      y: SCALE_END,
      z: SCALE_END,
      duration: 5,
      ease: 'power1.out',
    },
    0
  );

  // Slide in both pills
  pillData.forEach(({ pill, restY, glow }, i) => {
    timeline.to(
      [pill.mesh.position, glow.mesh.position],
      { y: restY, duration: SLIDE_DURATION, ease: 'power2.out' },
      i * STAGGER
    );
  });

  // Hold in the middle
  const holdStart = introEnd;
  timeline.to({}, { duration: HOLD_DURATION }, holdStart);

  // Slide out
  const slideOutStart = holdStart + HOLD_DURATION;
  const outroEnd = slideOutStart + STAGGER + SLIDE_DURATION;

  // Scale down during outro
  timeline.to(
    pillGroup.scale,
    {
      x: SCALE_START,
      y: SCALE_START,
      z: SCALE_START,
      duration: outroEnd - slideOutStart,
      ease: 'power1.in',
    },
    slideOutStart
  );

  // Slide out both pills
  pillData.forEach(({ pill, endY, glow }, i) => {
    timeline.to(
      [pill.mesh.position, glow.mesh.position],
      { y: endY, duration: SLIDE_DURATION, ease: 'power2.in' },
      slideOutStart + i * STAGGER
    );
  });

  return {
    play: () => timeline.play(),
    pause: () => timeline.pause(),
    kill: () => timeline.kill(),
    restart: () => timeline.restart(),
  };
}

// Create grid scene animation (looping)
function createGridAnimation(columnGroups, pills, pillGroup, COLS) {
  const SLIDE_DURATION = 1.2;
  const OFF_SCREEN = 12;
  const STAGGER = 0.4;
  const HOLD_DURATION = 2;
  const SCALE_START = 0.4;
  const SCALE_END = 0.7;

  // Store rest positions and collect pill data per column
  const columnData = columnGroups.map((group, colIndex) => {
    const restY = group.position.y;
    const topPill = pills[colIndex * 2];
    const botPill = pills[colIndex * 2 + 1];
    // Store rest positions before modifying
    const topRestY = topPill.mesh.position.y;
    const botRestY = botPill.mesh.position.y;
    return {
      group,
      restY,
      topPill,
      botPill,
      topGlow: topPill.glowPlane,
      botGlow: botPill.glowPlane,
      topRestY,
      botRestY,
    };
  });

  // Randomize column order
  const columnOrder = [...Array(COLS).keys()];
  for (let i = columnOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [columnOrder[i], columnOrder[j]] = [columnOrder[j], columnOrder[i]];
  }

  // Create looping timeline
  const timeline = gsap.timeline({ repeat: -1 });

  // Set initial positions at time 0 (ensures correct state on restart)
  timeline.set(
    pillGroup.scale,
    { x: SCALE_START, y: SCALE_START, z: SCALE_START },
    0
  );
  columnData.forEach(
    ({ topPill, botPill, topGlow, botGlow, topRestY, botRestY }) => {
      timeline.set(
        [topPill.mesh.position, topGlow.mesh.position],
        { y: topRestY + OFF_SCREEN },
        0
      );
      timeline.set(
        [botPill.mesh.position, botGlow.mesh.position],
        { y: botRestY - OFF_SCREEN },
        0
      );
    }
  );

  // Scale up during intro
  const introEnd = COLS * STAGGER + SLIDE_DURATION;
  timeline.to(
    pillGroup.scale,
    {
      x: SCALE_END,
      y: SCALE_END,
      z: SCALE_END,
      duration: 5,
      ease: 'power1.out',
    },
    0
  );

  // Slide in: each column one at a time (randomized order)
  columnOrder.forEach((colIndex, i) => {
    const { topPill, botPill, topGlow, botGlow, topRestY, botRestY } =
      columnData[colIndex];
    const startTime = i * STAGGER;

    // Top pill slides down to rest
    timeline.to(
      [topPill.mesh.position, topGlow.mesh.position],
      { y: topRestY, duration: SLIDE_DURATION, ease: 'power2.out' },
      startTime
    );

    // Bottom pill slides up to rest
    timeline.to(
      [botPill.mesh.position, botGlow.mesh.position],
      { y: botRestY, duration: SLIDE_DURATION, ease: 'power2.out' },
      startTime
    );
  });

  // Hold in the middle
  const holdStart = introEnd;
  timeline.to({}, { duration: HOLD_DURATION }, holdStart);

  // Slide out: each column one at a time (same randomized order)
  const slideOutStart = holdStart + HOLD_DURATION;
  const outroEnd = slideOutStart + COLS * STAGGER + SLIDE_DURATION;

  // Scale down during outro
  timeline.to(
    pillGroup.scale,
    {
      x: SCALE_START,
      y: SCALE_START,
      z: SCALE_START,
      duration: outroEnd - slideOutStart,
      ease: 'power1.in',
    },
    slideOutStart
  );

  columnOrder.forEach((colIndex, i) => {
    const { topPill, botPill, topGlow, botGlow, topRestY, botRestY } =
      columnData[colIndex];
    const startTime = slideOutStart + i * STAGGER;

    // Top pill slides up off screen
    timeline.to(
      [topPill.mesh.position, topGlow.mesh.position],
      { y: topRestY + OFF_SCREEN, duration: SLIDE_DURATION, ease: 'power2.in' },
      startTime
    );

    // Bottom pill slides down off screen
    timeline.to(
      [botPill.mesh.position, botGlow.mesh.position],
      { y: botRestY - OFF_SCREEN, duration: SLIDE_DURATION, ease: 'power2.in' },
      startTime
    );
  });

  return {
    play: () => timeline.play(),
    pause: () => timeline.pause(),
    kill: () => timeline.kill(),
    restart: () => timeline.restart(),
  };
}

// Create tubes scene animation (continuous scrolling)
function createTubesAnimation(pills, pillGroup) {
  const SCALE_START = 1;
  const SCALE_END = 0.6;
  const ZOOM_DURATION = 3;

  // Set wave amplitude and disable glow
  pills.forEach((pill) => {
    pill.uniforms.waveAmp.value = 0.9;
    pill.glowPlane.uniforms.glowIntensity.value = 0;
  });

  const TUBE_COLS = 5;
  const PILLS_PER_ROW = TUBE_COLS * 2; // 5 original + 5 duplicates
  const ROWS = 6;
  const DURATION = 12; // seconds to travel full column length

  // Zoom out animation
  const zoomTween = gsap.fromTo(
    pillGroup.scale,
    { x: SCALE_START, y: SCALE_START, z: SCALE_START },
    {
      x: SCALE_END,
      y: SCALE_END,
      z: SCALE_END,
      duration: ZOOM_DURATION,
      ease: 'power2.out',
    }
  );


  // Group pills by row (each row has 10 pills: 5 original + 5 duplicates)
  const rowPills = [];
  for (let row = 0; row < ROWS; row++) {
    rowPills.push(pills.slice(row * PILLS_PER_ROW, (row + 1) * PILLS_PER_ROW));
  }

  // Calculate row height from the first 5 pills (originals) only
  const rowData = rowPills.map((rowGroup, rowIndex) => {
    const direction = rowIndex % 2 === 0 ? 1 : -1;

    // Use only original pills (first 5) to calculate height
    const originalPills = rowGroup.slice(0, TUBE_COLS);
    let minY = Infinity,
      maxY = -Infinity;
    originalPills.forEach((pill) => {
      const pillHalfHeight = (pill.length + pill.radius * 2) / 2;
      minY = Math.min(minY, pill.mesh.position.y - pillHalfHeight);
      maxY = Math.max(maxY, pill.mesh.position.y + pillHalfHeight);
    });
    const rowHeight = maxY - minY;

    return { rowGroup, direction, rowHeight };
  });

  // Create tweens for each row
  const tweens = [];
  rowData.forEach(({ rowGroup, direction, rowHeight }) => {
    // Collect all position objects for this row (pill mesh + glow plane)
    // Includes both original and duplicate pills
    const targets = [];
    rowGroup.forEach((pill) => {
      targets.push(pill.mesh.position);
      targets.push(pill.glowPlane.mesh.position);
    });

    // Move by full row height to match dupe offset, then repeat from start
    const travelDistance = rowHeight;

    const tween = gsap.to(targets, {
      y: `+=${direction * travelDistance}`,
      duration: DURATION,
      ease: 'none',
      repeat: -1,
    });
    tweens.push(tween);
  });

  return {
    play: () => {
      zoomTween.play();
      tweens.forEach((t) => t.play());
    },
    pause: () => {
      zoomTween.pause();
      tweens.forEach((t) => t.pause());
    },
    kill: () => {
      zoomTween.kill();
      tweens.forEach((t) => t.kill());
    },
    restart: () => {
      zoomTween.restart();
      tweens.forEach((t) => t.restart());
    },
  };
}
