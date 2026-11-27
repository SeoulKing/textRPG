import type { HomeFurnitureCell, HomeFurnitureLayout, HomeFurnitureRotation } from "../game/schemas/game-state";
import type { Point } from "./model";

export type HomeFurnitureRect = { x: number; y: number; w: number; h: number };
type HomeFeature = Point & { id: string; radius: number; arrival?: Point };
type HomeFurnitureFixture = {
  assetId: string;
  name: string;
  footprint: { width: number; depth: number };
  canStore: boolean;
  layer: "floor" | "rug";
  defaultRotation: HomeFurnitureRotation;
  defaultCells: string[];
  defaultRectangles: HomeFurnitureRect[];
  collisionAtCenter: HomeFurnitureRect[];
  surfaceAtCenter?: HomeFurnitureRect;
  featureAtCenter?: HomeFeature;
};
export type HomeFurnitureCatalog = {
  gridVersion: number;
  origin: Point;
  cellSize: number;
  cells: Record<string, string>;
  reservedCells: string[];
  fixedRectangles: HomeFurnitureRect[];
  edgeWalls?: HomeFurnitureRect[];
  fixtures: Record<string, HomeFurnitureFixture>;
};
type HomeArea = {
  furniture: HomeFurnitureCatalog;
  bounds: HomeFurnitureRect;
  doors: HomeFeature[];
  spawn: Point;
};
const rotations: HomeFurnitureRotation[] = [0, 1, 2, 3];
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const navigationStep = 4;
const walkPadding = 3;
const cellKey = (x: number, z: number) => `${x}:${z}`;
function readCellKey(key: string): HomeFurnitureCell {
  const [x, z] = key.split(":").map(Number);
  return { x, z };
}

function rotate(point: Point, rotation: HomeFurnitureRotation): Point {
  switch (rotation) {
    case 0: return point;
    case 1: return { x: -point.y, y: point.x };
    case 2: return { x: -point.x, y: -point.y };
    case 3: return { x: point.y, y: -point.x };
  }
}

function furnitureBounds(catalog: HomeFurnitureCatalog, fixture: HomeFurnitureFixture, cell: HomeFurnitureCell,
  rotation: HomeFurnitureRotation): HomeFurnitureRect {
  const { origin, cellSize } = catalog;
  const { width, depth } = fixture.footprint;
  return {
    x: origin.x + cell.x * cellSize,
    y: origin.y + cell.z * cellSize,
    w: (rotation % 2 ? depth : width) * cellSize,
    h: (rotation % 2 ? width : depth) * cellSize,
  };
}

function placedGeometry(catalog: HomeFurnitureCatalog, fixture: HomeFurnitureFixture, cell: HomeFurnitureCell,
  rotation: HomeFurnitureRotation) {
  const bounds = furnitureBounds(catalog, fixture, cell, rotation);
  const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  const rectAt = (rect: HomeFurnitureRect) => {
    const start = rotate(rect, rotation);
    const end = rotate({ x: rect.x + rect.w, y: rect.y + rect.h }, rotation);
    return { x: center.x + Math.min(start.x, end.x), y: center.y + Math.min(start.y, end.y),
      w: Math.abs(start.x - end.x), h: Math.abs(start.y - end.y) };
  };
  const rectangles = fixture.collisionAtCenter.map(rectAt);
  const feature = fixture.featureAtCenter;
  const offset = feature && rotate(feature, rotation);
  return { bounds, rectangles, surface: fixture.surfaceAtCenter ? rectAt(fixture.surfaceAtCenter) : bounds,
    feature: feature && offset && { ...feature, x: center.x + offset.x, y: center.y + offset.y } };
}

function layoutGeometry(area: HomeArea, layout?: HomeFurnitureLayout, ignoredId?: string) {
  const { furniture } = area;
  const rectangles = [...furniture.fixedRectangles, ...(furniture.edgeWalls ?? [])];
  const removedFeatures = new Set<string>();
  const updatedFeatures: HomeFeature[] = [];
  for (const [id, fixture] of Object.entries(furniture.fixtures)) {
    const saved = layout?.overrides[id];
    if (id === ignoredId || (saved && saved.assetId === fixture.assetId)) {
      if (fixture.featureAtCenter) removedFeatures.add(fixture.featureAtCenter.id);
      if (id === ignoredId || saved?.kind !== "placed") continue;
      const placed = placedGeometry(furniture, fixture, saved.cell, saved.rotation);
      rectangles.push(...placed.rectangles);
      if (placed.feature) updatedFeatures.push(placed.feature);
    } else {
      rectangles.push(...fixture.defaultRectangles);
    }
  }
  const doors = area.doors.filter(door => !removedFeatures.has(door.id)).concat(updatedFeatures);
  return { rectangles, doors };
}

export function resolveHomeGeometry(area: HomeArea, layout?: HomeFurnitureLayout) {
  return layoutGeometry(area, layout);
}

export function homeFurnitureView(catalog: HomeFurnitureCatalog, layout?: HomeFurnitureLayout) {
  return {
    gridVersion: catalog.gridVersion,
    layoutRevision: layout?.layoutRevision ?? 0,
    origin: catalog.origin,
    cellSize: catalog.cellSize,
    cells: catalog.cells,
    placements: Object.entries(catalog.fixtures).map(([instanceId, fixture]) => {
      const { assetId, name, footprint, canStore, layer, defaultCells, defaultRotation } = fixture;
      const saved = layout?.overrides[instanceId];
      const placement = saved?.assetId === assetId ? saved : undefined;
      return { instanceId, assetId, name, footprint, canStore, layer, defaultCells,
        state: placement?.kind ?? "default",
        rotation: placement?.kind === "placed" ? placement.rotation : defaultRotation,
        ...(placement?.kind === "placed" ? { cell: placement.cell } : {}),
      };
    }),
  };
}

export function furnitureFixture(catalog: HomeFurnitureCatalog, id: string | undefined) {
  return id && Object.hasOwn(catalog.fixtures, id) ? catalog.fixtures[id] : undefined;
}

function footprintCells(rect: HomeFurnitureRect, catalog: HomeFurnitureCatalog) {
  const { origin, cellSize } = catalog;
  const x = (rect.x - origin.x) / cellSize;
  const z = (rect.y - origin.y) / cellSize;
  const cells: string[] = [];
  for (let dz = 0; dz < rect.h / cellSize; dz++) {
    for (let dx = 0; dx < rect.w / cellSize; dx++) cells.push(cellKey(x + dx, z + dz));
  }
  return cells;
}

function overlaps(a: HomeFurnitureRect, b: HomeFurnitureRect) {
  // An authored boundary can land a tiny floating-point distance inside a cell.
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > .001 &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > .001;
}

function containsSurface(footprint: HomeFurnitureRect, surface: HomeFurnitureRect) {
  const epsilon = .001;
  return surface.x >= footprint.x - epsilon && surface.y >= footprint.y - epsilon &&
    surface.x + surface.w <= footprint.x + footprint.w + epsilon &&
    surface.y + surface.h <= footprint.y + footprint.h + epsilon;
}

function contains(rect: HomeFurnitureRect, point: Point, padding: number) {
  return point.x >= rect.x - padding && point.x <= rect.x + rect.w + padding &&
    point.y >= rect.y - padding && point.y <= rect.y + rect.h + padding;
}

function accessCheck(area: HomeArea, fixed: HomeFurnitureRect[], player: Point) {
  // Match the 4px home path grid and movement's 3px clearance. Domain edges align
  // with the authored tile cells, while the extra tile admits partial walkable cells.
  const { origin, cells, cellSize } = area.furniture;
  const coordinates = Object.keys(cells).map(key => key.split(":").map(Number));
  const margin = cellSize;
  const left = origin.x + Math.min(...coordinates.map(([x]) => x)) * cellSize - margin;
  const top = origin.y + Math.min(...coordinates.map(([, y]) => y)) * cellSize - margin;
  const right = origin.x + (Math.max(...coordinates.map(([x]) => x)) + 1) * cellSize + margin;
  const bottom = origin.y + (Math.max(...coordinates.map(([, y]) => y)) + 1) * cellSize + margin;
  const columnCount = Math.ceil((right - left) / navigationStep);
  const rowCount = Math.ceil((bottom - top) / navigationStep);
  const total = columnCount * rowCount;
  const points = Array.from({ length: total }, (_, index) => ({
    x: left + (index % columnCount + .5) * navigationStep,
    y: top + (Math.floor(index / columnCount) + .5) * navigationStep,
  }));
  const fitsFixed = (point: Point) => contains(area.bounds, point, 0) &&
    !fixed.some(rect => contains(rect, point, walkPadding));
  const canCross = (from: Point, to: Point, fits: (point: Point) => boolean) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2));
    for (let step = 0; step <= steps; step++) {
      if (!fits({ x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps })) return false;
    }
    return true;
  };
  const fixedGround = points.map(fitsFixed);
  const fixedEdges = new Uint8Array(total);
  for (const [index, point] of points.entries()) {
    if (!fixedGround[index]) continue;
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    for (const [edge, [dx, dy]] of directions.entries()) {
      const nextColumn = column + dx;
      const nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= columnCount || nextRow < 0 || nextRow >= rowCount) continue;
      const neighbor = nextRow * columnCount + nextColumn;
      if (fixedGround[neighbor] && canCross(point, points[neighbor], fitsFixed)) fixedEdges[index] |= (1 << edge);
    }
  }

  return (additional: HomeFurnitureRect[]) => {
    const fitsAdditional = (point: Point) => !additional.some(rect => contains(rect, point, walkPadding));
    const fits = (point: Point) => fitsFixed(point) && fitsAdditional(point);
    if (!fits(area.spawn) || !fits(player)) return undefined;
    const reachable = new Uint8Array(total);
    const queue: number[] = [];
    for (const [index, point] of points.entries()) {
      if (Math.hypot(point.x - area.spawn.x, point.y - area.spawn.y) > navigationStep * 2 ||
          !canCross(area.spawn, point, fits)) continue;
      reachable[index] = 1;
      queue.push(index);
    }
    for (let i = 0; i < queue.length; i++) {
      const index = queue[i];
      const point = points[index];
      for (const [edge, [dx, dy]] of directions.entries()) {
        if (!(fixedEdges[index] & (1 << edge))) continue;
        const next = index + dx + dy * columnCount;
        if (reachable[next] || !canCross(point, points[next], fitsAdditional)) continue;
        reachable[next] = 1;
        queue.push(next);
      }
    }
    const canReach = (point: Point, radius = 0) => {
      if (!radius && canCross(area.spawn, point, fits)) return true;
      return queue.some(index => {
        const target = points[index];
        const distance = Math.hypot(target.x - point.x, target.y - point.y);
        return radius ? distance <= radius : distance <= navigationStep * 2 && canCross(target, point, fits);
      });
    };
    return {
      player: canReach(player),
      feature: (feature: HomeFeature) =>
        canReach(feature, feature.id === "home_sofa" || feature.id === "home_door" ? 0 : feature.radius),
    };
  };
}

export function homeFurnitureValidator(area: HomeArea, layout: HomeFurnitureLayout | undefined, player: Point, id: string) {
  const catalog = area.furniture;
  const fixture = catalog.fixtures[id];
  const isRug = fixture.layer === "rug";
  const { rectangles, doors } = layoutGeometry(area, layout, id);
  const reserved = new Set(catalog.reservedCells);
  const playerCell = cellKey(Math.floor((player.x - catalog.origin.x) / catalog.cellSize),
    Math.floor((player.y - catalog.origin.y) / catalog.cellSize));
  const occupied = new Set<string>();
  for (const [otherId, other] of Object.entries(catalog.fixtures)) {
    if (otherId === id || other.layer !== fixture.layer) continue;
    const saved = layout?.overrides[otherId];
    if (saved?.assetId === other.assetId && saved.kind === "stored") continue;
    const cells = saved?.assetId === other.assetId && saved.kind === "placed"
      ? footprintCells(furnitureBounds(catalog, other, saved.cell, saved.rotation), catalog)
      : other.defaultCells;
    for (const key of cells) occupied.add(key);
  }
  const checkAccess = isRug ? undefined : accessCheck(area, rectangles, player);
  const previous = layout?.overrides[id];
  const previousRects = previous?.assetId !== fixture.assetId ? fixture.defaultRectangles
    : previous.kind === "stored" ? [] : placedGeometry(catalog, fixture, previous.cell, previous.rotation).rectangles;
  const existingAccess = checkAccess?.(previousRects);
  // Existing authored arrangements may already wall off an interaction. Preserve
  // every usable approach, and require a moved interaction to be reachable.
  const requiredFeatures = doors.filter(feature => feature.id === "home_door" || existingAccess?.feature(feature));
  return {
    place(cell: HomeFurnitureCell, rotation: HomeFurnitureRotation) {
      const candidate = placedGeometry(catalog, fixture, cell, rotation);
      const cells = footprintCells(candidate.bounds, catalog);
      const room = catalog.cells[cells[0]];
      if (!room || cells.some(key => catalog.cells[key] !== room)) return "한 방의 바닥 안에 모두 놓아 주세요.";
      if (!isRug && cells.some(key => reserved.has(key))) return "출입구와 설비 앞은 비워 두어야 합니다.";
      // Full in-room tiles bound rugs. Older exports combine partitions and fixed fixtures.
      const hitsFixed = isRug && catalog.edgeWalls
        ? !containsSurface(candidate.bounds, candidate.surface)
        : catalog.fixedRectangles.some(rect => overlaps(isRug ? candidate.surface : candidate.bounds, rect));
      if (hitsFixed ||
          catalog.edgeWalls?.some(rect => overlaps(candidate.surface, rect))) return "벽이나 고정 설비와 겹칩니다.";
      if (cells.some(key => occupied.has(key))) return isRug ? "다른 러그와 겹칩니다." : "다른 가구와 겹칩니다.";
      if (!isRug && cells.includes(playerCell)) return "캐릭터가 서 있는 칸입니다.";
      if (checkAccess) {
        const access = checkAccess(candidate.rectangles);
        if (!access?.player || !requiredFeatures.every(access.feature) || candidate.feature && !access.feature(candidate.feature)) {
          return "출입구나 집 안 설비로 가는 길이 막힙니다.";
        }
      }
      return "";
    },
    store() {
      if (!fixture.canStore) return "이 가구는 집에서 계속 사용할 수 있어야 합니다.";
      return "";
    },
  };
}

export function previewHomeFurniture(area: HomeArea, layout: HomeFurnitureLayout | undefined, player: Point, id: string) {
  const validator = homeFurnitureValidator(area, layout, player, id);
  const anchors = Object.keys(area.furniture.cells).map(key => ({ key, cell: readCellKey(key) }));
  return {
    furnitureId: id,
    layoutRevision: layout?.layoutRevision ?? 0,
    rotations: rotations.map(rotation => ({
      rotation,
      cells: Object.fromEntries(anchors.map(({ key, cell }) => [key, validator.place(cell, rotation)])),
    })),
  };
}

export function migrateHomeFurniture(area: HomeArea, layout?: HomeFurnitureLayout): HomeFurnitureLayout | undefined {
  if (!layout || layout.gridVersion === area.furniture.gridVersion) return layout;
  const catalog = area.furniture;
  const overrides = Object.entries(layout.overrides);
  const placed = overrides.flatMap(([id, saved]) => {
    const fixture = furnitureFixture(catalog, id);
    if (fixture?.assetId !== saved.assetId || saved.kind !== "placed") return [];
    const cells = footprintCells(furnitureBounds(catalog, fixture, saved.cell, saved.rotation), catalog);
    return [{ id, fixture, saved, cells }];
  });
  const displaced = Object.entries(catalog.fixtures).filter(([id, fixture]) => {
    const saved = layout.overrides[id];
    if (saved && (saved.assetId !== fixture.assetId || fixture.canStore)) return false;
    return placed.some(other => other.id !== id && other.fixture.layer === fixture.layer &&
      fixture.defaultCells.some(key => other.cells.includes(key)));
  });

  const applySaved = (withheld: [string, HomeFurnitureFixture][]) => {
    const next: HomeFurnitureLayout = {
      gridVersion: catalog.gridVersion,
      layoutRevision: layout.layoutRevision + 1,
      overrides: {},
    };
    for (const [id, saved] of overrides) {
      const fixture = furnitureFixture(catalog, id);
      if (fixture?.assetId !== saved.assetId || fixture.canStore) {
        next.overrides[id] = { kind: "stored", assetId: saved.assetId };
      }
    }
    for (const [id, fixture] of withheld) {
      next.overrides[id] = { kind: "stored", assetId: fixture.assetId };
    }
    for (const { id, saved } of placed) {
      if (!homeFurnitureValidator(area, next, area.spawn, id).place(saved.cell, saved.rotation)) {
        next.overrides[id] = saved;
      }
    }
    return next;
  };

  // A changed default must yield to a player's prior placement wherever the placement still validates.
  const next = applySaved(displaced);
  const alternate = [];
  for (const [id, fixture] of displaced) {
    if (next.overrides[id]?.kind === "placed") continue;
    const cells = fixture.defaultCells.map(readCellKey);
    const anchor = { x: Math.min(...cells.map(cell => cell.x)), z: Math.min(...cells.map(cell => cell.z)) };
    const validator = homeFurnitureValidator(area, next, area.spawn, id);
    if (!validator.place(anchor, fixture.defaultRotation)) delete next.overrides[id];
    else alternate.push({ id, fixture, anchor });
  }
  const anchors = Object.keys(catalog.cells).map(readCellKey);
  alternate.sort((a, b) => Number(a.fixture.canStore) - Number(b.fixture.canStore));
  for (const { id, fixture, anchor } of alternate) {
    const distance = (cell: HomeFurnitureCell) => Math.abs(cell.x - anchor.x) + Math.abs(cell.z - anchor.z);
    const nearest = anchors.slice().sort((a, b) => distance(a) - distance(b) || a.z - b.z || a.x - b.x);
    const preferredRotations = [fixture.defaultRotation, ...rotations.filter(rotation => rotation !== fixture.defaultRotation)];
    const validator = homeFurnitureValidator(area, next, area.spawn, id);
    const placement = nearest.flatMap(cell => preferredRotations.map(rotation => ({ cell, rotation })))
      .find(({ cell, rotation }) => !validator.place(cell, rotation));
    if (placement) next.overrides[id] = { kind: "placed", assetId: fixture.assetId, ...placement };
    else if (!fixture.canStore) return applySaved([]);
  }
  return next;
}
